import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container } from "./container";

export function Section({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("py-16 sm:py-28", className)} {...props}>
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" ? "items-center text-center" : "items-start",
        className,
      )}
    >
      {eyebrow && (
        <span className="text-sm font-medium uppercase tracking-wider text-accent">
          {eyebrow}
        </span>
      )}
      <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className={cn("text-balance text-muted", align === "center" && "max-w-2xl")}>
          {description}
        </p>
      )}
    </div>
  );
}
