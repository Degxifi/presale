"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Check, Copy, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileWalletSheet } from "@/components/wallet/mobile-wallet-sheet";
import { needsInAppBrowser } from "@/lib/wallet/mobile";
import { shortWallet } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ConnectWalletButton({
  className,
  inline = false,
}: {
  className?: string;
  /**
   * Inline layout for places where an absolutely-positioned dropdown would be
   * clipped — notably the mobile menu, whose container is `overflow-hidden` for
   * its height animation. Stacks the address + Disconnect as normal buttons so
   * Disconnect is actually reachable on mobile.
   */
  inline?: boolean;
}) {
  const { publicKey, connected, connecting, disconnect, wallets } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(false);

  if (!connected || !publicKey) {
    return (
      <>
        <Button
          className={className}
          onClick={() =>
            needsInAppBrowser(wallets) ? setMobileSheet(true) : setVisible(true)
          }
          disabled={connecting}
        >
          <Wallet className="size-4" />
          {connecting ? "Connecting…" : "Connect Wallet"}
        </Button>
        <MobileWalletSheet
          open={mobileSheet}
          onClose={() => setMobileSheet(false)}
        />
      </>
    );
  }

  const address = publicKey.toBase58();
  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (inline) {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <button
          type="button"
          onClick={copyAddress}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <span className="size-2 rounded-full bg-success" />
          {shortWallet(address)}
          {copied ? (
            <Check className="size-4 text-success" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
        <Button variant="secondary" className="w-full" onClick={() => disconnect()}>
          <LogOut className="size-4" />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <Button variant="secondary" onClick={() => setMenuOpen((v) => !v)}>
        <span className="size-2 rounded-full bg-success" />
        {shortWallet(address)}
      </Button>

      {menuOpen && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-border bg-surface p-1 shadow-xl">
            <button
              onClick={copyAddress}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {copied ? (
                <Check className="size-4 text-success" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copied" : "Copy address"}
            </button>
            <button
              onClick={() => {
                disconnect();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-surface-2"
            >
              <LogOut className="size-4" />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
