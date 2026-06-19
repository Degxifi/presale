"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { Check, Clock, ExternalLink, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileWalletSheet } from "@/components/wallet/mobile-wallet-sheet";
import { needsInAppBrowser } from "@/lib/wallet/mobile";
import {
  buildClaimMessage,
  CLAIM_OPENS_AT,
  claimOpensAtMs,
  type Eligibility,
} from "@/lib/claim";
import { solscanTx } from "@/lib/solana/config";
import { num, shortWallet } from "@/lib/format";
import { Countdown } from "@/components/marketing/countdown";

// The send is gated until the token graduates; flip NEXT_PUBLIC_CLAIM_ENABLED to
// "true" at launch. The backend is the hard gate (503) regardless of this flag.
const CLAIM_ENABLED = process.env.NEXT_PUBLIC_CLAIM_ENABLED === "true";

// Small countdown block reused wherever the claim action is gated until 4 PM WAT.
function ClaimCountdown() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm font-medium text-muted">Claiming opens at 4:00 PM WAT</p>
      <Countdown target={CLAIM_OPENS_AT} verb="Opens" doneLabel="Claiming is live" />
    </div>
  );
}

type View =
  | { s: "loading" }
  | { s: "eligible"; owed: number }
  | { s: "not_eligible" }
  | { s: "claimed"; owed: number; sig?: string | null }
  | { s: "in_flight"; owed: number; sig?: string | null }
  | { s: "error"; msg: string };

