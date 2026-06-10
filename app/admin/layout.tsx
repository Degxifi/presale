import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false }, // never index the admin area
};

/**
 * Admin shell — password-gated dashboard (brief §4.5). Auth gate, nav, and the
 * admin component library (app/admin/_components, app/admin/_lib) wire up in
 * Phase 5. Separate from the (marketing) shell on purpose.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-background">{children}</div>;
}
