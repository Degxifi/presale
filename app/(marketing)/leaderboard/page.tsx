import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "Top $DEGX referrers and contributors. Compete, climb the ranks, and earn bonus allocation.",
};

export default function LeaderboardPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">Leaderboard</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Top referrers &amp; contributors (gamified social proof). Live table +
        my-rank builds in the marketing phase.
      </p>
    </section>
  );
}
