import { PRESALE, TOKEN } from "@/lib/constants";
import { numCompact, usdCompact } from "@/lib/format";

/** Static, factual presale stats (not live counters) — safe pre-launch. */
export function StatsStrip() {
  const stats = [
    { label: "Raise target", value: usdCompact(PRESALE.totalRaiseTarget) },
    {
      label: "Presale allocation",
      value: `${numCompact(TOKEN.presaleAllocation)} $DEGX`,
    },
    {
      label: "Graduation cap",
      value: usdCompact(TOKEN.graduationMarketCap),
    },
    { label: "Duration", value: `${PRESALE.durationDays} days` },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-2xl border border-border bg-surface p-5 text-center"
        >
          <div className="font-display text-2xl font-bold tabular-nums text-gold">
            {s.value}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wider text-muted">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
