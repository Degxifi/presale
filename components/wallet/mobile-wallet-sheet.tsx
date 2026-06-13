"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { walletBrowseLinks } from "@/lib/wallet/mobile";

/**
 * Shown on a mobile browser that has no injected wallet. Instead of the
 * wallet-adapter modal's deep-link (which can hand off to a wallet and land on
 * a 404), it sends the user into a wallet's in-app browser — where the wallet
 * injects and connect/buy work natively. Phantom/Solflare have "browse"
 * universal links; Jupiter Mobile and others use the copy-link path.
 */
export function MobileWalletSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://presale.degxifi.com";
  const links = walletBrowseLinks(url);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the URL is shown below for manual copy
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Open in your wallet">
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          On mobile, open the presale inside your wallet&apos;s browser to connect
          and buy. Pick your wallet:
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
          Using <span className="text-foreground">Jupiter Mobile</span> or another
          wallet? Tap <span className="text-foreground">Copy link</span>, open your
          wallet app&apos;s built-in browser, and paste{" "}
          <span className="break-all font-mono text-foreground">{url}</span>.
        </p>
      </div>
    </Dialog>
  );
}
