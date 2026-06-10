import type { AccordionItem } from "@/components/ui/accordion";

/** Marketing copy colocated with the marketing routes (landing, faq, how-it-works). */

export const howItWorksSteps = [
  {
    title: "Connect your wallet",
    description: "Connect a Solana wallet — Phantom, Backpack, or Solflare.",
  },
  {
    title: "Choose your tier",
    description: "Pick the open tier and an amount within its min/max, in USDC.",
  },
  {
    title: "Send USDC",
    description: "Approve the USDC transfer to the presale wallet on Solana.",
  },
  {
    title: "Wait for graduation",
    description: "$DEGX graduates to Jupiter Studio at a $600K market cap.",
  },
  {
    title: "Receive $DEGX",
    description: "Tokens are distributed to your wallet after graduation.",
  },
];

export const trustSignals = [
  "USDC on Solana only",
  "On-chain verifiable",
  "Liquidity locked at graduation",
  "Non-custodial — we never hold your keys",
];

export const faqItems: AccordionItem[] = [
  {
    question: "What is the $DEGX presale?",
    answer:
      "A 3-tier community presale on Solana that lets early supporters buy $DEGX below market before it graduates to Jupiter Studio at a $600K market cap.",
  },
  {
    question: "How do the tiers work?",
    answer:
      "Tiers fill sequentially. Tier 1 ($0.00036) must reach its raise target before Tier 2 ($0.00048) opens, then Tier 3 ($0.00060). Earlier tiers get a lower price.",
  },
  {
    question: "What currency do I pay with?",
    answer:
      "USDC on the Solana network only. Do not send SOL or other tokens, and make sure you are on Solana mainnet.",
  },
  {
    question: "When do I receive my tokens?",
    answer:
      "Tokens are distributed after the bonding curve graduates at a $600K market cap on Jupiter Studio — not immediately after the presale.",
  },
  {
    question: "Is there a minimum or maximum?",
    answer:
      "Minimum is $50 USDC. Per-wallet maximums are $500 (Tier 1), $1,000 (Tier 2), and $2,000 (Tier 3), cumulative across transactions.",
  },
  {
    question: "Are contributions refundable?",
    answer:
      "No. Presale contributions are non-refundable once the transaction is confirmed on-chain.",
  },
  {
    question: "What are the risks?",
    answer:
      "Crypto is volatile and you may lose your entire contribution. $DEGX is a utility/access token with no promise of profit; any ROI figures are conditional, not guaranteed. Nothing here is financial advice.",
  },
];
