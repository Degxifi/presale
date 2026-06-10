"use client";

import { useEffect, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "motion/react";
import { PRESALE } from "@/lib/constants";
import { num, usdCompact } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import { usePresaleStats } from "@/hooks/use-presale-stats";

/** Animated "total raised" counter — reads real on-chain-backed stats only. */
export function RaisedCounter() {
  const stats = usePresaleStats();
  const target = stats?.totalRaised ?? 0;

  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useMotionValueEvent(mv, "change", (v) => setDisplay(v));
  useEffect(() => {
    const controls = animate(mv, target, { duration: 0.8, ease: "easeOut" });
    return () => controls.stop();
  }, [target, mv]);

  const pct = Math.min(100, (target / PRESALE.totalRaiseTarget) * 100);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center">
      <div className="font-display text-4xl font-bold tabular-nums text-gold sm:text-5xl">
        ${num(Math.round(display))}
      </div>
      <p className="mt-1 text-sm text-muted">
        raised of {usdCompact(PRESALE.totalRaiseTarget)} goal
      </p>
      <Progress value={pct} className="mt-4" />
    </div>
  );
}
