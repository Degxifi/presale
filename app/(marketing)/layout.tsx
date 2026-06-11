import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AnnouncementBanner } from "@/components/marketing/announcement-banner";

/**
 * Public marketing site shell — wraps the landing page and every marketing
 * route (how-it-works, tokenomics, faq, quests, u/[ref]).
 * Route group `(marketing)` is omitted from the URL.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AnnouncementBanner />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
