import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Centered max-width page gutter. */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-6", className)} {...props} />
  );
}
