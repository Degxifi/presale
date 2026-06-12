"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps this server-rendered admin page live: periodically calls
 * router.refresh(), which re-runs the server component and re-fetches its data
 * (total raised, participants, phase, contributions, per-tier amounts, the
 * contributions table) without a full reload or losing client state. Matches
 * the public site's 12s stats poll. Renders nothing.
 */
export function AutoRefresh({ intervalMs = 12_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
