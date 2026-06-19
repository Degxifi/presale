"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { formatTokens } from "@/lib/solana/distribute";

type Row = {
  wallet: string;
  distributed: string;
  sigs: string[];
  inflight: boolean;
  updatedAt: string;
};
type Data = {
  decimals: number;
  cluster: string;
  totals: { walletsPaid: number; distributedTotal: string; txCount: number };
  rows: Row[];
};

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const rel = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function DistributionsTable() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/distributions", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to load distributions.");
      setData(d as Data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copy = (s: string) => {
    navigator.clipboard?.writeText(s);
    setCopied(s);
    setTimeout(() => setCopied((c) => (c === s ? null : c)), 1200);
  };

  const cluster = data?.cluster ?? "";
  const solscan = (kind: "account" | "tx", id: string) =>
    `https://solscan.io/${kind}/${id}${cluster ? `?cluster=${cluster}` : ""}`;

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((r) => r.wallet.toLowerCase().includes(needle)) : list;
  }, [data, q]);

  const dec = data?.decimals ?? 0;
  const cards = data
    ? [
        { label: "Wallets paid", value: data.totals.walletsPaid.toLocaleString() },
        { label: "Distributed", value: formatTokens(BigInt(data.totals.distributedTotal), dec) },
        { label: "Transactions", value: data.totals.txCount.toLocaleString() },
      ]
    : [];

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Distributions</h2>
          <p className="mt-1 text-sm text-muted">
            Every wallet paid so far, with the on-chain transaction that delivered it
            {cluster ? ` (${cluster})` : ""}.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {data && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="font-display text-xl font-bold tabular-nums">{c.value}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {data && data.rows.length > 0 && (
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
      )}

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {loading && !data && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      )}
      {data && data.rows.length === 0 && !loading && (
        <p className="mt-6 text-sm text-muted">No distributions yet — release a tranche to see it here.</p>
      )}

      {data && data.rows.length > 0 && (
        <div className="mt-3 max-h-[480px] overflow-y-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Wallet</th>
                <th className="px-4 py-2.5 text-right font-medium">Distributed</th>
                <th className="px-4 py-2.5 font-medium">Transactions</th>
                <th className="px-4 py-2.5 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.wallet} className="border-t border-border/60 hover:bg-surface-2/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={solscan("account", r.wallet)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-foreground hover:text-accent"
                        title={r.wallet}
                      >
                        {short(r.wallet)}
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
                      {r.inflight && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                          sending…
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {formatTokens(BigInt(r.distributed), dec)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {r.sigs.length === 0 && <span className="text-xs text-muted">—</span>}
                      {r.sigs.map((sig, i) => (
                        <a
                          key={sig}
                          href={solscan("tx", sig)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-mono text-xs text-muted hover:text-accent"
                          title={sig}
                        >
                          {r.sigs.length > 1 ? `#${i + 1}` : sig.slice(0, 6)}
                          <ExternalLink className="size-3" />
                        </a>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted">{rel(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
