import { TIERS } from "@/lib/constants";
import { tokenPrice } from "@/lib/format";

export function FinalCta() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-10 text-center sm:p-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-24 mx-auto h-64 max-w-xl rounded-full bg-accent/10 blur-3xl"
      />
      <h2 className="relative text-balance text-3xl font-bold tracking-tight sm:text-4xl">
        Lock the lowest $DEGX price before it&apos;s gone
      </h2>
      <p className="relative mt-4 text-muted">
        Tier 1 starts at {tokenPrice(TIERS[0].price)}. The price only steps up
        from here.
      </p>
    </div>
  );
}
