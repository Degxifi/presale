import type { ReactNode } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { LogoutButton } from "./logout-button";

export function AdminShell({
  email,
  children,
}: {
  email?: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b border-border bg-surface/40">
        <Container className="flex h-16 items-center justify-between">
          <Link
            href="/admin"
            className="font-display text-lg font-bold tracking-tight"
          >
            <span className="text-accent">$</span>DEGX{" "}
            <span className="text-muted">Admin</span>
          </Link>
          {email && (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-muted sm:inline">{email}</span>
              <LogoutButton />
            </div>
          )}
        </Container>
      </header>
      <main className="py-10">
        <Container>{children}</Container>
      </main>
    </>
  );
}
