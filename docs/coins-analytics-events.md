# Coins — Analytics event catalog

Events that must land in whatever analytics stack FateRound already
uses (PostHog, Amplitude, GA, Supabase logs — pick per project). These
are the raw signals the Live-tuning playbook in
`coins-and-shop-plan.md` depends on. Instrument all of them in
Phase 1 so day-one data is captured; the dashboards land in Phase 2.

## Naming convention

- `coins_*` for every event
- snake_case
- Past tense for observable actions (`coins_earned`, not `earn_coins`)
- Common properties across every event: `profile_id` (null if guest),
  `device_id` (guest only), `session_id`, `platform` (`web` /
  `web-mobile` / `mobile-ios` / `mobile-android`), `client_version`,
  `ts` (client-side ms since epoch)

## Events

### Earning

**`coins_earned`** — fired every time a coin ledger row is written
for a profile.
- `amount` (int)
- `reason` (`win` / `daily_challenge` / `streak_multiplier` /
  `tournament_placement` / `host_bounty` / `first_mode_bonus` /
  `launch_grant_v1` / `welcome_v1` / `guest_migration` /
  `admin_adjustment`)
- `balance_after` (int)
- `ref_id` (game id / tournament id / null)
- `game_type` (nullable — set for room-play earnings)
- `player_count` (int, nullable — the room's human count for anti-farm
  audits; null for non-room earnings)

**`coins_earned_guest`** — fired when a guest earns coins that are
held in `guest_pending_grants`.
- `amount`
- `reason` (same enum minus the profile-only ones)
- `device_id`, `session_id`
- `game_id`
- `game_type`

**`coins_grant_gated`** — fired when a coin grant was *not* awarded
because of a gate (anti-farming floor, cap reached, ineligible
context). One event per gate hit so we can size the gate's real-world
impact.
- `attempted_amount` (int)
- `reason`
- `gate` (`anti_farm_min_humans` / `retro_backfill_cap` /
  `guest_migration_cap` / `admin_daily_cap`)
- `game_type` (nullable)
- `player_count` (int, nullable)

### Spending

**`shop_viewed`** — the shop page loaded.
- `entry_point` (`nav_click` / `coin_chip` / `deep_link` /
  `notification` / `other`)

**`shop_item_viewed`** — a shop item was scrolled into view or
clicked open.
- `item_kind` (`edition` / `theme` / `frame` / `name_color` /
  `winner_animation` / `card_template` / `streak_freeze` /
  `library_pack`)
- `item_slug`
- `item_price` (coins)
- `owned` (bool)
- `interaction` (`impression` / `open`)

**`shop_item_purchase_started`** — buyer tapped the buy button and
sees the confirm dialog.
- `item_kind`, `item_slug`, `item_price`
- `balance_before`

**`shop_item_purchased`** — purchase confirmed and ledger written.
- `item_kind`, `item_slug`, `item_price`
- `balance_after`

**`shop_item_purchase_failed`** — purchase attempt failed (insufficient
funds, race condition, server error).
- `item_kind`, `item_slug`, `item_price`
- `reason` (`insufficient_funds` / `already_owned` / `server_error` /
  `network_error`)

**`shop_item_equipped`** — player equipped a purchased cosmetic
(frame, name color, animation, card template).
- `item_kind`, `item_slug`

### Inline spending (extra bots, premium packs)

**`inline_purchase_offered`** — an inline coin gate rendered (e.g. an
"Add bot — 50 coins" button became visible).
- `context` (`room_lobby_extra_bot` / `library_pack`)
- `item_kind`, `item_slug`, `item_price`
- `owned` (bool — for one-shot items always false)

**`inline_purchase_confirmed`** — inline purchase went through.
- `context`, `item_kind`, `item_slug`, `item_price`
- `balance_after`

### Guest → profile migration

**`signup_coin_cta_shown`** — the "Sign up to claim X coins" CTA
rendered on a results screen.
- `pending_amount` (int — the amount visible on the CTA)
- `game_id`, `game_type`

**`signup_coin_cta_clicked`** — player tapped the CTA.
- `pending_amount`, `game_id`, `game_type`

