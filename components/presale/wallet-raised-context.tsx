"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { TierId } from "@/types/presale";

/**
 * Shared, refreshable source of the connected wallet's confirmed contribution
 * per tier (GET /api/wallet/{wallet}).
 *
 * Why a single shared fetch instead of one per card: the page renders three
 * tier cards, and a self-fetching cap line in each would fire three identical
 * requests per load against a rate-limited endpoint (60 req/min per IP). One of
 * those 429s — or any transient error — previously collapsed to a fabricated
 * "$0.00 contributed", which is indistinguishable from "you contributed
 * nothing". This provider fetches ONCE per wallet, distinguishes
 * loading/error/ready from a real zero (never silently 0), and exposes
 * `refresh()` so a completed buy updates every card without a page reload.
 */

type RaisedByTier = Record<TierId, number>;

export type WalletRaisedStatus = "idle" | "loading" | "ready" | "error";

export interface WalletRaisedValue {
  /** Load state for the connected wallet's contributions. */
  status: WalletRaisedStatus;
  /** Confirmed USDC raised per tier — only meaningful when status === "ready". */
  raisedByTier: RaisedByTier | null;
  /** Confirmed USDC the wallet has contributed to a tier (0 unless "ready"). */
  get: (tier: TierId) => number;
  /** Re-fetch for the connected wallet (e.g. after a buy). Keeps the last good
   *  value on screen while it reloads; no-op when no wallet is connected. */
  refresh: () => void;
}

// Default for any consumer rendered OUTSIDE a provider: behaves as "no wallet",
// so it renders nothing rather than crashing.
const DEFAULT: WalletRaisedValue = {
  status: "idle",
  raisedByTier: null,
  get: () => 0,
  refresh: () => {},
};

const WalletRaisedContext = createContext<WalletRaisedValue>(DEFAULT);

/**
 * A single wallet's confirmed raised-per-tier from the API, in one shot. Throws
 * on a non-OK response or network error — callers MUST NOT collapse a failure to
 * 0 (that is the bug this whole module exists to prevent).
 */
export async function fetchWalletRaisedOnce(
  wallet: string,
  signal?: AbortSignal,
): Promise<RaisedByTier> {
  const res = await fetch(`/api/wallet/${wallet}`, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`Wallet contributions request failed: ${res.status}`);
  const data = (await res.json()) as { raisedByTier?: Partial<RaisedByTier> };
  const r = data?.raisedByTier ?? {};
  // Normalize to a complete, numeric record so consumers never see undefined.
  return { 1: Number(r[1] ?? 0), 2: Number(r[2] ?? 0), 3: Number(r[3] ?? 0) };
}

/**
 * Retry wrapper: a short backoff outlasts a transient blip / sliding-window edge
 * without making the cap line wait on a long ladder. Honors the abort signal
 * between attempts so a wallet switch cancels promptly.
 */
async function fetchWalletRaisedWithRetry(
  wallet: string,
  signal: AbortSignal,
): Promise<RaisedByTier> {
  let lastErr: unknown;
  for (const delay of [0, 1_000, 3_000]) {
    if (signal.aborted) throw new Error("aborted");
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (signal.aborted) throw new Error("aborted");
    try {
      return await fetchWalletRaisedOnce(wallet, signal);
    } catch (e) {
      if (signal.aborted) throw e;
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Failed to load contributions.");
}

export function WalletRaisedProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected } = useWallet();
  const wallet = connected && publicKey ? publicKey.toBase58() : null;

  const [status, setStatus] = useState<WalletRaisedStatus>(
    wallet ? "loading" : "idle",
  );
  const [raisedByTier, setRaisedByTier] = useState<RaisedByTier | null>(null);
  // Bumped to force a same-wallet re-fetch (e.g. after a buy / a manual retry).
  const [reloadToken, setReloadToken] = useState(0);

  // Reset to a fresh "loading" whenever the connected wallet changes — done
  // DURING render (React's "adjust state when a dependency changes" pattern),
  // not in an effect, so we never flash one wallet's amount under another and we
  // don't trip the no-synchronous-setState-in-effect rule.
  const [prevWallet, setPrevWallet] = useState(wallet);
  if (wallet !== prevWallet) {
    setPrevWallet(wallet);
    setRaisedByTier(null);
    setStatus(wallet ? "loading" : "idle");
  }

  // Fetch for the current wallet on connect/change and on each refresh bump. The
  // effect body itself calls NO setState synchronously — only the async
  // then/catch do — and the cleanup aborts a superseded request, so a slow
  // response for a previous wallet can never overwrite the current one.
  useEffect(() => {
    if (!wallet) return;
    const controller = new AbortController();
    fetchWalletRaisedWithRetry(wallet, controller.signal)
      .then((r) => {
        if (controller.signal.aborted) return;
        setRaisedByTier(r);
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [wallet, reloadToken]);

  const refresh = useCallback(() => {
    // Same-wallet reload: keep the last good value on screen (don't blank a
    // correct figure), but surface "loading" if we have nothing yet / are
    // retrying an error. This runs from an event handler, so setState is fine.
    setStatus((s) => (s === "ready" ? s : wallet ? "loading" : "idle"));
    setReloadToken((t) => t + 1);
  }, [wallet]);

  const value = useMemo<WalletRaisedValue>(
    () => ({
      status,
      raisedByTier,
      get: (tier: TierId) => raisedByTier?.[tier] ?? 0,
      refresh,
    }),
    [status, raisedByTier, refresh],
  );

  return (
    <WalletRaisedContext.Provider value={value}>
      {children}
    </WalletRaisedContext.Provider>
  );
}

/** Read the connected wallet's contribution state (see {@link WalletRaisedProvider}). */
export function useWalletRaised(): WalletRaisedValue {
  return useContext(WalletRaisedContext);
}
