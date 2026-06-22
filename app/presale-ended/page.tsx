import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Presale Ended",
  description: "The $DEGX presale has ended. Continue in the Degxifi app.",
  robots: { index: false, follow: false },
};

const APP_URL = "https://app.degxifi.com";

/**
 * Full-screen "Presale ended" takeover. The middleware rewrites every public
 * route to this page now that the presale is over, so the rest of the site is
 * sealed. Renders under the root layout only (no marketing header/footer).
 */
export default function PresaleEndedPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 -z-10 mx-auto h-80 max-w-3xl rounded-full bg-accent/10 blur-3xl"
      />

      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">
        $DEGX
      </p>

      <h1 className="mt-4 text-balance text-5xl font-bold tracking-tight sm:text-7xl">
        Presale ended
      </h1>

      <p className="mt-6 max-w-md text-balance text-lg text-muted">
        The $DEGX presale is over. Everything continues in the Degxifi app.
      </p>

      <div className="mt-10">
        <a href={APP_URL} className={buttonVariants({ size: "lg" })}>
          Go to the app
        </a>
      </div>
    </main>
  );
}
