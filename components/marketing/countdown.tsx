"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Parts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
};

function getParts(targetMs: number): Parts {
  const diff = Math.max(0, targetMs - Date.now());
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: diff <= 0,
  };
}

function fmtDate(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
}

/**
 * 7-day-style countdown. `target` is an ISO string (presale end) or null when
 * unconfigured. Ticks every second; persists across reloads (time-based, not a
 * stored counter); shows an ended state at zero. Honest by construction.
 */
export function Countdown({
  target,
  verb = "Ends",
  doneLabel = "Presale ended",
}: {
  target: string | null;
  verb?: string;
  doneLabel?: string;
}) {
  const [parts, setParts] = useState<Parts | null>(null);

  useEffect(() => {
    if (!target) return;
    const t = new Date(target).getTime();
    if (Number.isNaN(t)) return;
    const tick = () => setParts(getParts(t));
    // schedule (not a synchronous setState in the effect body) + 1s interval
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [target]);

  if (!target) {
    return <p className="text-sm text-muted">Start date to be announced</p>;
  }

  if (parts?.done) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium">
        <span className="size-2 rounded-full bg-accent" /> {doneLabel}
      </div>
    );
  }

  const items = [
    { label: "Days", value: parts?.days },
    { label: "Hours", value: parts?.hours },
    { label: "Mins", value: parts?.minutes },
    { label: "Secs", value: parts?.seconds },
  ];

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 sm:gap-3">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-surface font-display text-2xl font-bold tabular-nums sm:h-16 sm:w-16 sm:text-3xl">
              {it.value === undefined ? "--" : String(it.value).padStart(2, "0")}
            </div>
            <span className="mt-1.5 text-[11px] uppercase tracking-wider text-muted">
              {it.label}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        {verb} {fmtDate(target, "UTC")} UTC · {fmtDate(target)} your time
      </p>
    </div>
  );
}

/**
 * Compact, inline countdown to a START time (e.g. "1d 23:45:12"), bold by
 * default. Used on the Tier-1 card's "Opens at launch" state. Renders nothing
 * once the target has passed (the tier flips to active on its own).
 */
export function LaunchCountdown({
  target,
  className,
}: {
  target: string | null;
  className?: string;
}) {
  const [parts, setParts] = useState<Parts | null>(null);

  useEffect(() => {
    if (!target) return;
    const t = new Date(target).getTime();
    if (Number.isNaN(t)) return;
    const tick = () => setParts(getParts(t));
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [target]);

  if (!target || !parts || parts.done) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
  return (
    <span className={cn("font-display font-bold tabular-nums", className)}>
      {parts.days > 0 ? `${parts.days}d ` : ""}
      {clock}
    </span>
  );
}
