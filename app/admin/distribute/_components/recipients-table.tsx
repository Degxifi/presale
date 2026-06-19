"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Search } from "lucide-react";
import { formatTokens } from "@/lib/solana/distribute";

type Recipient = { wallet: string; owed: string; allocated: string };

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

/**
 * "Who receives what" — the per-wallet breakdown for the selected tranche, so the
 * admin can review exactly who gets paid (and how much) BEFORE running the script.
 * Pure view over the plan the panel already loaded (no extra fetch).
 */
export function RecipientsTable({
  recipients,
  decimals,
  unlock,
  cluster,
}: {
  recipients: Recipient[];
  decimals: number;
  unlock: number;
  cluster: string;
}) {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (s: string) => {
    navigator.clipboard?.writeText(s);
    setCopied(s);
    setTimeout(() => setCopied((c) => (c === s ? null : c)), 1200);
  };
  const solscan = (w: string) =>
    `https://solscan.io/account/${w}${cluster ? `?cluster=${cluster}` : ""}`;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? recipients.filter((r) => r.wallet.toLowerCase().includes(needle)) : recipients;
  }, [recipients, q]);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Who receives what</h2>
          <p className="mt-1 text-sm text-muted">
            Every wallet and exactly what it will receive at {unlock}% if you run the script now.
          </p>
        </div>
        <span className="rounded-lg border border-border px-2.5 py-1 text-sm tabular-nums text-muted">
          {recipients.length.toLocaleString()} recipient{recipients.length === 1 ? "" : "s"}
        </span>
      </div>

      {recipients.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No one is owed at {unlock}% — either nothing is imported yet, or this tranche is fully paid.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
            <Search className="size-4 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by wallet…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
            {q && <span className="text-xs text-muted">{rows.length}</span>}
          </div>

          <div className="mt-3 max-h-120 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Wallet</th>
                  <th className="px-4 py-2.5 text-right font-medium">Allocation (100%)</th>
                  <th className="px-4 py-2.5 text-right font-medium">Receives @ {unlock}%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.wallet} className="border-t border-border/60 hover:bg-surface-2/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={solscan(r.wallet)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-foreground hover:text-accent"
                          title={r.wallet}
                        >
                          {short(r.wallet)}
                          <ExternalLink className="size-3 opacity-60" />
                        </a>
                        <button
                          onClick={() => copy(r.wallet)}
                          className="text-muted hover:text-foreground"
                          title="Copy address"
                        >
                          {copied === r.wallet ? (
                            <Check className="size-3.5 text-success" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                      {formatTokens(BigInt(r.allocated), decimals)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {formatTokens(BigInt(r.owed), decimals)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
