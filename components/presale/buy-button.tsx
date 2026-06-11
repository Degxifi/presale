"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { BuyDialog } from "./buy-dialog";
import type { Tier } from "@/types/presale";

type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

/**
 * Buy CTA. Opens the wallet modal when disconnected, or the buy dialog (for the
 * given tier) when connected.
 */
export function BuyButton({
  tier,
  size,
  variant,
  className,
  label = "Connect Wallet and Buy",
  connectedLabel = "Buy $DEGX",
}: {
  tier: Tier;
  size?: Size;
  variant?: Variant;
  className?: string;
  label?: string;
  connectedLabel?: string;
}) {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={() => (connected ? setOpen(true) : setVisible(true))}
      >
        {connected ? connectedLabel : label}
      </Button>
      <BuyDialog tier={tier} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
