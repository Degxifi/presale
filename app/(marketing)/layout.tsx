import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AnnouncementBanner } from "@/components/marketing/announcement-banner";
import { getSettings } from "@/lib/db/queries";
import { getPresalePhase, resolvePresaleStart } from "@/lib/presale";

/**
 * Public marketing site shell — wraps the landing page and every marketing
 * route (how-it-works, tokenomics, faq, quests, u/[ref]).
 * Route group `(marketing)` is omitted from the URL.
 */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();
  const phase = getPresalePhase(resolvePresaleStart(settings.presaleStart));

  if (phase === "ended") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-center">
        <h1 className="font-display text-5xl font-bold tracking-tight text-foreground sm:text-7xl">
          Presale ended
        </h1>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AnnouncementBanner />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
