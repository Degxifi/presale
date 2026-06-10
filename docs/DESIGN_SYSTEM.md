# Design System

**Aesthetic:** "Refined dark-fi", professionally clean. Deep panels, subtle
(never gaudy) neon-green glow, hairline borders, generous spacing, crisp
numerals. Light **and** dark mode. Treat the polish bar as a premium product.

## Theming

Semantic CSS variables in `:root` (light) and `.dark` (dark) in
[`app/globals.css`](../app/globals.css), mapped to Tailwind utilities via
`@theme inline`. next-themes toggles `.dark` on `<html>` (system default +
manual toggle). A single utility class (`bg-background`, `text-foreground`)
adapts to the active theme.

## Tokens

| Token | Utility | Dark | Light | Use |
| --- | --- | --- | --- | --- |
| background | `bg-background` | `#0d1117` | `#f7f8fa` | page |
| surface | `bg-surface` | `#161b22` | `#ffffff` | cards/panels |
| surface-2 | `bg-surface-2` | `#1c232c` | `#eef1f5` | inputs/raised |
| border | `border-border` | `#2a313c` | `#e4e8ee` | hairlines |
| foreground | `text-foreground` | `#e6edf3` | `#0d1117` | text |
| muted | `text-muted` | `#9aa4b2` | `#5b6573` | secondary text |
| accent | `bg-accent` | `#00ff88` | `#00b85f` | buttons, highlights |
| accent-foreground | `text-accent-foreground` | `#07150d` | `#05130b` | text on accent |
| gold | `text-gold` | `#ffd700` | `#9a7400` | prices, key numbers |
| tier-1 | `bg-tier-1` | `#1a3a2a` | `#e9f6ef` | Tier 1 card (green) |
| tier-2 | `bg-tier-2` | `#1a2a3a` | `#e9f0fb` | Tier 2 card (blue) |
| tier-3 | `bg-tier-3` | `#2a1a3a` | `#f1eafb` | Tier 3 card (purple) |
| success / warning / danger | `*-success` … | green / gold / red | — | status |

Each tier also has a `*-ring` token for borders/badges/progress accents.
`glow-accent` utility applies a subtle accent glow (dark-mode only via token).

## Typography

- **Inter** — body/UI. Excellent **tabular numerals** for prices/market caps.
  Utility: `font-sans` (default body).
- **Space Grotesk** — display: headings + big numbers. Utility: `font-display`
  (auto-applied to `h1`–`h3`).
- Wired via `next/font/google` in [`app/layout.tsx`](../app/layout.tsx) as CSS
  variables `--font-inter` / `--font-space-grotesk`.

## Micro-interactions (built in)

Motion is a first-class requirement (see also memory). Principles: subtle +
purposeful, fast (≈150–250ms), spring physics for playful bits, **respect
`prefers-reduced-motion`**, animate `transform`/`opacity` only, shared
easing/timing tokens. Library: **Framer Motion** (`motion`) for React
spring/gesture/layout; CSS/Tailwind transitions for simple hover/focus.

Apply to: button hover/press/disabled; tier-card hover lift + glow; count-up on
numbers (raised total, prices, ROI, wallet count); progress-bar fills;
copy-to-clipboard feedback; toasts; wallet-connect + loading states; skeleton
loaders; scroll-reveal sections; milestone confetti (**real milestones only**);
live-feed item enters; theme-toggle transition; accordion/tab transitions;
sticky-CTA show/hide.

## Components (planned)

- `components/ui/` — Button, Card, Badge, Progress, Input, Skeleton, Toast, Tabs,
  Accordion (with built-in motion).
- `components/layout/` — Header, Footer, ThemeToggle.
- `components/marketing/` — RaisedCounter, LiveBuysFeed, LiveWalletCounter,
  TierFillBar, PriceStepIndicator, GraduationCountdown, TrustStrip.
- `components/share/` — ShareButtons, FlexCard.

Conventions: brand colors via semantic tokens (never raw hex in components);
prices/numbers use [`lib/format.ts`](../lib/format.ts); dark-mode-first but verify
both themes.
