import { degxAllocationFloor, getTier } from "@/lib/presale";
import { isLikelyTxSignature, isLikelyWalletAddress } from "@/lib/solana/config";
import type { TierId } from "@/types/presale";

/**
 * Master contributor-list importer (admin). Parses the canonical presale export
 * — the SAME shape as /api/admin/export — as CSV or JSON, validates every row,
 * and (separately, in queries.ts) upserts it into `contributions` keyed by the
 * on-chain tx signature. The distribution reads `contributions`, so importing
 * this file is what "wire prod to use the master list" means.
 *
 * Allocations are NEVER trusted blindly: each row's degx_allocated must equal
 * floor(degxForUsdc(usdc, tierPrice)) — the same formula the distribution uses —
 * or the row is flagged. That guarantees what we distribute equals the file.
 */

export type ParsedRow = {
  wallet: string;
  tier: number;
  amountUsdc: string; // numeric column wants a string
  txSig: string;
  status: "confirmed" | "pending";
  memberUid: string | null;
  degxAllocated: string | null;
  createdAt: Date | null;
};

export type ImportIssue = { line: number; reason: string };

export type ImportSummary = {
  parsed: number;
  confirmed: number;
  pending: number;
  totalUsdc: string;
  distinctConfirmedWallets: number;
  totalConfirmedDegx: string; // whole tokens (floor per row, summed) — 100%
  tgeFortyDegx: string; // 40% per-wallet floor — the TGE tranche
};

export type ParseResult = {
  ok: boolean; // false if any row failed validation
  rows: ParsedRow[]; // valid rows only
  issues: ImportIssue[];
  summary: ImportSummary;
};

/** RFC4180-ish field splitter: handles quoted fields and "" escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const COLUMN_ALIASES: Record<string, keyof RawRow> = {
  wallet: "wallet",
  tier: "tier",
  amount_usdc: "amountUsdc",
  usdc: "amountUsdc",
  amount: "amountUsdc",
  tx_sig: "txSig",
  tx_signature: "txSig",
  signature: "txSig",
  status: "status",
  member_uid: "memberUid",
  degx_allocated: "degxAllocated",
  degx: "degxAllocated",
  created_at: "createdAt",
  timestamp: "createdAt",
  "timestamp (utc)": "createdAt",
};

type RawRow = {
  wallet?: string;
  tier?: string;
  amountUsdc?: string;
  txSig?: string;
  status?: string;
  memberUid?: string;
  degxAllocated?: string;
  createdAt?: string;
};

/** Parse a Postgres-style timestamp ("2026-06-13 09:00:28.884222+00") to Date. */
function parseTs(s: string | undefined): Date | null {
  if (!s) return null;
  let iso = s.trim().replace(" ", "T");
  iso = iso.replace(/(\.\d{3})\d+/, "$1"); // microseconds → milliseconds
  iso = iso.replace(/([+-]\d{2})$/, "$1:00"); // +00 → +00:00
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toRawRows(content: string): { raw: RawRow[]; format: "csv" | "json" } {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const arr = Array.isArray(data) ? data : [data];
    const raw = arr.map((o: Record<string, unknown>) => {
      const r: RawRow = {};
      for (const [k, v] of Object.entries(o)) {
        const key = COLUMN_ALIASES[k.trim().toLowerCase()];
        if (key) r[key] = v == null ? undefined : String(v);
      }
      return r;
    });
    return { raw, format: "json" };
  }
  // CSV
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { raw: [], format: "csv" };
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const idx: Partial<Record<keyof RawRow, number>> = {};
  header.forEach((h, i) => {
    const key = COLUMN_ALIASES[h];
    if (key && idx[key] === undefined) idx[key] = i;
  });
  const raw = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const r: RawRow = {};
    for (const k of Object.keys(idx) as (keyof RawRow)[]) {
      const v = cells[idx[k]!];
      if (v !== undefined && v !== "") r[k] = v;
    }
    return r;
  });
  return { raw, format: "csv" };
}

const i0 = (s: string) => BigInt(s.split(".")[0] || "0"); // exact floor of a positive decimal string

