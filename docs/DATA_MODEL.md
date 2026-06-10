# Data Model (Supabase / Postgres)

Off-chain points/ledger system keyed to a **verified wallet** (token distribution
is manual post-graduation). Build the append-only ledger first; every mechanic
writes into it; the `allocations` view becomes the distribution CSV.

> Compliance: every counter/feed reads **real, confirmed** data only — see
> [MARKETING § Compliance](./MARKETING.md#compliance-non-negotiable).

## Wallet ownership proof

Connecting a wallet is not enough. Prove ownership: client
`wallet.signMessage(nonce)` → server verifies with `nacl.sign.detached.verify`
(tweetnacl) against the connected pubkey → store a session. Only the key holder
can produce a valid signature; this blocks referral/points abuse.

## Core tables

```text
participants
  wallet            text primary key            -- base58 pubkey
  referral_code     text unique not null         -- short slug
  referred_by       text references participants  -- set ONCE, immutable
  email, twitter_handle, discord_id  text
  tier              text                          -- 'og' | 'whitelist' | 'public'
  kyc_status        text default 'none'
  created_at        timestamptz default now()
  verified_at       timestamptz
  risk_score        int default 0                 -- anti-sybil

points_ledger        -- APPEND-ONLY; never update/delete
  id        bigint identity pk
  wallet    text references participants
  category  text   -- 'contribution'|'referral_l1'|'referral_l2'|'referral_l3'
                   -- |'quest'|'whitelist_bonus'|'early_bonus'|'penalty'
  points    numeric not null     -- negative = clawback
  ref_id    text
  meta      jsonb
  created_at timestamptz default now()

contributions
  id, wallet, tier, amount_usdc numeric,
  tx_sig text unique,            -- + RPC confirmation = no fake buys
  status text,                   -- 'pending' | 'confirmed'
  block_time, created_at

referrals
  id, referrer_wallet, referee_wallet, level int,  -- 1 | 2 | 3
  contribution_id, bonus_points numeric, created_at
  unique(referrer_wallet, referee_wallet, level)

referral_clicks
  code, utm, ip_hash, ua_hash, ts   -- attribution / CPA per code

quests
  id, slug, title, type, points numeric, verify_method,
  config jsonb, starts_at, ends_at, max_completions, active bool
quest_completions
  id, quest_id, wallet, status, proof jsonb, verified_at
  unique(quest_id, wallet)

leaderboard          -- plain table (Realtime can't watch a matview)
  board text, wallet text, score numeric, rank int, updated_at
  primary key (board, wallet)

whitelist
  wallet pk, tier, source, spots_granted int, kyc_status, approved_at

ambassadors
  wallet pk, code unique, name, handle, segment,
  commission_bps int, allowlist_quota int, status
```

## Allocation → CSV

```sql
create materialized view allocations as
  select wallet, sum(points) as total_points
  from points_ledger group by wallet;
```

Final distribution CSV = `allocations` × (token pool ÷ total network points).
Append-only ledger + `penalty` rows make every clawback auditable.

## Realtime & triggers

- Enable Realtime on `contributions`; an insert trigger calls
  `realtime.broadcast_changes()` → the live buys feed streams without polling.
- A trigger on `contributions` insert walks `referred_by` up 3 levels and writes
  `referral_l1/l2/l3` rows into `points_ledger`.
- A trigger/cron keeps the plain `leaderboard` table ranked (Realtime-broadcast).

## Anti-sybil (presales die here)

Reward only on **confirmed** USDC ≥ a floor (~$25); block self-referral and
referrals sharing a funding source (first-funder via RPC); per-wallet referee cap
+ velocity limits; a `risk_score` batch job holds suspicious bonuses `pending` for
manual review.

See [MARKETING](./MARKETING.md) for how these tables power the growth mechanics.
