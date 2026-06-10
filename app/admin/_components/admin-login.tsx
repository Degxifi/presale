"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AdminLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!configured) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        Admin auth isn&apos;t configured. Set <code>DATABASE_URL</code>,{" "}
        <code>BETTER_AUTH_SECRET</code>, and <code>ADMIN_EMAIL</code>, then run{" "}
        <code>pnpm db:migrate</code>.
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res =
        mode === "signin"
          ? await signIn.email({ email, password })
          : await signUp.email({ email, password, name: "Admin" });
      if (res.error) {
        setError(res.error.message ?? "Authentication failed.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-center font-display text-2xl font-bold tracking-tight">
        Admin access
      </h1>
      <form
        onSubmit={submit}
        className="mt-6 space-y-3 rounded-2xl border border-border bg-surface p-6"
      >
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "…" : mode === "signin" ? "Sign in" : "Create admin"}
        </Button>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "create" : "signin")}
          className="w-full text-center text-xs text-muted transition-colors hover:text-foreground"
        >
          {mode === "signin"
            ? "First time? Create the admin account"
            : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
