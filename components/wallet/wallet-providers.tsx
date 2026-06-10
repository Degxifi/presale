"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { RPC_PROXY_PATH } from "@/lib/solana/config";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Solana connection + wallet context. The connection endpoint is the
 * same-origin /api/rpc proxy, so the RPC provider key stays server-side.
 * Phantom, Backpack, and Solflare register via the Wallet Standard.
 */
export function WalletProviders({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () =>
      typeof window !== "undefined"
        ? `${window.location.origin}${RPC_PROXY_PATH}`
        : // SSR placeholder — the connection is only used client-side.
          "https://api.mainnet-beta.solana.com",
    [],
  );
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
