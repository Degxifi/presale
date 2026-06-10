"use client";

import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { WalletProviders } from "@/components/wallet/wallet-providers";

/**
 * Client-side providers tree: theme switching, global motion config (respects
 * prefers-reduced-motion), and Solana wallet/connection context.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <MotionConfig reducedMotion="user">
        <WalletProviders>{children}</WalletProviders>
      </MotionConfig>
    </ThemeProvider>
  );
}
