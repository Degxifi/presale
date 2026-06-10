import { Check } from "lucide-react";
import { trustSignals } from "../_lib/content";

export function TrustBar() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
      {trustSignals.map((signal) => (
        <span
          key={signal}
          className="inline-flex items-center gap-2 text-sm text-muted"
        >
          <Check className="size-4 text-accent" />
          {signal}
        </span>
      ))}
    </div>
  );
}