export function ClaimPanel() {
  const { publicKey, connected, wallets, signMessage, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [mobileSheet, setMobileSheet] = useState(false);
  const [view, setView] = useState<View>({ s: "loading" });
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const wallet = publicKey?.toBase58() ?? null;
  // Monotonic request id: if the user switches wallets while an eligibility
  // fetch is in flight, the stale (older) response is ignored so it can't
  // overwrite the new wallet's allocation with out-of-order data.
  const reqId = useRef(0);

  // Gate the claim UI until CLAIM_OPENS_AT. claimsOpen starts false (matches the
  // server render → no hydration mismatch) and flips once the client clock passes
  // the target. Empty/invalid target = no gate (open immediately).
  const opensAtMs = claimOpensAtMs();
  const [claimsOpen, setClaimsOpen] = useState(false);
  useEffect(() => {
    if (!opensAtMs || Number.isNaN(opensAtMs) || Date.now() >= opensAtMs) {
      setClaimsOpen(true);
      return;
    }
    const id = setInterval(() => {
      if (Date.now() >= opensAtMs) {
        setClaimsOpen(true);
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [opensAtMs]);

  const loadEligibility = useCallback(async (w: string) => {
    const id = ++reqId.current;
    setClaimError(null);
    setView({ s: "loading" });
    try {
      const res = await fetch(`/api/claim/eligibility?wallet=${w}`, { cache: "no-store" });
      const data = (await res.json()) as Eligibility & { error?: string };
      if (id !== reqId.current) return; // a newer wallet/request superseded this one
      if (!res.ok) return setView({ s: "error", msg: data.error ?? "Couldn't load your allocation." });
      if (data.status === "not_eligible") return setView({ s: "not_eligible" });
      if (data.status === "claimed") return setView({ s: "claimed", owed: data.owed, sig: data.txSig });
      if (data.status === "in_flight") return setView({ s: "in_flight", owed: data.owed, sig: data.txSig });
      setView({ s: "eligible", owed: data.owed });
    } catch {
      if (id !== reqId.current) return;
      setView({ s: "error", msg: "Couldn't load your allocation. Please try again." });
    }
  }, []);

  useEffect(() => {
    if (wallet) loadEligibility(wallet);
  }, [wallet, loadEligibility]);

  const startConnect = () => {
    if (needsInAppBrowser(wallets)) setMobileSheet(true);
    else setVisible(true);
  };

  const claim = async (owed: number) => {
    if (!wallet || claiming) return;
    setClaimError(null);
    if (!signMessage) {
      setClaimError("Your wallet doesn't support message signing — try another wallet.");
      return;
    }
    setClaiming(true);
    try {
      const message = buildClaimMessage(wallet, new Date().toISOString());
      // Guard the signing prompt: a mobile wallet that backgrounds the page and
      // never resolves signMessage would otherwise spin "Confirm in your wallet…"
      // forever. Time out at 3 min (well inside the backend's 10-min freshness).
      const signed = await Promise.race([
        signMessage(new TextEncoder().encode(message)),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("sign-timeout")), 180_000)),
      ]);
      const signature = bs58.encode(signed);

      // Bound the POST so a stalled network can't hang the spinner. Aborting is
      // safe to retry — the server's ledger is idempotent (a re-claim returns
      // already-claimed / in-progress, never a second send).
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20_000);
      let res: Response;
      try {
        res = await fetch("/api/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet, message, signature }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        pending?: boolean;
        alreadyClaimed?: boolean;
        amount?: number;
        sig?: string;
        error?: string;
      };
      if (res.ok && data.ok) {
        setView({ s: "claimed", owed: data.amount ?? owed, sig: data.sig });
      } else if (res.status === 202 && data.pending) {
        setView({ s: "in_flight", owed: data.amount ?? owed, sig: data.sig });
      } else {
        setClaimError(data.error ?? "Claim failed. Please try again.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const name = e instanceof Error ? e.name : "";
      if (/sign-timeout/.test(msg)) {
        setClaimError("Wallet signing timed out — please try again.");
      } else if (name === "AbortError") {
        setClaimError("That took too long — please try again (you can't be paid twice).");
      } else if (/reject|denied|cancel/i.test(msg)) {
        setClaimError("Signature cancelled.");
      } else {
        setClaimError("Couldn't complete the claim. Please try again.");
      }
    } finally {
      setClaiming(false);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-2xl border border-border bg-surface p-8 text-left">{children}</div>
  );

  // ── not connected ───────────────────────────────────────────────────────────
  // Users can connect (and see their allocation) DURING the countdown — only the
  // claim ACTION is gated until 4 PM WAT (here + server-side). Show the countdown
  // below the connect button so they know when it opens.
  if (!connected || !wallet) {
    return (
      <>
        <Shell>
          <div className="flex flex-col items-center gap-4 text-center">
            <Wallet className="size-8 text-muted" />
            <p className="text-muted">Connect your wallet to check your $DEGX allocation.</p>
            <Button size="lg" className="w-full" onClick={startConnect}>
              Connect Wallet
            </Button>
            {!claimsOpen && (
              <div className="mt-2 w-full border-t border-border pt-5">
                <ClaimCountdown />
              </div>
            )}
          </div>
        </Shell>
        <MobileWalletSheet open={mobileSheet} onClose={() => setMobileSheet(false)} />
      </>
    );
  }

  return (
    <Shell>
      {/* connected wallet row */}
      <div className="mb-6 flex items-center justify-between border-b border-border pb-4 text-sm">
        <span className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full bg-accent" />
          {shortWallet(wallet)}
        </span>
        <button onClick={() => { setMobileSheet(false); disconnect(); }} className="text-muted underline-offset-2 hover:underline">
          Disconnect
        </button>
      </div>

      {view.s === "loading" && (
        <div className="flex items-center justify-center gap-2 py-8 text-muted">
          <Loader2 className="size-4 animate-spin" /> Checking your allocation…
        </div>
      )}

      {view.s === "not_eligible" && (
        <div className="py-4 text-center">
          <p className="font-medium">No $DEGX allocation for this wallet.</p>
          <p className="mt-2 text-sm text-muted">
            If you bought with a different wallet, disconnect and connect that one.
          </p>
        </div>
      )}

      {view.s === "eligible" && (
        <div className="text-center">
          <p className="text-sm text-muted">You can claim</p>
          <p className="mt-1 font-display text-4xl font-bold tabular-nums text-gold">
            {num(view.owed)} <span className="text-2xl">$DEGX</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            40% of your allocation unlocks now. The remaining 60% vests over the
            following months.
          </p>
          {!claimsOpen ? (
            // Connected + eligible, but the countdown hasn't elapsed → show the
            // timer here instead of an active Claim button. The server also 403s
            // until the open instant, so this can't be bypassed.
            <div className="mt-6 border-t border-border pt-6">
              <ClaimCountdown />
            </div>
          ) : CLAIM_ENABLED ? (
            <Button
              size="lg"
              className="mt-6 w-full"
              disabled={claiming}
              onClick={() => claim(view.owed)}
            >
              {claiming ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Confirm in your wallet…
                </span>
              ) : (
                "Claim $DEGX"
              )}
            </Button>
          ) : (
            <p className="mt-6 rounded-lg border border-border bg-bg px-4 py-3 text-sm text-muted">
              Claiming opens when $DEGX graduates on Jupiter Studio. Your allocation
              is locked in — check back here to claim.
            </p>
          )}
          {claimError && <p className="mt-3 text-sm text-red-400">{claimError}</p>}
        </div>
      )}

      {view.s === "claimed" && (
        <div className="py-4 text-center">
          <Check className="mx-auto size-8 text-accent" />
          <p className="mt-3 font-medium">Claimed</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums text-gold">
            {num(view.owed)} $DEGX
          </p>
          {view.sig && (
            <a
              href={solscanTx(view.sig)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              View on Solscan <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      )}

      {view.s === "in_flight" && (
        <div className="py-4 text-center">
          <Clock className="mx-auto size-8 text-muted" />
          <p className="mt-3 font-medium">Claim in progress</p>
          <p className="mt-1 text-sm text-muted">
            Your {num(view.owed)} $DEGX claim was submitted. Check Solscan in a moment
            — don&apos;t claim again.
          </p>
          {view.sig && (
            <a
              href={solscanTx(view.sig)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              View on Solscan <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      )}

      {view.s === "error" && (
        <div className="py-4 text-center">
          <p className="text-sm text-red-400">{view.msg}</p>
          <Button variant="secondary" className="mt-4" onClick={() => wallet && loadEligibility(wallet)}>
            Retry
          </Button>
        </div>
      )}
    </Shell>
  );
}
