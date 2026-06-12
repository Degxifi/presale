import type { Metadata } from "next";
import { PRESALE, TIERS, TOKEN } from "@/lib/constants";
import { num, numCompact, tokenPrice, usd } from "@/lib/format";
import { Section, SectionHeader } from "@/components/ui/section";
import { StatsStrip } from "../_components/stats-strip";

export const metadata: Metadata = {
  title: "Tokenomics",
  description:
    "$DEGX supply breakdown, presale tier allocation, and graduation market-cap targets.",
};

const supplyRows = [
  { label: "Total supply", value: `${num(TOKEN.totalSupply)} $DEGX` },
  {
    label: "Presale allocation",
    value: `${num(TOKEN.presaleAllocation)} $DEGX (25%)`,
  },
  { label: "Total raise target", value: usd(PRESALE.totalRaiseTarget) },
  { label: "Graduation market cap", value: usd(TOKEN.graduationMarketCap) },
];

export default function TokenomicsPage() {
  return (
    <>
      <Section>
        <SectionHeader
          eyebrow="Tokenomics"
          title="Supply & allocation"
          description="Transparent numbers — the same figures power the whole site."
        />
        <div className="mt-12">
          <StatsStrip />
        </div>
        <div className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {supplyRows.map((r) => (
                <tr key={r.label} className="bg-surface">
                  <td className="px-4 py-3 text-muted">{r.label}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {r.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section className="pt-0">
        <SectionHeader eyebrow="Tier Allocation" title="Three tiers, 250M $DEGX" />
        <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Tokens</th>
                <th className="px-4 py-3 text-right font-medium">Raise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {TIERS.map((t) => (
                <tr key={t.id} className="bg-surface">
                  <td className="px-4 py-3 font-medium">
                    Tier {t.id} — {t.name}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">
                    {tokenPrice(t.price)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {numCompact(t.tokensAvailable)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {usd(t.raiseTarget)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

    </>
  );
}
