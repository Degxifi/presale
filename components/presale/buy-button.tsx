"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { MobileWalletSheet } from "@/components/wallet/mobile-wallet-sheet";
import { needsInAppBrowser } from "@/lib/wallet/mobile";
import { BuyDialog } from "./buy-dialog";
import type { Tier } from "@/types/presale";

type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

/**
 * Buy CTA. Opens the buy dialog when connected; otherwise starts the connect
 * flow — the wallet modal on desktop / in-app browsers, or the "open in your
 * wallet" sheet on a mobile browser with no injected wallet (avoids the modal's
 * deep-link hand-off that 404s).
 */
export function BuyButton({
  tier,
  size,
  variant,
  className,
  label = "Buy $DEGX",
  connectedLabel = "Buy $DEGX",
}: {
  tier: Tier;
  size?: Size;
  variant?: Variant;
  className?: string;
  label?: string;
  connectedLabel?: string;
}) {
  const { connected, wallets } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(false);

  const startConnect = () => {
    if (needsInAppBrowser(wallets)) setMobileSheet(true);
    else setVisible(true);
  };

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={() => (connected ? setOpen(true) : startConnect())}
      >
        {connected ? connectedLabel : label}
      </Button>
      <BuyDialog tier={tier} open={open} onClose={() => setOpen(false)} />
      <MobileWalletSheet open={mobileSheet} onClose={() => setMobileSheet(false)} />
    </>
  );
}
