"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

/**
 * Module-level, ref-counted body scroll lock. `document.body.style` is a single
 * global slot shared by every Dialog, so the lock must be counted: engage on the
 * FIRST open and restore the PRIOR value only when the LAST dialog closes (a
 * per-instance toggle would unlock the page while another modal is still open,
 * and would clobber any pre-existing inline overflow). Uses the position:fixed
 * technique so touch scrolling is actually blocked on iOS Safari (overflow:hidden
 * alone is a no-op there), preserving and restoring the scroll position.
 */
let lockCount = 0;
let savedScrollY = 0;
let savedBody: { overflow: string; position: string; top: string; width: string } | null = null;

function lockScroll() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    const s = document.body.style;
    savedBody = { overflow: s.overflow, position: s.position, top: s.top, width: s.width };
    s.overflow = "hidden";
    s.position = "fixed";
    s.top = `-${savedScrollY}px`;
    s.width = "100%";
  }
  lockCount += 1;
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && savedBody) {
    const s = document.body.style;
    s.overflow = savedBody.overflow;
    s.position = savedBody.position;
    s.top = savedBody.top;
    s.width = savedBody.width;
    savedBody = null;
    window.scrollTo(0, savedScrollY);
  }
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Lightweight modal: backdrop + panel, Escape to close, ref-counted scroll lock,
 * focus trap + restore.
 *
 * Rendered through a PORTAL to <body> so it escapes any transformed/animated
 * ancestor. (A `position: fixed` element is positioned relative to the nearest
 * ancestor with a transform/filter/will-change — e.g. the framer-motion mobile
 * menu — NOT the viewport. Without the portal, opening this from inside the
 * header's animated menu anchored the modal to the menu instead of centering it.)
 */
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
  // Portal target is only available on the client. Gate on mount so SSR and the
  // first client render agree (both render nothing — the modal is never part of
  // the server HTML), then portal once we're mounted in the browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Tracks whether the press that may become a "click to close" STARTED on the
  // backdrop. Closing on click alone fires onClose even when the press began
  // inside the panel and was released on the backdrop (drag / text-select),
  // closing the modal mid-interaction — so we require both ends on the backdrop.
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockScroll();

    // Move focus into the dialog once the portal panel is in the DOM.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Focus trap: keep Tab / Shift+Tab cycling within the panel.
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      // Restore focus to whatever opened the dialog (no-op if it was unmounted).
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
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
              than the viewport it scrolls (with breathing room, incl. the iOS
              home-indicator safe area) instead of clipping or top-anchoring.
              Close only when a press both STARTS and ENDS on this backdrop. */}
          <div
            className="relative flex min-h-full items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onPointerDown={(e) => {
              pressedOnBackdrop.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose();
              pressedOnBackdrop.current = false;
            }}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-label={title ? undefined : "Dialog"}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl outline-none"
            >
              <div className="flex items-center justify-between gap-4">
                {title ? (
                  <h2 id={titleId} className="text-lg font-semibold">
                    {title}
                  </h2>
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
    </AnimatePresence>,
    document.body,
  );
}
