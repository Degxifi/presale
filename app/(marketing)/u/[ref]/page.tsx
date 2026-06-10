import type { Metadata } from "next";

// Next.js 16: dynamic route params are async (a Promise).
type ReferralParams = Promise<{ ref: string }>;

export async function generateMetadata({
  params,
}: {
  params: ReferralParams;
}): Promise<Metadata> {
  const { ref } = await params;
  return {
    title: `Join via ${ref}`,
    description: `You've been invited to the $DEGX presale by ${ref}.`,
    // Per-user "flex" Open Graph card builds at this segment's opengraph-image.tsx
  };
}

export default async function ReferralLandingPage({
  params,
}: {
  params: ReferralParams;
}) {
  const { ref } = await params;
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">You&apos;ve been invited</h1>
      <p className="mt-4 text-muted">
        Referral code{" "}
        <span className="font-mono text-foreground">{ref}</span> · the flex card
        + two-sided referral flow build in the marketing phase.
      </p>
    </section>
  );
}
