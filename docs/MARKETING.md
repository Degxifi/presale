# Marketing Strategy (built in from day 0)

The product must market itself. Marketing is a first-class part of the
architecture, not an add-on. Synthesized from persuasion frameworks, web3 growth
mechanics, CRO/copywriting, and distribution research. Data model:
[DATA_MODEL](./DATA_MODEL.md).

## Compliance (NON-NEGOTIABLE)

Honesty is both the legal requirement and what makes real scarcity persuasive.
Per 2025–26 SEC/Howey guidance + FTC dark-pattern enforcement:

- **Every counter/feed reads real state** (confirmed on-chain txns / one
  `getPresaleState()`), never client-incremented or hardcoded fakes.
- **No fake scarcity:** no countdowns that reset on reload or after zero; no
  "only N left" not bound to real remaining allocation.
- **No ROI/price guarantees:** frame ROI as *conditional* ("+67% **if** $600K MC
  is reached"). A guaranteed return ≈ a security.
- **No implied endorsement** by Jupiter, Solana, or any regulator.
- Required: global risk/disclaimer footer; geo-gate + acknowledgment before buy;
  audit/KYC badges only if real and linked; opt-in identities on leaderboards.

## Persuasion → features

- **Social proof:** `LiveBuysFeed` (real confirmed txns), `LiveWalletCounter`,
  `RaisedCounter` ($X / $120K), `TrustStrip`.
- **Honest scarcity:** `TierFillBar` (% filled, tokens left at this price),
  `PriceStepIndicator` ($0.00036 → $0.00048 → $0.00060, "+33% next tier"),
  `GraduationCountdown` (real 7-day deadline + $600K progress).
- **Commitment:** `YoureEarlyBadge` ("wallet #1,204"), multi-step `PresaleStepper`,
  "remind me for Tier 2".
- **Authority:** Solscan-verified contract/wallet badges, team credentials.
- **Unity:** "$DEGX Genesis Holder" identity + Discord role; "**we** raised $X".
- **Hooked loop:** trigger (tier alerts) → easy action (quick-buy presets) →
  variable reward (bonus % within a *disclosed bounded range*) → investment
  (holder dashboard: points, rank, referrals).
- **Hormozi value-eq:** maximize dream(status/early access) × likelihood(proof) ÷
  time(instant allocation) ÷ effort(presets, remembered wallet). Stack bonuses
  instead of cutting price. Guarantees about **delivery/transparency only**.
- **Purple Cow:** one signature talkable mechanic = a live "Graduation Engine"
  dashboard + embeddable widget; radical on-chain transparency.

## Landing-page section order (CRO)

Sticky buy-bar → **Hero** (value prop + countdown + connect-wallet CTA +
"Solana · USDC only · N holders") → **TierCards** (fill bars + next-tier step-up)
→ **ROIScenarios** (honest; show the 0% T3 case) → **HowItWorks** (incl. Jupiter
graduation) → **Tokenomics** → **TrustBar** → **SocialProof / LiveBuysFeed** →
**Roadmap** → **FAQ** (schema'd) → **FinalCTA** → **RiskDisclaimer/Footer**.
Repeat the CTA at hero / mid / end + sticky. First-person CTA copy
("Get My Tier-1 Price"). Mobile-first (most traffic is in-wallet browsers).

**Hero candidates:** "Get in at $0.00036 before the price steps up to
$0.00060." / "Buy $DEGX at presale price. Graduate at +67% to Jupiter Studio."
(ROI always conditional.)

## Growth & viral mechanics

- **Two-sided referral** (suggested 8% / 3% / 1% to referrer L1/L2/L3 + 5% to
  referee), paid as bonus $DEGX, **only on confirmed contribution**. Codes
  immutable; anti-sybil from day 1.
- **Points → allocation** (sub-linear/whale-damped accrual, early multipliers).
- **Quests / share-to-earn** (native lean layer + a Galxe/Zealy campaign for reach).
- **Leaderboards** (top referrers/contributors; plain table + Realtime).
- **Whitelist / tiered early access**; **KOL / ambassador** program (privileged
  referral + per-code attribution dashboard).
- **Community loop:** Discord/X OAuth link → roles; `PostBuyShareModal` with a
  prefilled tweet converts buys into posts.

## Viral flex-card loop (killer asset)

Per-user dynamic OG card at `app/(marketing)/u/[ref]/opengraph-image.tsx` (Next
`ImageResponse`/Satori — inline styles only, flexbox, < 500KB, Node runtime)
showing tier / allocation / projected ROI / @handle. The referral link unfurls
as a personalized brag in X/TG/Discord → new visitor converts → gets their own
code. Plus `ShareButtons` (X intent, rotating prefilled copy), `/api/og/flex`,
`/api/og/milestone`.

## Distribution (Traction Bullseye, 7-day window)

Inner ring: **(1) Viral/referral loop, (2) Existing platforms** (CoinGecko/CMC/
CoinSniper, X, Telegram, quest platforms), **(3) Community**. Then KOLs, PR,
content. A new domain **can't rank organically in 7 days** — build technical SEO
(`sitemap.ts`, `robots.ts`, JSON-LD FAQ/HowTo, OG images) for post-graduation
compounding; win transactional terms via PR reprints/listicles.

## Analytics / attribution

Capture `utm_*` / `ref` on first touch (cookie + localStorage; write on wallet
connect; wrap `useSearchParams` in `Suspense`). Events: `presale_viewed`,
`wallet_connected`, `tier_selected`, `purchase_submitted/confirmed`,
`share_clicked`, `referral_link_copied`, `quest_completed`. PostHog (funnels +
attribution) joined to Supabase (on-chain-verified source of truth); Meta/X pixel
for retargeting only.