**`guest_grants_migrated`** — a new signup consumed
`guest_pending_grants` rows into a profile.
- `raw_amount` (int, uncapped sum)
- `granted_amount` (int, after cap)
- `capped` (bool)
- `grant_rows_consumed` (int)

**`welcome_grant_delivered`** — the 100-coin welcome grant landed.
- `granted_amount`
- `plus_guest_migration_amount` (int, 0 if none)

### Backfill (existing players)

**`launch_backfill_delivered`** — one row per profile the retro grant
was written to. Fires once per profile at migration time; the itemized
welcome screen is a separate `launch_backfill_welcome_shown`.
- `raw_amount`, `granted_amount`, `capped`
- `component_trophies`, `component_daily_challenges`,
  `component_tournaments`, `component_games_finished`,
  `component_welcome`

**`launch_backfill_welcome_shown`** — the itemized welcome screen
rendered for the first time for this profile.
- `granted_amount`

**`launch_backfill_welcome_dismissed`** — player closed the itemized
welcome screen.
- `dwell_ms` (int, time on the screen)

### Ledger / history

**`coin_history_viewed`** — the Coin History surface opened.
- `entry_point` (`profile_card` / `chip_longpress` / `deep_link`)

### Admin

**`admin_coin_adjustment`** — admin credited or debited a player's
balance.
- `admin_id`
- `target_profile_id`
- `amount` (positive or negative)
- `admin_category` (`bug_reimbursement` / `support_goodwill` /
  `promotion` / `correction` / `other`)
- `balance_after`
- `admin_note_length` (int — length only, not the note itself, for
  privacy)

### Refund (support flow, not self-serve in v1)

**`support_refund_requested`** — fired when support opens a refund
request for a player. This is the signal the Live-tuning playbook
watches to decide whether to build self-serve refunds in v2.
- `item_kind`, `item_slug`, `item_price`
- `reason` (free text field — cap length in event payload; ~500 chars)

## Dashboards to build against these events

Land these in Phase 2. Each maps to a metric in the Live-tuning
playbook.

1. **Weekly earn/spend chart** — sum(`coins_earned.amount`) vs
   sum(`shop_item_purchased.item_price + inline_purchase_confirmed
   .item_price`) per week. Alert if the ratio drifts >2× off 1:1.
2. **Median coins earned per active player per week** — group
   `coins_earned.amount` by `profile_id` and week, take the median.
   Target 200–400.
3. **Top-selling shop items** — count and coin-volume of
   `shop_item_purchased` by `item_slug`, weekly.
4. **Signup CTA conversion** — `signup_coin_cta_clicked` /
   `signup_coin_cta_shown`. Baseline against pre-coins signup rate.
5. **Guest migration cap-hit rate** — % of `guest_grants_migrated`
   with `capped: true`. If >20 %, either the cap is too low or
   guest earning is out of control.
6. **Anti-farm gate hit rate** — count of `coins_grant_gated` with
   `gate: anti_farm_min_humans` per week. Signals real-world
   friction and whether the floor is set right.
7. **Retro-backfill distribution** — histogram of
   `launch_backfill_delivered.granted_amount` at migration time. One
   shot; keep the chart around for the next backfill's tuning.
8. **Wallet distribution p50/p90/p99** — computed from
   `balance_after` snapshots; alert if p99 grows >5× median (whale
   signal).
9. **Support refund request rate per item** — count of
   `support_refund_requested` by `item_slug`, weekly. Sustained
   > threshold → build self-serve refunds in v2.

## What we deliberately do NOT track

- No PII in event payloads beyond `profile_id` (already accounted
  for elsewhere) and `admin_id`. Free-text admin notes stay in the
  DB, only note *length* goes to analytics.
- No card/payment data — none exists in v1 (no real money).
- No cross-profile identity linking beyond the guest → signup
  migration which is opt-in-by-signup.

## Instrumentation checklist for Phase 1

- [ ] Event schema registered in the analytics stack
- [ ] Server-side emit at every ledger write
- [ ] Client-side emit for every UI-only event (impressions, dwell,
      dismissals)
- [ ] `platform` property populated correctly across web / web-mobile
      / mobile-ios / mobile-android
- [ ] PII scan — no free-text admin notes, no email, no phone in any
      event payload
- [ ] Sampling — full-fidelity for all events (volume is low enough at
      launch scale; do not pre-optimize)
