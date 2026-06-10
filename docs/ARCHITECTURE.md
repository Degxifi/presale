# Architecture

How the $DEGX presale site is structured and why. Decisions here follow the
official [Next.js project-structure guide](https://nextjs.org/docs/app/getting-started/project-structure).

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router, Turbopack) | `create-next-app` `app-tw` template |
| Language | **TypeScript** (strict) | `@/*` → project root |
| UI | **React 19** | Server Components by default |
| Styling | **Tailwind CSS v4** | `@theme inline` tokens, no config file |
| Theming | **next-themes** | light + dark, system default + manual toggle |
| Fonts | **Inter** (body) + **Space Grotesk** (display) | `next/font/google` |
| Motion | **Framer Motion** (planned) | micro-interactions built in — see [DESIGN_SYSTEM](./DESIGN_SYSTEM.md) |
| Wallet | **@solana/wallet-adapter** (planned) | Phantom, Backpack, Solflare |
| Payments | **@solana/web3.js + SPL Token** (planned) | USDC transfer to one presale wallet |
| Backend/DB | **Supabase** (planned) | Postgres + Auth + Realtime |
| Analytics | **PostHog** (planned) | funnels + attribution |
| Hosting | **Vercel** | `presale.degxifi.com` |

## Folder structure

Strategy: **"split project files by feature or route"** + **private folders**.
Route-specific code is colocated in non-routable `_components`/`_lib` folders
inside the route segment; cross-route code lives in top-level folders. `app/`
is at the project root (no `src/`), matching the recommended-defaults scaffold.

```
presale/
├─ app/                      # ROUTES ONLY (+ colocated route code)
│  ├─ (marketing)/           # public site; shared shell; group omitted from URL
│  │  ├─ page.tsx            # / landing / presale
│  │  ├─ how-it-works/  tokenomics/  faq/  leaderboard/  quests/
│  │  ├─ u/[ref]/            # /u/[ref] referral landing (+ flex OG card)
│  │  ├─ _components/        # COLOCATED page-specific UI (Hero, TierCards…)
│  │  └─ layout.tsx          # marketing shell (header/footer)
│  ├─ admin/                 # password-gated; _components/, _lib/
│  ├─ api/                   # route handlers
│  ├─ layout.tsx             # root layout (fonts, metadata, Providers)
│  ├─ providers.tsx          # client providers (theme; wallet/data later)
│  └─ globals.css            # Tailwind + design tokens
├─ components/               # GLOBALLY shared
│  ├─ ui/                    # primitives (Button, Card, Badge, Progress)
│  ├─ layout/                # Header, Footer, ThemeToggle
│  ├─ marketing/             # cross-route marketing (counters, social proof)
│  └─ share/                 # share buttons, flex card
├─ lib/                      # constants.ts, presale.ts, format.ts,
│  │                         #   solana/, supabase/, analytics/, referral/
├─ hooks/   types/   config/
├─ docs/                     # this documentation
└─ public/
```

**Rule of thumb:** used by one route → colocate in that route's `_components`.
Used across routes → `components/`. Logic/data → `lib/` + `types/`.

## Conventions

- **Route groups** `(marketing)` organize without affecting the URL and enable a
  shared layout separate from `/admin`.
- **Private folders** `_folder` are never routable — safe for colocated UI/utils.
- **Single source of truth:** all presale numbers live in [`lib/constants.ts`](../lib/constants.ts);
  calculations in [`lib/presale.ts`](../lib/presale.ts); display formatting in
  [`lib/format.ts`](../lib/format.ts). Never hardcode tier values in components.
- **Server Components by default**; mark interactive/stateful components
  `"use client"` (wallet, countdown, toggles). Lazy-load heavy wallet code.

## Data flow (planned)

1. Client connects a Solana wallet and signs a message to prove ownership.
2. Contribution = USDC SPL transfer to the presale wallet; tx confirmed via RPC.
3. Confirmed contributions are recorded in Supabase (source of truth for the
   live feed, counters, leaderboard, and the final distribution CSV).
4. Every live counter reads **real** state only — see
   [compliance rules in MARKETING](./MARKETING.md#compliance-non-negotiable).

## Theming

Semantic CSS variables are defined in `:root` (light) and `.dark` (dark) in
`globals.css`, then mapped to Tailwind utilities via `@theme inline`. next-themes
toggles the `.dark` class on `<html>`. See [DESIGN_SYSTEM](./DESIGN_SYSTEM.md).
