import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quests",
  description:
    "Complete $DEGX quests — social, on-chain, and referral tasks — to earn points toward your token allocation.",
};

export default function QuestsPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">Quests</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Earn points toward allocation via social, on-chain, and referral tasks.
        Quest board builds in the marketing phase.
      </p>
    </section>
  );
}
