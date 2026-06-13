"use client";

import { useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Check, Clock, ExternalLink, Loader2 } from "lucide-react";
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

type Status = "idle" | "submitting" | "success" | "unconfirmed" | "error";

/**
 * Outcome of recording a contribution off-chain (the server re-verifies the tx
 * on-chain, so it is the source of truth for whether the payment landed):
 *  - recorded:  the server saw the tx and stored it (warning set if flagged).
 *  - not-found: after retries the server still can't find the tx → it did not
 *               land (don't push the buyer to support).
 *  - infra:     couldn't reach/record (network/5xx) — the tx may have landed, so
 *               tell the buyer to save it.
 */
type RecordOutcome =
  | { kind: "recorded"; warning: string | null }
  | { kind: "not-found" }
  | { kind: "infra" };

async function recordWithRetry(
  wallet: string,
  tier: TierId,
  txSig: string,
): Promise<RecordOutcome> {
  // Backoff (2s/8s/30s) outlasts a 60s rate-limit window + RPC propagation lag.
  let lastKind: "not-found" | "infra" = "infra";
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
      if (res.ok) return { kind: "recorded", warning: data?.warning ?? null };
      // The server couldn't verify the tx on-chain → it hasn't landed (vs an
      // infrastructure error, which means we just couldn't record a maybe-landed tx).
      lastKind = /not found|not yet confirmed|failed on-chain|no usdc/i.test(
        data?.error ?? "",
      )
        ? "not-found"
        : "infra";
    } catch {
      lastKind = "infra";
    }
  }
  return { kind: lastKind };
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
  // Bumped on every submit and on close, so a late recordWithRetry().then from a
  // prior buy (it can resolve ~40s later) can't write into the current view.
  const submitId = useRef(0);

  const value = Number(amount);
  const valid =
    Number.isFinite(value) && value >= tier.minBuy && value <= tier.maxBuy;
  const estimate = valid ? degxForUsdc(value, tier.price) : 0;

  const close = () => {
    submitId.current++;
    setAmount("");
    setStatus("idle");
    setError(null);
    setSig(null);
    setRecordWarning(null);
    onClose();
  };

  const submit = async () => {
    setError(null);
    setRecordWarning(null); // never carry a prior buy's warning into this one
    if (!publicKey) return setError("Connect your wallet first.");
    if (!isPresaleConfigured())
      return setError("The presale wallet isn't configured yet — check back at launch.");
    if (!valid)
      return setError(
        `Enter an amount between ${usd(tier.minBuy)} and ${usd(tier.maxBuy)}.`,
      );

    const myId = ++submitId.current;
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
      // skipPreflight: a transient preflight "signature verification failure" was
      // failing the buy even though the tx broadcast and LANDED. Skip preflight
      // and treat on-chain confirmation as the source of truth.
      const signature = await sendTransaction(tx, connection, {
        skipPreflight: true,
        maxRetries: 5,
      });
      // Capture the signature immediately so the user always keeps the tx link.
      setSig(signature);

      // On-chain error → real failure (no funds moved). A timeout is NOT a
      // failure and NOT a success — we genuinely don't know yet, so we show an
      // honest "submitted, couldn't confirm" state (never claim success, never
      // auto-prompt a retry that could double-pay). The server-verified recorder
      // resolves the real outcome below.
      let confirmed = false;
      try {
        await confirmSignature(connection, signature);
        confirmed = true;
      } catch (e) {
        if (/failed on-chain/i.test(e instanceof Error ? e.message : "")) {
          setStatus("error");
          setError(
            "Your transaction failed on-chain — no funds were transferred. Please try again.",
          );
          return;
        }
        // timeout — outcome unknown
      }
      setStatus(confirmed ? "success" : "unconfirmed");

      // Record off-chain with retries; the server re-verifies on-chain.
      void recordWithRetry(owner, tier.id, signature).then((res) => {
        if (submitId.current !== myId) return; // stale (closed / newer submit)
        if (res.kind === "recorded") {
          setStatus("success");
          setRecordWarning(res.warning); // null clears; non-null = flagged note
        } else if (res.kind === "not-found" && !confirmed) {
          // The tx didn't land (server can't find it after ~40s). Keep the
          // honest "unconfirmed" screen; don't push the buyer to support.
          setStatus("unconfirmed");
          setRecordWarning(null);
        } else {
          // Confirmed-but-unrecorded, or an infra failure: the payment likely
          // landed — tell the buyer to save it.
          setRecordWarning(
            `We couldn't record your transaction automatically. Save the transaction link above and contact support about ${signature.slice(0, 12)}… so your allocation is counted.`,
          );
        }
      });
    } catch (e) {
      if (submitId.current !== myId) return;
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
    status === "success"
      ? "Contribution confirmed"
      : status === "unconfirmed"
        ? "Transaction submitted"
        : `Buy $DEGX · ${tier.name}`;

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
      ) : status === "unconfirmed" && sig ? (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-2">
            <Clock className="size-6 text-muted" />
          </div>
          <p className="text-sm leading-relaxed text-muted">
            We submitted your transaction but couldn&apos;t confirm it in time
            (the network can be slow under load).
          </p>
          <a
            href={solscanTx(sig)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            Check it on Solscan <ExternalLink className="size-3.5" />
          </a>
          <p className="text-xs leading-relaxed text-muted">
            If it shows success, your allocation is counted automatically — no
            action needed. If it failed or isn&apos;t there, you can safely try
            again. Please don&apos;t assume it went through.
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
