import { PROFIT_SCENARIOS, TOKEN } from "@/lib/constants";
import { percent, tokenPrice, usdCompact } from "@/lib/format";

export function RoiScenarios() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-left text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Market cap</th>
            <th className="px-4 py-3 font-medium">Price / token</th>
            <th className="px-4 py-3 text-right font-medium">Tier 1</th>
            <th className="px-4 py-3 text-right font-medium">Tier 2</th>
            <th className="px-4 py-3 text-right font-medium">Tier 3</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {PROFIT_SCENARIOS.map((s) => {
            const isGrad = s.marketCap === TOKEN.graduationMarketCap;
            return (
              <tr key={s.marketCap} className="bg-surface">
                <td className="px-4 py-3 font-medium">
                  {usdCompact(s.marketCap)}
                  {isGrad && (
                    <span className="ml-2 text-xs text-accent">graduation</span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted">
                  {tokenPrice(s.pricePerToken)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-accent">
                  {percent(s.roi[1])}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-accent">
                  {percent(s.roi[2])}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-accent">
                  {percent(s.roi[3])}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
