"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { Loader2 } from "lucide-react";
import {
  BATCH_SIZE,
  type BatchRecipient,
  type DistributionPlan,
  buildUnsignedBatch,
  degxAta,
  fetchMissingAtas,
  formatTokens,
} from "@/lib/solana/distribute";
import { confirmSignature } from "@/lib/solana/usdc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { ImportPanel } from "./import-panel";

const PRESETS = [40, 60, 80, 100]; // cumulative unlock % (TGE 40, then vesting)
const WAVE = 4; // batches signed + sent per wallet approval
const PRIORITY = 20_000; // µLamports/CU — helps land on a congested launch day

const fmtErr = (e: unknown) => (e instanceof Error ? e.message : String(e));
function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

export function DistributionPanel() {
  const { connection } = useConnection();
  const { publicKey, connected, signAllTransactions } = useWallet();
  const [unlock, setUnlock] = useState(40);
  const [plan, setPlan] = useState<DistributionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [savingMint, setSavingMint] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [treasury, setTreasury] = useState<{ degx: bigint; sol: number } | null>(null);
  const mintRef = useRef<HTMLInputElement>(null);

  const addLog = (m: string) => setLog((l) => [...l, m]);

  const loadPlan = useCallback(async (pct: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/distribute?unlock=${pct}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load plan.");
      setPlan(data as DistributionPlan);
    } catch (e) {
      setError(fmtErr(e));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => loadPlan(unlock));
    return () => cancelAnimationFrame(raf);
  }, [unlock, loadPlan]);

  // treasury (connected wallet) balances
  useEffect(() => {
    let active = true;
    (async () => {
      if (!connected || !publicKey || !plan?.configured) {
        setTreasury(null);
        return;
      }
      try {
        const mint = new PublicKey(plan.mint);
        const programId = new PublicKey(plan.tokenProgram);
        const [degxRes, lamports] = await Promise.all([
          connection.getTokenAccountBalance(degxAta(mint, publicKey, programId)).catch(() => null),
          connection.getBalance(publicKey),
        ]);
        if (active)
          setTreasury({ degx: degxRes ? BigInt(degxRes.value.amount) : 0n, sol: lamports / 1e9 });
      } catch {
        if (active) setTreasury(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [connected, publicKey, plan, connection]);

  const saveMint = useCallback(async () => {
    const v = mintRef.current?.value.trim() ?? "";
    setSavingMint(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ degxMint: v || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save mint.");
      await loadPlan(unlock);
    } catch (e) {
      setError(fmtErr(e));
    } finally {
      setSavingMint(false);
    }
  }, [loadPlan, unlock]);

  const distribute = useCallback(async () => {
    if (!plan?.configured || !publicKey || !signAllTransactions) return;
    const recipients = plan.recipients;
    setRunning(true);
    setError(null);
    setLog([]);
    setProgress({ done: 0, total: recipients.length });
    try {
      const mint = new PublicKey(plan.mint);
      const programId = new PublicKey(plan.tokenProgram);
      const sourceAta = degxAta(mint, publicKey, programId);
      const decimals = plan.decimals;
      const owners = recipients.map((r) => new PublicKey(r.wallet));
      const missing = await fetchMissingAtas(connection, mint, owners, programId);
      const batches = chunk(recipients, BATCH_SIZE);
      let done = 0;

      for (let w = 0; w < batches.length; w += WAVE) {
        const wave = batches.slice(w, w + WAVE);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

        const built = wave.map((b, k) => {
          const recs: BatchRecipient[] = b.map((r) => {
            const owner = new PublicKey(r.wallet);
            return {
              owner,
              amount: BigInt(r.owed),
              needsAta: missing.has(degxAta(mint, owner, programId).toBase58()),
            };
          });
          const tx = buildUnsignedBatch({
            payer: publicKey,
            mint,
            sourceAta,
            decimals,
            programId,
            recipients: recs,
            blockhash,
            priorityMicroLamports: PRIORITY,
          });
          return { idx: w + k, tx, items: b };
        });

        // one wallet approval for the whole wave
        const signed = await signAllTransactions(built.map((x) => x.tx));
        const withSig = built.map((x, i) => ({
          ...x,
          signed: signed[i]!,
          sig: bs58.encode(signed[i]!.signatures[0]!),
        }));

        // write-ahead log to the DB BEFORE broadcasting (server validates ≤ owed)
        const items = withSig.flatMap((x) =>
          x.items.map((r) => ({
            wallet: r.wallet,
            amount: r.owed,
            sig: x.sig,
            lvbh: lastValidBlockHeight,
          })),
        );
        const sent = await fetch("/api/admin/distribute/record", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "sent", unlock, items }),
        });
        if (!sent.ok) throw new Error((await sent.json()).error ?? "Failed to record (WAL).");

        // broadcast + confirm the wave concurrently
        await Promise.all(
          withSig.map(async (x) => {
            try {
              await connection.sendRawTransaction(x.signed.serialize(), {
                skipPreflight: false,
                maxRetries: 5,
              });
              await confirmSignature(connection, x.sig);
              addLog(`Batch ${x.idx + 1}: ✓ ${x.items.length} wallet(s)`);
            } catch (e) {
              addLog(`Batch ${x.idx + 1}: ✖ ${fmtErr(e)}`);
            }
            done += x.items.length;
            setProgress({ done, total: recipients.length });
          }),
        );

        // server verifies on-chain + commits the ledger (never trusts the client)
        await fetch("/api/admin/distribute/record", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "confirmed", sigs: withSig.map((x) => x.sig) }),
        });
      }
      addLog("Run complete — reloading plan…");
      await loadPlan(unlock);
    } catch (e) {
      setError(fmtErr(e));
    } finally {
      setRunning(false);
    }
  }, [plan, publicKey, signAllTransactions, connection, unlock, loadPlan]);

  const totals = plan?.totals;
  const owedTotal = totals ? BigInt(totals.owedTotal) : 0n;
  const dec = plan?.decimals ?? 0;
  const enoughDegx = treasury ? treasury.degx >= owedTotal : false;
  const canRun =
    connected && !!signAllTransactions && !running && !loading && owedTotal > 0n && enoughDegx;

  const cards = totals
    ? [
        { label: "Allocated (100%)", value: formatTokens(BigInt(totals.allocatedTotal), dec) },
        { label: "Distributed", value: formatTokens(BigInt(totals.distributedTotal), dec) },
        { label: `Owed @ ${unlock}%`, value: formatTokens(owedTotal, dec) },
        { label: "Recipients", value: totals.recipientCount.toLocaleString() },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Token distribution</h1>
        <p className="mt-1 text-sm text-muted">
          Set the mint, connect the treasury wallet (it holds the $DEGX
          allocation), and release the selected tranche. Idempotent — no wallet is
          ever paid twice, and an interrupted run resumes safely.
        </p>
      </div>

      {/* mint editor (admin-entered, stored in settings — not env) */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-semibold">$DEGX token mint</h2>
        <p className="mt-1 text-sm text-muted">
          The SPL mint address from your Jupiter Studio launch.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            ref={mintRef}
            key={plan?.mint ?? "none"}
            defaultValue={plan?.mint ?? ""}
            placeholder="Mint address (base58)"
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <Button variant="secondary" onClick={saveMint} disabled={savingMint}>
            {savingMint ? "Saving…" : "Save mint"}
          </Button>
        </div>
        {plan && !plan.configured && (
          <p className={`mt-2 text-sm ${plan.error ? "text-danger" : "text-muted"}`}>
            {plan.error ?? "Enter the mint to begin."}
          </p>
        )}
      </div>

      {/* Master list import — what the distribution pays from */}
      <ImportPanel />

      {plan?.configured && (
        <>
          {plan.transferFeeBps > 0 && (
            <div className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
              ⚠ This is a Token-2022 mint with a {plan.transferFeeBps / 100}% transfer fee —
              recipients receive less than the amounts shown. Review before sending (amounts here
              are pre-fee).
            </div>
          )}
          {/* tranche selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Cumulative unlock:</span>
            {PRESETS.map((p) => (
              <button
                key={p}
                disabled={running}
                onClick={() => setUnlock(p)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  unlock === p
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted hover:text-foreground"
                }`}
              >
                {p === 40 ? "TGE 40%" : `${p}%`}
              </button>
            ))}
            {loading && <Loader2 className="size-4 animate-spin text-muted" />}
          </div>

          {/* summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-border bg-surface p-5">
                <div className="font-display text-2xl font-bold tabular-nums">{c.value}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted">{c.label}</div>
              </div>
            ))}
          </div>

          {/* treasury + action */}
          <div className="rounded-2xl border border-border bg-surface p-6">
            {!connected ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted">Connect the treasury wallet to distribute.</p>
                <ConnectWalletButton />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                  <span>
                    Treasury $DEGX:{" "}
                    <span className={`font-medium tabular-nums ${enoughDegx ? "text-foreground" : "text-danger"}`}>
                      {treasury ? formatTokens(treasury.degx, dec) : "…"}
                    </span>
                    {treasury && !enoughDegx && <span className="text-danger"> (short for this tranche)</span>}
                  </span>
                  <span>
                    SOL:{" "}
                    <span className="font-medium tabular-nums">
                      {treasury ? treasury.sol.toFixed(3) : "…"}
                    </span>
                  </span>
                  <ConnectWalletButton />
                </div>

                {!signAllTransactions && (
                  <p className="text-sm text-danger">
                    This wallet can&apos;t batch-sign. Use Phantom, Backpack, or Solflare.
                  </p>
                )}

                <Button onClick={distribute} disabled={!canRun}>
                  {running ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Distributing…
                    </>
                  ) : owedTotal > 0n ? (
                    `Distribute ${formatTokens(owedTotal, dec)} $DEGX to ${totals?.recipientCount} wallet(s)`
                  ) : (
                    "Everyone is at this unlock — nothing to send"
                  )}
                </Button>

                {progress.total > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-muted">
                      <span>
                        {progress.done} / {progress.total} wallets
                      </span>
                      <span>{Math.round((progress.done / progress.total) * 100)}%</span>
                    </div>
                    <Progress value={(progress.done / progress.total) * 100} className="mt-1.5" />
                  </div>
                )}
              </div>
            )}
          </div>

          {log.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="max-h-64 overflow-y-auto font-mono text-xs leading-relaxed text-muted">
                {log.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
