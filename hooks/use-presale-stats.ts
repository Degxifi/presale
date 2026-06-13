"use client";

import { useEffect, useState } from "react";
import type { PresaleStats } from "@/types/presale";

/** Polls live presale stats from /api/presale/stats. Returns null until loaded. */
export function usePresaleStats(pollMs = 12_000): PresaleStats | null {
  const [stats, setStats] = useState<PresaleStats | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        // No `no-store`: let the CDN/browser honor the endpoint's short
        // s-maxage so a launch-day crowd is served from cache, not the DB.
        const res = await fetch("/api/presale/stats");
        if (!res.ok) return;
        const data = (await res.json()) as PresaleStats;
        if (active) setStats(data);
      } catch {
        // keep the last good value on transient errors
      }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return stats;
}
