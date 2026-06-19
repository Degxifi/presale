"use client";

import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

type Summary = {
  parsed: number;
  confirmed: number;
  pending: number;
  totalUsdc: string;
  distinctConfirmedWallets: number;
  totalConfirmedDegx: string;
  tgeFortyDegx: string;
};
type Apply = {
  total: number;
  inserted: number;
  updated: number;
  orphans: number;
  deleted: number;
  existingBefore: number;
};
type Issue = { line: number; reason: string };

const n = (s: string | number) => Number(s).toLocaleString("en-US");

/**
 * Loads the master contributor list (CSV/JSON export shape) into `contributions`
 * — the table the distribution reads. Preview (dry-run) is mandatory before a
 * write, and "replace" makes the table exactly the file.
 */
export function ImportPanel() {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [preview, setPreview] = useState<{ summary: Summary; apply: Apply } | null>(null);
  const [issues, setIssues] = useState<{ list: Issue[]; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setPreview(null);
    setIssues(null);
    setError(null);
    setDone(false);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setContent(await f.text());
    setFileName(f.name);
    reset();
  };

  const call = async (dryRun: boolean) => {
    if (!content.trim()) {
      setError("Choose a CSV or JSON file first.");
      return;
    }
    setBusy(dryRun ? "preview" : "commit");
    setError(null);
    setIssues(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, dryRun, replace }),
      });
      const data = await res.json();
      if (res.status === 422) {
        setIssues({ list: data.issues ?? [], count: data.issueCount ?? 0 });
        setPreview(null);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      if (dryRun) setPreview({ summary: data.summary, apply: data.apply });
      else {
        setDone(true);
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const s = preview?.summary;
  const a = preview?.apply;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-semibold">Master contributor list</h2>
      <p className="mt-1 text-sm text-muted">
        Import the finalized presale export (CSV or JSON). This becomes the source of truth the
        distribution pays from — allocations are taken from the file and validated against the tier
        formula.
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm hover:text-foreground">
          <Upload className="size-4" />
          <span>{fileName || "Choose CSV / JSON…"}</span>
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => {
              setReplace(e.target.checked);
              reset();
            }}
            className="size-4 rounded border-border"
          />
          Replace — make the table exactly this file (removes rows not in it)
        </label>
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={() => call(true)} disabled={busy !== null || !content}>
          {busy === "preview" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Previewing…
            </>
          ) : (
            "Preview"
          )}
        </Button>
        <Button onClick={() => call(false)} disabled={busy !== null || !preview || done}>
          {busy === "commit" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Importing…
            </>
          ) : a ? (
            `Import ${n(a.total)} rows`
          ) : (
            "Import"
          )}
        </Button>
      </div>

      {issues && (
        <div className="mt-4 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm">
          <p className="font-medium text-danger">
            {n(issues.count)} row{issues.count === 1 ? "" : "s"} failed validation — nothing was
            imported. Fix the file and re-preview.
          </p>
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs text-muted">
            {issues.list.map((it, i) => (
              <li key={i}>
                line {it.line}: {it.reason}
              </li>
            ))}
            {issues.count > issues.list.length && <li>…and {n(issues.count - issues.list.length)} more</li>}
          </ul>
        </div>
      )}

      {s && a && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Rows", value: n(s.parsed) },
              { label: "Confirmed", value: n(s.confirmed) },
              { label: "Pending (skipped)", value: n(s.pending) },
              { label: "Total USDC", value: `$${n(s.totalUsdc)}` },
              { label: "Distinct wallets", value: n(s.distinctConfirmedWallets) },
              { label: "Allocated (100%)", value: n(s.totalConfirmedDegx) },
              { label: "TGE 40%", value: n(s.tgeFortyDegx) },
              {
                label: "DB change",
                value: `+${n(a.inserted)} / ~${n(a.updated)}${replace ? ` / −${n(a.deleted)}` : ""}`,
              },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="font-display text-lg font-bold tabular-nums">{c.value}</div>
                <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted">{c.label}</div>
              </div>
            ))}
          </div>
          {replace && a.orphans > 0 && (
            <p className="text-sm text-amber-500">
              ⚠ {n(a.orphans)} existing row(s) are not in this file and will be deleted on import.
            </p>
          )}
          <p className="text-xs text-muted">
            Preview only — nothing has been written yet. Click “Import” to apply.
          </p>
        </div>
      )}

      {done && <p className="mt-3 text-sm text-success">Imported ✓ — refreshing the plan…</p>}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
