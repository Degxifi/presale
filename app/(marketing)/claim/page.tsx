import { Container } from "@/components/ui/container";
import { ClaimPanel } from "./_components/claim-panel";

export const metadata = {
  title: "Claim $DEGX — Degxifi",
  description: "Claim your $DEGX presale allocation.",
};

export default function ClaimPage() {
  return (
    <Container className="py-20 sm:py-28">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Claim your <span className="text-accent">$DEGX</span>
        </h1>
        <p className="mt-4 text-balance text-muted">
          Connect the wallet you bought with to claim your $DEGX.
        </p>
        <div className="mt-10">
          <ClaimPanel />
        </div>
      </div>
    </Container>
  );
}