/** Parse + validate a master list. Returns valid rows, per-line issues, totals. */
export function parseContributions(content: string): ParseResult {
  let raw: RawRow[];
  try {
    ({ raw } = toRawRows(content));
  } catch (e) {
    return {
      ok: false,
      rows: [],
      issues: [{ line: 0, reason: `Could not parse file: ${e instanceof Error ? e.message : e}` }],
      summary: emptySummary(),
    };
  }

  const rows: ParsedRow[] = [];
  const issues: ImportIssue[] = [];
  const seenSigs = new Set<string>();

  raw.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const fail = (reason: string) => issues.push({ line, reason });

    if (!isLikelyWalletAddress(r.wallet)) return fail(`invalid wallet "${r.wallet ?? ""}"`);
    const tier = Number(r.tier);
    if (![1, 2, 3].includes(tier)) return fail(`invalid tier "${r.tier ?? ""}"`);
    const usdc = Number(r.amountUsdc);
    if (!Number.isFinite(usdc) || usdc <= 0) return fail(`invalid amount_usdc "${r.amountUsdc ?? ""}"`);
    if (!isLikelyTxSignature(r.txSig)) return fail(`invalid tx_sig "${r.txSig ?? ""}"`);
    const status = (r.status ?? "confirmed").toLowerCase();
    if (status !== "confirmed" && status !== "pending") return fail(`invalid status "${r.status}"`);
    if (seenSigs.has(r.txSig!)) return fail(`duplicate tx_sig "${r.txSig}"`);

    // Consistency guard: the file's degx_allocated must floor to the same value
    // the distribution computes from (usdc, tier), via EXACT integer math.
    // Protects against a file built with different prices silently changing
    // allocations — without false-flagging IEEE-754 boundary cases (180/0.00036).
    const computed = degxAllocationFloor(usdc, getTier(tier as TierId).price);
    if (r.degxAllocated != null && r.degxAllocated !== "") {
      if (BigInt(r.degxAllocated.split(".")[0] || "0") !== computed)
        return fail(
          `degx_allocated ${r.degxAllocated} ≠ formula ${computed} (usdc ${usdc}, tier ${tier})`,
        );
    }

    seenSigs.add(r.txSig!);
    rows.push({
      wallet: r.wallet!,
      tier,
      amountUsdc: String(usdc),
      txSig: r.txSig!,
      status: status as "confirmed" | "pending",
      memberUid: r.memberUid ?? null,
      degxAllocated: r.degxAllocated ?? String(computed),
      createdAt: parseTs(r.createdAt),
    });
  });

  return { ok: issues.length === 0, rows, issues, summary: summarize(rows) };
}

function emptySummary(): ImportSummary {
  return {
    parsed: 0,
    confirmed: 0,
    pending: 0,
    totalUsdc: "0",
    distinctConfirmedWallets: 0,
    totalConfirmedDegx: "0",
    tgeFortyDegx: "0",
  };
}

function summarize(rows: ParsedRow[]): ImportSummary {
  const confirmed = rows.filter((r) => r.status === "confirmed");
  // Per-wallet whole-token allocation = sum of floor(degx) over confirmed rows.
  const perWallet = new Map<string, bigint>();
  let totalUsdcCents = 0n;
  for (const r of rows) totalUsdcCents += BigInt(Math.round(Number(r.amountUsdc) * 100));
  for (const r of confirmed) {
    const tokens = i0(r.degxAllocated ?? "0");
    perWallet.set(r.wallet, (perWallet.get(r.wallet) ?? 0n) + tokens);
  }
  let totalDegx = 0n;
  for (const v of perWallet.values()) totalDegx += v;
  // 40% TGE total — computed on the aggregate so it matches how the distribution
  // plan floors `owed` (per-wallet owed is exact in base units; the only floor is
  // at display). Keeps this preview number identical to "Owed @40%" in the panel.
  const tge = (totalDegx * 4000n) / 10000n;
  return {
    parsed: rows.length,
    confirmed: confirmed.length,
    pending: rows.length - confirmed.length,
    totalUsdc: (Number(totalUsdcCents) / 100).toFixed(2),
    distinctConfirmedWallets: perWallet.size,
    totalConfirmedDegx: totalDegx.toString(),
    tgeFortyDegx: tge.toString(),
  };
}
