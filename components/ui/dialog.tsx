"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

/** Lightweight modal: backdrop + panel, Escape to close, body scroll lock. */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop: fixed so it always covers the full viewport, even if the
              panel is tall enough to scroll. */}
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          {/* Centering wrapper: min-h-full + items-center keeps the panel dead
              center of the screen no matter what; if the panel is ever taller
              than the viewport it scrolls (with p-4 breathing room) instead of
              clipping or top-anchoring. Clicking the empty area closes. */}
          <div
            className="relative flex min-h-full items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            >
            <div className="flex items-center justify-between gap-4">
              {title ? (
                <h2 className="text-lg font-semibold">{title}</h2>
              ) : (
                <span />
              )}
              <button
                onClick={onClose}
                aria-label="Close"
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4">{children}</div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
