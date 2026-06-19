"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { Check, Copy, ExternalLink, Smartphone } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { walletBrowseLinks } from "@/lib/wallet/mobile";

const MWA = "Mobile Wallet Adapter";

/**
 * Shown on a mobile browser with no real injected wallet. Instead of the generic
 * wallet-adapter modal (unbranded + the slow Mobile-Wallet-Adapter handoff), it
 * offers the branded paths: open this page inside Phantom/Solflare's in-app
 * browser (universal "browse" links → native injection, fast). It ALSO offers the
 * device's Mobile Wallet Adapter as an option (Android) for users who prefer it,
 * plus a copy-link fallback for any other wallet (e.g. Jupiter Mobile).
 */
export function MobileWalletSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { wallets, wallet, select, connect, connected, connecting } = useWallet();
  const [pendingMwa, setPendingMwa] = useState(false);

  // Preserve the CURRENT path (origin + pathname) so a deep-link from /claim
  // re-opens /claim inside the wallet browser — not the homepage. Drop query/hash.
  const url =
    typeof window !== "undefined"
      ? window.location.origin + window.location.pathname
      : "https://presale.degxifi.com";
  const links = walletBrowseLinks(url);

  // The Mobile Wallet Adapter is only present/usable on Android; show its button
  // only when the adapter is actually registered.
  const hasMwa = wallets.some(
    (w) =>
      w.adapter.name === MWA &&
      (w.readyState === WalletReadyState.Installed ||
        w.readyState === WalletReadyState.Loadable),
  );

  // select() propagates async, so connect AFTER the selected wallet becomes MWA.
  useEffect(() => {
    if (!pendingMwa) return;
    if (wallet?.adapter.name === MWA && !connected && !connecting) {
      setPendingMwa(false);
      connect().catch(() => {}); // user-cancel / adapter error is non-fatal
      onClose();
    }
  }, [pendingMwa, wallet, connected, connecting, connect, onClose]);

  const useDeviceWallet = async () => {
    const mwaName = wallets.find((w) => w.adapter.name === MWA)?.adapter.name;
    if (!mwaName) return;
    if (wallet?.adapter.name === MWA) {
      // already selected → connect directly
      try { await connect(); } catch { /* non-fatal */ }
      onClose();
    } else {
      setPendingMwa(true);
      select(mwaName); // the effect above connects once selection lands
    }
  };

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Fallback for insecure (http) contexts / older mobile browsers where the
      // async clipboard API is unavailable.
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false; // both failed (very rare on mobile) — user can retry
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Open in your wallet">
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          On mobile, open this page inside your wallet&apos;s browser to connect.
          Pick your wallet:
        </p>

        <div className="space-y-2">
          <a
            href={links.phantom}
            className={buttonVariants({ variant: "primary", className: "w-full" })}
          >
            Open in Phantom <ExternalLink className="size-4" />
          </a>
          <a
            href={links.solflare}
            className={buttonVariants({ variant: "secondary", className: "w-full" })}
          >
            Open in Solflare <ExternalLink className="size-4" />
          </a>
          {hasMwa && (
            <button
              type="button"
              onClick={useDeviceWallet}
              disabled={connecting || pendingMwa}
              className={buttonVariants({ variant: "secondary", className: "w-full" })}
            >
              <Smartphone className="size-4" />
              {connecting || pendingMwa ? "Connecting…" : "Use your device wallet"}
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            {copied ? (
              <>
                <Check className="size-4 text-success" /> Link copied
              </>
            ) : (
              <>
                <Copy className="size-4" /> Copy link
              </>
            )}
          </button>
        </div>

        <p className="text-xs leading-relaxed text-muted">
          Using Jupiter or another wallet? Tap{" "}
          <span className="text-foreground">Copy link</span> and open it in your
          wallet app&apos;s browser.
        </p>
      </div>
    </Dialog>
  );
}
