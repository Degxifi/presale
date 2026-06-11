import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Members Only",
  description:
    "The $DEGX presale is reserved for Degxifi members. Open it from your Degxifi dashboard.",
};

const APP_URL = "https://app.degxifi.com";

/**
 * Public face of the gated presale: anyone arriving without a valid access
 * cookie ends up here instead of the purchase flow.
 */
export default function RestrictedPage() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* subtle backdrop glow, mirrors the landing hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-80 max-w-3xl rounded-full bg-accent/10 blur-3xl"
      />
      <Container className="flex flex-1 flex-col items-center justify-center py-20 text-center">
        <Badge variant="accent">
          <span className="size-1.5 rounded-full bg-accent glow-accent" />
          Invite-only presale
        </Badge>

        <h1 className="mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          The <span className="text-accent">$DEGX</span> presale is reserved for
          Degxifi members
        </h1>

        <p className="mt-6 max-w-xl text-balance text-lg text-muted">
          Access is granted through your personal link in the Degxifi dashboard.
          Open the app and tap <span className="font-semibold">Claim Your Spot</span>{" "}
          on the presale card.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <a href={APP_URL} className={buttonVariants({ size: "lg" })}>
            Open Degxifi
          </a>
          <a
            href={`${APP_URL}/store`}
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            Get a package to qualify
          </a>
        </div>

        <p className="mt-6 text-sm text-muted">
          D-Protocol &amp; D-VIP members receive presale access automatically.
        </p>
      </Container>
    </main>
  );
}
