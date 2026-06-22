import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Presale Ended",
  description:
    "The $DEGX presale has ended. Continue in the Degxifi app.",
};

const APP_URL = "https://app.degxifi.com";

/**
 * The presale has ended. The landing page now points everyone to the app
 * instead of the buy flow. (The /claim route stays live so presale buyers can
 * still claim their $DEGX.)
 */
export default function PresaleEndedPage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      {/* subtle backdrop glow, mirrors the landing hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-80 max-w-3xl rounded-full bg-accent/10 blur-3xl"
      />
      <Container className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          The <span className="text-accent">$DEGX</span> presale has ended
        </h1>

        <p className="mt-6 max-w-xl text-balance text-lg text-muted">
          Thank you to everyone who took part. Please go to the app to continue.
        </p>

        <div className="mt-10">
          <a href={APP_URL} className={buttonVariants({ size: "lg" })}>
            Go to the app
          </a>
        </div>

        <p className="mt-6 text-sm text-muted">
          Bought in the presale?{" "}
          <a href="/claim" className="font-semibold text-accent hover:underline">
            Claim your $DEGX
          </a>
          .
        </p>
      </Container>
    </main>
  );
}
