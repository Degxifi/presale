# Roadmap

Phased delivery. **Phase 0 is done** (this commit): documentation + Next.js
project setup. Later phases are sequenced for the fastest path to a working,
self-marketing presale.

## Phase 0 — Foundation ✅

- Next.js 16 + Tailwind v4 + TypeScript scaffold (no `src`, `(marketing)` group).
- Design system: light/dark tokens (`@theme inline`) + Inter/Space Grotesk.
- next-themes provider (system + toggle).
- Folder skeleton (colocation + private folders) and route stubs.
- Data layer: `lib/constants.ts` (source of truth), `lib/presale.ts`,
  `lib/format.ts`, `types/presale.ts`.
- `.env.example`; documentation (`docs/`); memory captured. Build is green.

## Phase 1 — Shell & design primitives

- Theme toggle; site header + footer; global disclaimer footer.
- `components/ui` primitives (Button, Card, Badge, Progress, Skeleton, Toast)
  with built-in micro-interactions (Framer Motion).
- Skeleton/loading + error states.

## Phase 2 — Landing & marketing UI (static)

- Hero, TierCards (fill bars, next-tier step-up), ROIScenarios, HowItWorks,
  Tokenomics, TrustBar, Roadmap, FAQ (FAQPage JSON-LD), FinalCTA.
- Countdown timer (admin-set start, persists across reloads, ends at zero).
- SEO infra: `sitemap.ts`, `robots.ts`, default OG/Twitter images.

## Phase 3 — Wallet & investment flow

- Solana wallet-adapter (Phantom/Backpack/Solflare); sign-message ownership proof.
- USDC SPL transfer to presale wallet; RPC confirmation; validation (min/max,
  tier open, timer, wallet cap, USDC-only, mainnet); confirmation screen.
- **Devnet testing first.**

## Phase 4 — Backend & data (Supabase)

- Schema from [DATA_MODEL](./DATA_MODEL.md): participants, points_ledger,
  contributions, referrals, leaderboard, quests, whitelist, ambassadors.
- Record confirmed contributions; live `RaisedCounter` + `LiveBuysFeed`
  (Realtime); rate limiting + bot protection.

## Phase 5 — Admin panel

- Password gate; set presale wallet; timer control; tier open/close/pause;
  live dashboard; **participant CSV export**; announcement banner; optional
  Tier-1 whitelist.

## Phase 6 — Growth & virality

- Two-sided referral (codes, `/u/[ref]`, attribution trigger, anti-sybil holds).
- Per-user flex OG cards + ShareButtons; `/api/og/flex`, `/api/og/milestone`.
- Leaderboard + holder dashboard; quests; ambassador dashboard.
- Analytics/attribution (PostHog + UTM/ref capture).

## Phase 7 — Launch hardening

- Full mobile QA (in-wallet browsers); accessibility + reduced-motion pass;
  geo-gate + disclaimers; security review; listing metadata (CG/CMC/CoinSniper);
  press/media kit. Deploy to Vercel; final review; handover.

## Post-graduation

- Snapshot `allocations` → distribution CSV; client sends $DEGX to wallets.
- SEO/content compounding for secondary-market interest.

See [SPECIFICATION](./SPECIFICATION.md) for requirements and
[MARKETING](./MARKETING.md) for the growth strategy.
