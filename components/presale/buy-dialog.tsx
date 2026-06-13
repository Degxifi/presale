"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildUsdcTransfer, checkFunds, confirmSignature } from "@/lib/solana/usdc";
import {
  PRESALE_WALLET_ADDRESS,
  isPresaleConfigured,
  solscanTx,
} from "@/lib/solana/config";
import { degxForUsdc, isTierEligible } from "@/lib/presale";
import { degx, shortWallet, tokenPrice, usd } from "@/lib/format";
import type { Tier, TierId } from "@/types/presale";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Record a confirmed payment with retries — the on-chain tx is the source of
 * truth, but this row is what distribution/caps are built from, so a silent
 * drop is the worst failure. Backoff (2s/8s/30s) outlasts a 60s rate-limit
 * window and RPC propagation lag. Returns null when cleanly recorded, else
 * the warning text to show on the success screen.
 */
async function recordWithRetry(
  wallet: string,
  tier: TierId,
  txSig: string,
): Promise<string | null> {
  let lastError = "recording request failed";
  for (const delay of [0, 2_000, 8_000, 30_000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetch("/api/contributions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, tier, txSig }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        warning?: string;
      } | null;
      if (res.ok) return data?.warning ?? null; // recorded (maybe flagged)
      lastError = data?.error ?? `HTTP ${res.status}`;
    } catch {
      lastError = "network error";
    }
  }
  return `Your payment is confirmed on-chain, but we couldn't record it automatically (${lastError}). Save the transaction link above and contact support so your allocation is counted.`;
}

/** A wallet's confirmed raised amount in a tier (for cumulative cap checks). */
async function getWalletTierRaised(wallet: string, tier: TierId): Promise<number> {
  try {
    const res = await fetch(`/api/wallet/${wallet}`, { cache: "no-store" });
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data?.raisedByTier?.[tier] ?? 0);
  } catch {
    return 0;
  }
}

