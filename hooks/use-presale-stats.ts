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
        const res = await fetch("/api/presale/stats", { cache: "no-store" });
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
