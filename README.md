# $DEGX Presale

Presale website for **$DEGX (Degxifi Token)** — a 3-tier USDC presale on
**Solana** that graduates to **Jupiter Studio** at a $600K market cap. Built
with marketing and micro-interactions as first-class concerns.

> Confidential — Degxifi / $DEGX.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # then fill in values
pnpm dev                     # http://localhost:3000
```

Scripts: `pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint`.

Requirements: Node ≥ 20, pnpm. The presale flow (Phase 3+) needs Solana RPC,
USDC presale wallet, and Supabase credentials — see [`.env.example`](./.env.example).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
next-themes (light/dark) · Inter + Space Grotesk · Framer Motion (planned) ·
Solana wallet-adapter + web3.js/SPL (planned) · Supabase (planned) · Vercel.

## Structure

`app/` is routes only (with colocated `_components`); shared code lives in
top-level `components/`, `lib/`, `hooks/`, `types/`. Full rationale in
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

```
app/(marketing)/   public site (landing, how-it-works, tokenomics, faq,
                   leaderboard, quests, u/[ref]) + shared shell
app/admin/         password-gated dashboard
components/  lib/  hooks/  types/  config/  docs/
```

All presale numbers live in [`lib/constants.ts`](./lib/constants.ts) (single
source of truth) — never hardcode tier values in components.

## Documentation

| Doc | What |
| --- | --- |
| [ARCHITECTURE](./docs/ARCHITECTURE.md) | Stack, folder structure, conventions, data flow |
| [SPECIFICATION](./docs/SPECIFICATION.md) | Product spec distilled from the brief |
| [DATA_MODEL](./docs/DATA_MODEL.md) | Supabase schema for presale + growth systems |
| [MARKETING](./docs/MARKETING.md) | Growth strategy + compliance rules |
| [DESIGN_SYSTEM](./docs/DESIGN_SYSTEM.md) | Tokens, fonts, micro-interactions |
| [ROADMAP](./docs/ROADMAP.md) | Phased delivery plan |

## Status

**Phase 0 complete** — documentation + project setup; build is green. Next:
shell & design primitives (Phase 1). See the [roadmap](./docs/ROADMAP.md).
# presale
