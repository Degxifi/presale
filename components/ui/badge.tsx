import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "accent" | "gold" | "outline";

const variants: Record<Variant, string> = {
  default: "bg-surface-2 text-muted",
  accent: "border border-accent/20 bg-accent/10 text-accent",
  gold: "border border-gold/20 bg-gold/10 text-gold",
  outline: "border border-border text-muted",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
