import { getSession, isAdmin, isAdminConfigured } from "@/lib/admin/guard";
import { getAllContributions, getRawStats, getSettings } from "@/lib/db/queries";
import {
  computeTierProgress,
  degxForUsdc,
  getPresalePhase,
  getTier,
  resolvePresaleStart,
} from "@/lib/presale";
import { num, shortWallet, usd } from "@/lib/format";
import { PRESALE_WALLET_ADDRESS, isPresaleConfigured } from "@/lib/solana/config";
import { buttonVariants } from "@/components/ui/button";
import { AdminShell } from "./_components/admin-shell";
import { AutoRefresh } from "./_components/auto-refresh";
import { AdminLogin } from "./_components/admin-login";
import { AdminUsers } from "./_components/admin-users";
import { AnnouncementEditor } from "./_components/announcement-editor";
import { StartEditor } from "./_components/start-editor";
import { TierControls } from "./_components/tier-controls";
import type { TierId } from "@/types/presale";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) {
    return (
      <AdminShell>
        <AdminLogin configured={isAdminConfigured()} />
      </AdminShell>
    );
  }
  if (!isAdmin(session)) {
    return (
      <AdminShell email={session.user.email}>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Your account doesn&apos;t have admin access yet — ask an existing admin
          to grant it.
        </div>
      </AdminShell>
    );
  }

  // Authed admin: load live data.
  const [{ raisedByTier, participantCount }, settings, all] = await Promise.all([
    getRawStats(),
    getSettings(),
    getAllContributions(),
  ]);
  const startsAt = resolvePresaleStart(settings.presaleStart);
  const phase = getPresalePhase(startsAt);
  const tiers = computeTierProgress(raisedByTier, phase, settings.tierOverrides);
  const totalRaised = raisedByTier[1] + raisedByTier[2] + raisedByTier[3];
  const latest = all.slice().reverse().slice(0, 50);

  const summary = [
    { label: "Total raised", value: usd(totalRaised) },
    { label: "Participants", value: num(participantCount) },
    { label: "Phase", value: phase },
    { label: "Contributions", value: num(all.length) },
  ];

  return (
    <AdminShell email={session.user.email}>
      <div className="space-y-8">
        {/* Live: re-fetches the server-rendered presale data on an interval. */}
        <AutoRefresh />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-surface p-5">
              <div className="font-display text-2xl font-bold capitalize tabular-nums">
                {s.value}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wider text-muted">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-semibold">Tiers</h2>
          <div className="mt-4 space-y-3">
            {tiers.map((t) => {
              const tier = getTier(t.tierId);
              const pct = Math.min(100, (t.raised / t.target) * 100);
              return (
                <div
                  key={t.tierId}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                >
                  <span className="w-44 shrink-0">
                    Tier {t.tierId} — {tier.name}
                  </span>
                  <div className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-32 shrink-0 text-right tabular-nums text-muted">
                    {usd(t.raised)} / {usd(t.target)}
                  </span>
                  <span className="w-16 shrink-0 text-right capitalize">
                    {t.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <StartEditor initial={settings.presaleStart} effective={startsAt} />
          <AnnouncementEditor initial={settings.announcement} />
        </div>
        <TierControls initial={settings.tierOverrides} />

        <AdminUsers />

        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-semibold">Participants</h2>
            <a
              href="/api/admin/export"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Export CSV
            </a>
          </div>
          <p className="mt-1 text-sm text-muted">
            Presale wallet:{" "}
            <span className="font-mono">
              {isPresaleConfigured() ? shortWallet(PRESALE_WALLET_ADDRESS) : "not set"}
            </span>{" "}
            · Start: {startsAt ?? "not set"}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">Wallet</th>
                  <th className="py-2 pr-4 font-medium">Tier</th>
                  <th className="py-2 pr-4 text-right font-medium">USDC</th>
                  <th className="py-2 pr-4 text-right font-medium">$DEGX</th>
                  <th className="py-2 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {latest.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted">
                      No contributions yet.
                    </td>
                  </tr>
                ) : (
                  latest.map((c) => {
                    const usdc = Number(c.amountUsdc);
                    const degx = Math.round(
                      degxForUsdc(usdc, getTier(c.tier as TierId).price),
                    );
                    return (
                      <tr key={c.txSig}>
                        <td className="py-2 pr-4 font-mono">{shortWallet(c.wallet)}</td>
                        <td className="py-2 pr-4">{c.tier}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{usd(usdc)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{num(degx)}</td>
                        <td className="py-2 text-right text-muted">
                          {c.createdAt.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {all.length > 50 && (
            <p className="mt-3 text-xs text-muted">
              Showing latest 50 of {num(all.length)}. Full data in CSV.
            </p>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
