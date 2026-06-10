"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Check, Copy, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortWallet } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ConnectWalletButton({ className }: { className?: string }) {
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!connected || !publicKey) {
    return (
      <Button
        className={className}
        onClick={() => setVisible(true)}
        disabled={connecting}
      >
        <Wallet className="size-4" />
        {connecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    );
  }

  const address = publicKey.toBase58();
  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
