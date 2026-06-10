"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildUsdcTransfer, confirmSignature } from "@/lib/solana/usdc";
import {
  PRESALE_WALLET_ADDRESS,
  isPresaleConfigured,
  solscanTx,
} from "@/lib/solana/config";
import { degxForUsdc } from "@/lib/presale";
import { degx, tokenPrice, usd } from "@/lib/format";
import type { Tier, TierId } from "@/types/presale";

type Status = "idle" | "submitting" | "success" | "error";

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

  const value = Number(amount);
  const valid =
    Number.isFinite(value) && value >= tier.minBuy && value <= tier.maxBuy;
  const estimate = valid ? degxForUsdc(value, tier.price) : 0;

  const close = () => {
    setAmount("");
    setStatus("idle");
    setError(null);
    setSig(null);
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

      const recipient = new PublicKey(PRESALE_WALLET_ADDRESS);
      const tx = await buildUsdcTransfer(connection, publicKey, recipient, value);
      const signature = await sendTransaction(tx, connection);
      await confirmSignature(connection, signature);

      // Record off-chain (best-effort — the on-chain tx is the source of truth).
      void fetch("/api/contributions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: owner, tier: tier.id, txSig: signature }),
      }).catch(() => {});

      setSig(signature);
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error ? e.message : "Transaction failed. Please try again.",
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
