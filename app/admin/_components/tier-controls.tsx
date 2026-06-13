"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIERS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TierId } from "@/types/presale";

type Overrides = Partial<Record<TierId, "paused" | "closed">>;

export function TierControls({ initial }: { initial: Overrides }) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Overrides>(initial ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The UI state changes ONLY after the server confirms the write — this is a
  // real-money control, so a failed save must never look applied.
  const set = async (id: TierId, val: "paused" | "closed" | null) => {
    const next: Overrides = { ...overrides };
    if (val === null) delete next[id];
    else next[id] = val;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tierOverrides: next }),
      });
      if (!res.ok) {
        setError(
          `Save failed (${res.status}) — the tier was NOT changed. Check your session and retry.`,
        );
        return;
      }
      setOverrides(next);
      router.refresh();
    } catch {
      setError("Save failed (network error) — the tier was NOT changed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Tier controls</h2>
      <p className="mt-1 text-sm text-muted">
        &quot;Auto&quot; follows the launch timer. Pause or close to override.
      </p>
      <div className="mt-4 space-y-3">
        {TIERS.map((t) => {
          const cur = overrides[t.id] ?? null;
          return (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">
                Tier {t.id} — {t.name}
              </span>
              <div className="flex gap-1">
                {(
                  [
                    ["Auto", null],
                    ["Paused", "paused"],
                    ["Sold Out", "closed"],
                  ] as const
                ).map(([label, val]) => {
                  const active = cur === val;
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={saving}
                      onClick={() => set(t.id, val)}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "border border-border text-muted hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
