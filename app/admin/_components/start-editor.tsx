"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRESALE } from "@/lib/constants";
import { Button } from "@/components/ui/button";

/** datetime-local <-> ISO helpers (local time in the input, ISO/UTC stored). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function StartEditor({
  initial,
  effective,
}: {
  initial: string | null;
  /** The resolved start the site actually uses (DB → env → built-in default). */
  effective: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(toLocalInput(initial));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (presaleStart: string | null) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ presaleStart }),
      });
      if (!res.ok) {
        setError(`Save failed (${res.status}) — check your session and retry.`);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh(); // re-resolve the effective start shown below
    } catch {
      setError("Save failed (network error) — retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Presale timer</h2>
      <p className="mt-1 text-sm text-muted">
        Start date/time — the {PRESALE.durationDays}-day countdown ends
        automatically and updates site-wide.
      </p>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-4 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      <p className="mt-2 text-xs text-muted" suppressHydrationWarning>
        Effective start: {new Date(effective).toLocaleString()}. Resetting does
        NOT cancel the launch — the site falls back to the built-in default. To
        delay, save a later date; to stop buying, close the tiers.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={saving || !value}
          onClick={() => save(new Date(value).toISOString())}
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save start"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setValue("");
            save(null);
          }}
        >
          Reset to default
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
