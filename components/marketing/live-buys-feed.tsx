"use client";

import { AnimatePresence, motion } from "motion/react";
import { shortWallet, usd } from "@/lib/format";
import { usePresaleStats } from "@/hooks/use-presale-stats";

/** Live feed of recent confirmed contributions (real data only). */
export function LiveBuysFeed() {
  const stats = usePresaleStats();
  const buys = stats?.recentBuys ?? [];

  if (!buys.length) {
    return (
      <p className="text-center text-sm text-muted">
        Live contributions will appear here as the presale fills.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {buys.map((b) => (
          <motion.li
            key={b.txSig}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5 text-sm"
          >
            <span className="font-mono text-muted">{shortWallet(b.wallet)}</span>
            <span>
              bought <span className="font-medium text-gold">{usd(b.amount)}</span>{" "}
              · Tier {b.tier}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
