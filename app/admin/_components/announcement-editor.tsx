"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AnnouncementEditor({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (announcement: string | null) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ announcement }),
      });
      if (!res.ok) {
        setError(`Save failed (${res.status}) — check your session and retry.`);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setError("Save failed (network error) — retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Announcement banner</h2>
      <p className="mt-1 text-sm text-muted">Shown site-wide. Clear to hide it.</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Tier 1 is now open!"
        className="mt-4 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => save(value.trim() || null)} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setValue("");
            save(null);
          }}
          disabled={saving}
        >
          Clear
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
