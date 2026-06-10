# Product Specification

Distilled from the developer brief (`DEGX Presale Site Brief.pdf`). This is the
living spec; numbers are mirrored in [`lib/constants.ts`](../lib/constants.ts).

## 1. Overview

$DEGX is the token of **Degxifi**, launching on **Solana** via **Jupiter Studio**'s
bonding curve. Before public launch, a **3-tier community presale** rewards early
supporters with below-market entry. Quote currency is **USDC (Solana only)**.

| Parameter | Value |
| --- | --- |
| Token | $DEGX (Degxifi Token) |
| Blockchain | Solana |
| Total supply | 1,000,000,000 DEGX |
| Presale allocation | 250,000,000 DEGX (25%) |
| Total raise target | $120,000 USDC |
| Launch platform | Jupiter Studio |
| Graduation market cap | $600,000 USDC |
| Presale duration | 7 days |
| Quote currency | USDC (Solana network only) |

## 2. Tiers

Tiers fill **sequentially** — a tier must hit its raise target before the next opens.
`price/token = market cap ÷ 1,000,000,000`.

| | Tier 1 — Early Believers | Tier 2 — Early Supporters | Tier 3 — Public |
| --- | --- | --- | --- |
| Price | $0.00036 | $0.00048 | $0.00060 |
| Implied MC | $360,000 | $480,000 | $600,000 |
| Tokens | 83,300,000 | 83,300,000 | 83,400,000 |
| Raise target | $30,000 | $40,000 | $50,000 |
| Min buy | $50 | $50 | $50 |
| Max buy / wallet | $500 | $1,000 | $2,000 |
| ROI @ graduation | +67% | +25% | 0% |
| Opens | at launch | when T1 fills | when T2 fills |

## 3. Profit scenarios (display)

ROI per tier at various market caps (always shown as **conditional**, never guaranteed):

| Market cap | Price | T1 | T2 | T3 |
| --- | --- | --- | --- | --- |
| $600K (graduation) | $0.00060 | +67% | +25% | 0% |
| $1,000,000 | $0.00100 | +178% | +108% | +67% |
| $2,000,000 | $0.00200 | +456% | +317% | +233% |
| $5,000,000 | $0.00500 | +1,289% | +942% | +733% |
| $10,000,000 | $0.01000 | +2,678% | +1,983% | +1,567% |

## 4. Pages

| Page | Route | Content |
| --- | --- | --- |
| Landing / Presale | `/` | Countdown, tier cards, invest, wallet connect, social proof |
| How It Works | `/how-it-works` | 5-step explainer (connect → tier → USDC → graduation → receive) |
| Tokenomics | `/tokenomics` | Supply breakdown, allocation chart, profit table |
| FAQ | `/faq` | Presale, graduation, distribution timeline (FAQPage JSON-LD) |
| Leaderboard | `/leaderboard` | Top referrers / contributors (marketing) |
| Quests | `/quests` | Points-earning tasks (marketing) |
| Referral | `/u/[ref]` | Invite landing + per-user flex OG card (marketing) |
| Admin | `/admin` | Password-gated dashboard |

## 5. Countdown timer

7-day timer from an admin-set start, always visible above the tier cards, format
`DD : HH : MM : SS`, shown in UTC with local conversion. On expiry: disable all
buy buttons and show a **"Presale Ended"** state. The start timestamp is
server-authoritative; the timer must persist across reloads and actually end.

## 6. Tier card

Tier label + badge, price, min/max buy, **live progress bar** (USDC raised vs
target), tokens remaining, ROI @ graduation, invest button (enabled only for the
open tier; locked tiers show "Coming Soon"/"Filled"), and a wallet-cap warning
showing how much the connected wallet already contributed to that tier.

## 7. Wallet & investment flow

1. Connect Solana wallet (Phantom / Backpack / Solflare).
2. Read address; check existing allocation in each tier.
3. User enters USDC amount (within tier min/max).
4. Validate: within limits, tier open, timer not expired, wallet cap not exceeded.
5. Approve USDC transfer to the presale wallet.
6. Confirm on-chain; record wallet, amount, tier, timestamp.
7. Confirmation screen: DEGX allocation + expected distribution date.

## 8. Admin (brief §4.5)

Set presale wallet; set/reset timer start; open/close/pause tiers manually;
export participant CSV (wallet, USDC, tier, DEGX, timestamp); live dashboard
(total raised, per-tier participants & % filled); optional Tier-1 whitelist;
announcement banner.

## 9. Validation rules (brief §6)

- **Tier sequencing** — a tier opens only when the prior tier's target is met.
- **Wallet cap** — cumulative per-wallet cap per tier ($500 / $1,000 / $2,000).
- **Min buy** — reject < $50 USDC with a clear error.
- **Timer expiry** — after 7 days all buys disabled regardless of fill.
- **USDC only** — reject SOL/other tokens with a clear error.
- **Network check** — require Solana mainnet before any transaction.
- **Duplicate/full** — show "Allocation Full" when a wallet is at tier cap.
- **Allocation calc** — `DEGX = USDC ÷ tier price`; show estimate before confirm.
- **Distribution** — tokens distributed **after graduation**, not immediately.
- **No refunds** — contributions are non-refundable once confirmed.

## 10. Developer notes (brief §10)

All USDC → one presale wallet (client-provided). Token distribution is **manual**
post-graduation via exported CSV (the site does not auto-distribute). Test on
Solana **devnet** before mainnet. Rate-limit + basic bot protection on the invest
endpoint. **Never store private keys/seed phrases.** If a tier fills before the
timer ends, the next tier opens automatically.

See [DESIGN_SYSTEM](./DESIGN_SYSTEM.md) · [DATA_MODEL](./DATA_MODEL.md) ·
[MARKETING](./MARKETING.md) · [ROADMAP](./ROADMAP.md).
