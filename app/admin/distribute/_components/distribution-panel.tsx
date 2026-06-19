"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { type DistributionPlan, formatTokens } from "@/lib/solana/distribute";
import { Button } from "@/components/ui/button";
import { ImportPanel } from "./import-panel";

const PRESETS = [40, 60, 80, 100]; // cumulative unlock % (TGE 40, then vesting)

const fmtErr = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Setup + monitoring for $DEGX distribution. Read-only for the payout itself —
 * the actual transfers are run from the CLI (`bun run distribute`), which signs
 * with the treasury key in the environment. This panel sets the mint, imports
 * the master list, and shows the plan; the Distributions view below shows what
 * has been paid. No wallet is connected here and nothing is sent from the browser.
 */
export function DistributionPanel() {
  const [unlock, setUnlock] = useState(40);
  const [plan, setPlan] = useState<DistributionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingMint, setSavingMint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mintRef = useRef<HTMLInputElement>(null);

  const loadPlan = useCallback(async (pct: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/distribute?unlock=${pct}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load plan.");
      setPlan(data as DistributionPlan);
    } catch (e) {
      setError(fmtErr(e));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => loadPlan(unlock));
    return () => cancelAnimationFrame(raf);
  }, [unlock, loadPlan]);

  const saveMint = useCallback(async () => {
    const v = mintRef.current?.value.trim() ?? "";
    setSavingMint(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ degxMint: v || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save mint.");
      await loadPlan(unlock);
    } catch (e) {
      setError(fmtErr(e));
    } finally {
      setSavingMint(false);
    }
  }, [loadPlan, unlock]);

  const totals = plan?.totals;
  const owedTotal = totals ? BigInt(totals.owedTotal) : 0n;
  const dec = plan?.decimals ?? 0;
  const cards = totals
    ? [
        { label: "Allocated (100%)", value: formatTokens(BigInt(totals.allocatedTotal), dec) },
        { label: "Distributed", value: formatTokens(BigInt(totals.distributedTotal), dec) },
        { label: `Owed @ ${unlock}%`, value: formatTokens(owedTotal, dec) },
        { label: "Recipients", value: totals.recipientCount.toLocaleString() },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Token distribution</h1>
        <p className="mt-1 text-sm text-muted">
          Set the mint and import the master list here, then release tranches from the CLI. This
          dashboard configures and monitors — the script signs and sends. Idempotent: no wallet is
          ever paid twice, and an interrupted run resumes safely.
        </p>
      </div>

      {/* mint editor (admin-entered, stored in settings — not env) */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-semibold">$DEGX token mint</h2>
        <p className="mt-1 text-sm text-muted">
          The SPL mint address from your Jupiter Studio launch.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            ref={mintRef}
            key={plan?.mint ?? "none"}
            defaultValue={plan?.mint ?? ""}
            placeholder="Mint address (base58)"
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <Button variant="secondary" onClick={saveMint} disabled={savingMint}>
            {savingMint ? "Saving…" : "Save mint"}
          </Button>
        </div>
        {plan && !plan.configured && (
          <p className={`mt-2 text-sm ${plan.error ? "text-danger" : "text-muted"}`}>
            {plan.error ?? "Enter the mint to begin."}
          </p>
        )}
      </div>

      {/* master list import — what the distribution pays from */}
      <ImportPanel />

      {plan?.configured && (
        <>
          {plan.transferFeeBps > 0 && (
            <div className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
              ⚠ This is a Token-2022 mint with a {plan.transferFeeBps / 100}% transfer fee —
              recipients receive less than the amounts shown (amounts are pre-fee).
            </div>
          )}

          {/* tranche selector (view only — changes which unlock the plan shows) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Cumulative unlock:</span>
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setUnlock(p)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  unlock === p
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted hover:text-foreground"
                }`}
              >
                {p === 40 ? "TGE 40%" : `${p}%`}
              </button>
            ))}
            {loading && <Loader2 className="size-4 animate-spin text-muted" />}
          </div>

          {/* summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-border bg-surface p-5">
                <div className="font-display text-2xl font-bold tabular-nums">{c.value}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted">{c.label}</div>
              </div>
            ))}
          </div>

          {/* release a tranche — CLI only */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-semibold">Release a tranche</h2>
            <p className="mt-1 text-sm text-muted">
              Run from the CLI — it signs with the treasury key in the environment (no wallet
              prompts) and is exactly-once. Preview first, then execute.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed text-foreground">
              {`# preview — no writes, no sends
bun run distribute -- --unlock ${unlock} --dry

# release the ${unlock}% tranche
bun run distribute -- --unlock ${unlock} --yes`}
            </pre>
            <p className="mt-2 text-xs text-muted">
              {owedTotal > 0n
                ? `${formatTokens(owedTotal, dec)} $DEGX owed to ${totals?.recipientCount} wallet(s) at ${unlock}%.`
                : "Everyone is at this unlock — nothing to send."}
            </p>
          </div>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
