import { howItWorksSteps } from "../_lib/content";

export function HowItWorksSection() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {howItWorksSteps.map((step, i) => (
        <div
          key={step.title}
          className="rounded-2xl border border-border bg-surface p-5"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 font-display text-sm font-bold text-accent">
            {i + 1}
          </span>
          <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
          <p className="mt-1.5 text-sm text-muted">{step.description}</p>
        </div>
      ))}
    </div>
  );
}