export function BuyDialog({
  tier,
  open,
  onClose,
}: {
  tier: Tier;
  open: boolean;
  onClose: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [recordWarning, setRecordWarning] = useState<string | null>(null);

  const value = Number(amount);
  const valid =
    Number.isFinite(value) && value >= tier.minBuy && value <= tier.maxBuy;
  const estimate = valid ? degxForUsdc(value, tier.price) : 0;

  const close = () => {
    setAmount("");
    setStatus("idle");
    setError(null);
    setSig(null);
    setRecordWarning(null);
    onClose();
  };

  const submit = async () => {
    setError(null);
    if (!publicKey) return setError("Connect your wallet first.");
    if (!isPresaleConfigured())
      return setError("The presale wallet isn't configured yet — check back at launch.");
    if (!valid)
      return setError(
        `Enter an amount between ${usd(tier.minBuy)} and ${usd(tier.maxBuy)}.`,
      );

    try {
      setStatus("submitting");
      const owner = publicKey.toBase58();

      // Rounds 1 & 2 are member-only — verify the access cookie's tier BEFORE
      // funds move (Public round 3 needs no cookie). Fails closed: if the check
      // can't run we don't let the user send unallocatable USDC.
      if (tier.id !== 3) {
        let memberTier: 1 | 2 | null = null;
        try {
          const meRes = await fetch("/api/access", { cache: "no-store" });
          if (meRes.ok) {
            const me = (await meRes.json()) as { tier?: number };
            memberTier = me.tier === 1 || me.tier === 2 ? me.tier : null;
          }
        } catch {
          memberTier = null;
        }
        if (!isTierEligible(tier.id, memberTier)) {
          setStatus("idle");
          setError(
            tier.id === 1
              ? "Early Believers is reserved for D-VIP/D-Pro 3-6 members. Anyone can buy in the Public Presale instead."
              : "Early Supporters is for Degxifi members. Open the presale from your dashboard, or buy in the Public Presale instead.",
          );
          return;
        }
      }

      // Cumulative per-wallet cap (brief §6) — checked before sending funds.
      const already = await getWalletTierRaised(owner, tier.id);
      if (already + value > tier.maxBuy + 0.01) {
        setStatus("idle");
        setError(
          `This wallet can contribute up to ${usd(tier.maxBuy)} in this tier` +
            (already > 0 ? ` (already ${usd(already)}).` : "."),
        );
        return;
      }

      // Tier must still be open (launch time + admin overrides) before funds
      // move — the server re-checks before recording, but failing here saves
      // the user from sending USDC that can't be allocated.
      try {
        const statsRes = await fetch("/api/presale/stats", { cache: "no-store" });
        if (statsRes.ok) {
          const stats = (await statsRes.json()) as {
            tiers?: { tierId: number; status: string }[];
          };
          const live = stats.tiers?.find((p) => p.tierId === tier.id)?.status;
          if (live && live !== "active") {
            setStatus("idle");
            setError("This tier isn't open right now.");
            return;
          }
        }
      } catch {
        // stats hiccup: continue; the server still enforces before recording
      }

      const fundsError = await checkFunds(connection, publicKey, value);
      if (fundsError) {
        setStatus("idle");
        setError(fundsError);
        return;
      }

      const recipient = new PublicKey(PRESALE_WALLET_ADDRESS);
      const tx = await buildUsdcTransfer(connection, publicKey, recipient, value);
      const signature = await sendTransaction(tx, connection);
      await confirmSignature(connection, signature);

      setSig(signature);
      setStatus("success");

      // Record off-chain with retries; if it still fails, the success screen
      // shows a save-your-transaction warning instead of failing silently.
      void recordWithRetry(owner, tier.id, signature).then((failure) => {
        if (failure) setRecordWarning(failure);
      });
    } catch (e) {
      setStatus("error");
      const message = e instanceof Error ? e.message : "";
      const owner = publicKey?.toBase58();
      setError(
        /missing signature|signature verification/i.test(message)
          ? `Your wallet didn't sign the transaction. Make sure you approve with the account you connected${owner ? ` (${shortWallet(owner)})` : ""}, then try again.`
          : /broadcast|status code 500|simulat/i.test(message)
            ? "Your wallet couldn't broadcast the transaction. Make sure you have enough USDC and some SOL for fees, then try again."
            : message || "Transaction failed. Please try again.",
      );
    }
  };

  const title =
    status === "success" ? "Contribution confirmed" : `Buy $DEGX · ${tier.name}`;

  return (
    <Dialog open={open} onClose={close} title={title}>
      {status === "success" && sig ? (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/10">
            <Check className="size-6 text-accent" />
          </div>
          <div>
            <p className="font-display text-3xl font-bold tabular-nums text-gold">
              {degx(degxForUsdc(value, tier.price))}
            </p>
            <p className="mt-1 text-sm text-muted">allocated for {usd(value)}</p>
          </div>
          <a
            href={solscanTx(sig)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            View transaction <ExternalLink className="size-3.5" />
          </a>
          <p className="text-xs leading-relaxed text-muted">
            Your $DEGX is distributed to this wallet after the presale graduates at
            a $600K market cap. Contributions are non-refundable.
          </p>
          {recordWarning && (
            <p className="rounded-xl border border-border bg-surface-2 p-3 text-left text-xs leading-relaxed text-danger">
              {recordWarning}
            </p>
          )}
          <Button variant="secondary" className="w-full" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm">
            <span className="text-muted">Price</span>
            <span className="font-medium tabular-nums">
              {tokenPrice(tier.price)} / $DEGX
            </span>
          </div>

          <div>
            <label htmlFor="buy-amount" className="text-sm text-muted">
              Amount (USDC)
            </label>
            <input
              id="buy-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(tier.minBuy)}
              className="mt-1.5 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-lg tabular-nums outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>
                Min {usd(tier.minBuy)} · Max {usd(tier.maxBuy)}
              </span>
              <span>
                ≈ <span className="text-gold">{estimate ? degx(estimate) : "—"}</span>
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            {[tier.minBuy, Math.round(tier.maxBuy / 2), tier.maxBuy].map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(String(a))}
                className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
              >
                {usd(a)}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button
            className="w-full"
            disabled={!valid || status === "submitting"}
            onClick={submit}
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Confirm in your wallet…
              </>
            ) : valid ? (
              `Buy ${degx(estimate)}`
            ) : (
              "Enter an amount"
            )}
          </Button>

          <p className="text-center text-xs text-muted">
            USDC on Solana · non-refundable · tokens distributed after graduation
          </p>
        </div>
      )}
    </Dialog>
  );
}
