"use client";

import { useState } from "react";
import { TIERS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TierId } from "@/types/presale";

type Overrides = Partial<Record<TierId, "paused" | "closed">>;

export function TierControls({ initial }: { initial: Overrides }) {
  const [overrides, setOverrides] = useState<Overrides>(initial ?? {});
  const [saving, setSaving] = useState(false);

  const update = async (next: Overrides) => {
    setOverrides(next);
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tierOverrides: next }),
    });
    setSaving(false);
  };

  const set = (id: TierId, val: "paused" | "closed" | null) => {
    const next: Overrides = { ...overrides };
    if (val === null) delete next[id];
    else next[id] = val;
    update(next);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Tier controls</h2>
      <p className="mt-1 text-sm text-muted">
        &quot;Auto&quot; follows raise progress. Pause or close to override.
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
                    ["Closed", "closed"],
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
    </div>
  );
}
