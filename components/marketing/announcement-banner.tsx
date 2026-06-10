"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { usePresaleStats } from "@/hooks/use-presale-stats";

/** Site-wide announcement bar driven by admin settings. Dismissible per session. */
export function AnnouncementBanner() {
  const stats = usePresaleStats();
  const [dismissed, setDismissed] = useState(false);
  const text = stats?.announcement;

  if (!text || dismissed) return null;

  return (
    <div className="bg-accent text-accent-foreground">
      <div className="relative mx-auto flex max-w-6xl items-center justify-center px-10 py-2 text-center text-sm font-medium">
        {text}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss announcement"
          className="absolute right-4 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
