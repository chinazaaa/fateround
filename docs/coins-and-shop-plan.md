# Coins & Shop — Plan

A brainstorm-to-plan document for FateRound's first virtual economy. This is
what we're shipping in month one, why, and what we deliberately are not
shipping yet.

## Core principles (the rules the whole design comes back to)

1. **No profile, no visible balance.** Guests can play everything they play
   today. Their earnings are tracked invisibly (see the guest-migration
   section below) and materialize at signup. Guests never see a running
   balance — nothing to "lose," and the signup CTA is stronger because it
   quotes an itemized real number.
2. **Coins live in the meta layer, never in the game.** They buy cosmetics,
   unlocks, and things around gameplay — never advantages inside a live
   round. This keeps competitive integrity intact and keeps us clear of
   pay-to-win / gambling adjacency when we monetize.
3. **In-game costs pay with in-game resources.** Hints, retries that count,
   help mid-round — priced in score, guesses, or time. Not coins.
4. **Coins are earned; owned items are kept.** Purchases are permanent. No
   expiring cosmetics, no re-buying next month. Consumables (bots, streak
   freeze) must be crystal clear "1 use" at purchase time.
5. **All coin earning is announced on the end-of-game results screen.** One
   surface, one moment, no mid-round intrusions.
6. **Never take away what was free.** Only sell new things, or convenience
   on top.
7. **Curated over free-picker.** Colors, frames, templates — a designed
   palette, not a rainbow wheel. Otherwise every result screen looks bad.

## Vocabulary (used consistently everywhere)

| Term | What it is | Example | Lives in |
|---|---|---|---|
| **App theme** | Global light/dark/accent | dark mode | Settings, free forever |
| **Game theme** | Visual reskin of one game | Neon Whot, Wood Sudoku | Shop |
| **Game edition** | Rule-scoped content variant of one game | Estate Kings: Naija | Shop |
| **Pack** | Content a game consumes | Trivia 90s, Crossword Movies | Library |
| **Frame** | Ring/decoration around avatar | Gold ring, laurel | Shop |
| **Name color** | Colored/gradient player name | Solid coral, sunset gradient | Shop |
| **Winner animation** | Flourish on the results screen | Confetti, fireworks | Shop |
| **Card template** | Style of the shareable results card | Gold luxe, Neon | Shop |
| **Streak freeze** | Meta-level protection for a missed daily | one-shot | Shop |
| **Extra bot** | Second+ bot in one room-session | one-shot per bot | Inline (room lobby) |
| **Premium library pack** | Coin-gated content pack | Trivia: Nigeria pack | Inline (library row) |

## In scope for month one

### Foundation

- `profiles.coins bigint not null default 0`
- `coin_ledger (id, profile_id, delta, balance_after, reason, ref_id,
  admin_id, admin_note, admin_category, created_at)` — every credit/debit
  is a row. Reasons: `win`, `daily_challenge`, `streak_multiplier`,
  `tournament_placement`, `host_bounty`, `first_mode_bonus`,
  `launch_grant_v1`, `welcome_v1`, `guest_migration`, `shop_purchase`,
  `refund`, `admin_adjustment`.
- `guest_pending_grants (id, device_id, session_id, game_id, delta, reason,
  created_at)` — guest earnings held server-side until signup materializes
  them into `coin_ledger`.
- Owned-items tables per category:
  `profile_owned_editions (profile_id, edition_slug)`
  `profile_owned_themes (profile_id, theme_slug)`
  `profile_owned_frames (profile_id, frame_slug)`
  `profile_owned_name_colors (profile_id, color_slug)`
  `profile_owned_animations (profile_id, animation_slug)`
  `profile_owned_card_templates (profile_id, template_slug)`
  `profile_owned_packs (profile_id, pack_id)`
- `profiles.equipped_frame`, `equipped_name_color`, `equipped_animation`,
  `equipped_card_template` — the currently-active cosmetics.
- Server-side spend + earn functions (all mutations authed, ledger-first,
  never trust client balance).

### Earning — all on the end-of-game results screen

- **Win / placement** in a room
- **Daily challenge completion** + streak multiplier
- **Tournament placement** — per-game inside the tournament + a bonus at
  tournament finish
- **Host bounty** when a room reaches N rounds (rewards hosts, who do the
  work)
- **First-time-playing-a-mode bonus** (discovery lever — nudges people into
  the long tail of 49 modes)
- Guest sees "Sign up to claim X coins" on the results screen with the
  number *from this game only* (not a running total — no history hint).
- The shop is invisible to guests entirely (no "browse signed out" mode).
  Preserves the wow at signup and forecloses guest-only exploits.

### Shop page (main-nav item)

Browseable, category-filtered, "owned" badge on things already unlocked.

1. **Game themes** — 2–3 at launch (Whot, Ludo, Sudoku picks)
2. **Winner animations** — 2–3 (confetti, fireworks, one signature)
3. **Card templates** — 2 premium (default stays free)
4. **Avatar frames** — 4–6
5. **Name colors** — 6 solids + 3 gradients
6. **Streak freeze**

Editions are deliberately not in the launch shop — see "Grandfathering
existing content" below. The first paid edition ships as a month-2 drop
so it gets its own launch beat.

### Inline (contextual, at moment of use)

7. **Extra bot seats** — button in the room lobby shows "50 coins" after
   the first free one. Flat cost across all games. Consumable per-bot,
   per-room.
8. **Premium library packs** — coin badge on library rows. Tap to preview
   1–2 items, tap again to unlock. Owned forever after purchase. Existing
   packs stay free; only new admin-authored packs marked
   `price_coins > 0` show the badge.

### UI

- Coin balance visible on profile page and shop, **not in-game**
- End-of-game coin award panel on the results screen (itemized: "Won: +30 ·
  Full lobby: +10 · Streak x2: +20 · Total: +60")
- Signup CTA showing the actual coin amount at claim moments
- Ledger / history view on profile
- "Owned" badge and greyed-out state for owned shop items

## Explicitly not in scope this month

- **Coin packs (real money)** — wait until earn/spend ratios settle
- **Subscriptions, battle pass, gifting** — later stages of monetization
- **Wagering / anteing** — regulatory surface is asymmetric to upside;
  revisit only if hosts repeatedly ask
- **Host AI generation** — hidden until real-money monetization is on,
  because each generation costs real backend money
- **Anything that affects in-game outcomes** (jail cards, mid-round buffs,
  paid tournament advantages)
- **Daily challenge hints as coin sinks** — hints exist but cost score, not
  coins (in-game currency for in-game costs)
- **Persistent room perks** (vanity codes, room themes, room backgrounds) —
  people don't heavily use rooms yet; not the right first bet
- **Free color picker for names** — curated palette only
- **Ads** — do not need them yet, and they'd tank the party vibe
- **Loot boxes / gacha** — regulatory risk and audience-age mismatch

## Grandfathering existing content

Everything already shipped stays free. This applies to editions, themes,
and library packs alike. Paywalling something players already had is
"never take away what was free" — a rule we do not bend.

### Editions

- Estate Kings: Naija (and any other edition that exists today) —
  `price_coins = 0`, marked as grandfathered/default. Free forever,
  playable by any host, no `profile_owned_editions` row needed to use.
- Every game keeps at least one free edition so a host with zero
  purchases can create rooms in every mode.
- **New editions ship with `price_coins > 0` from day one** — they were
  never free, so no expectation is violated.

### Themes

- Any theme already available in the app (chess piece sets, board
  themes, etc. as of launch day) — free.
- New themes ship priced.

### Library packs

- Every pack that exists today — free.
- New admin-authored packs can be marked paid or free at creation time.

### Implication for the launch shop

Editions are deliberately **not** in the launch shop, because the only
edition we have (Naija) is grandfathered and shipping a new one requires
real art/content work. Better sequencing: launch the shop with themes,
frames, colors, animations, card templates, streak freeze, and premium
packs — a dense, buyable lineup — and ship the **first paid edition as a
month-2 drop**. That gives the edition its own launch beat ("first paid
edition just dropped") instead of being buried among ten launch items.

**First paid edition: Estate Kings — America.** Full property list,
color groups, station/utility names, and card flavor rewrites are in
[`docs/estate-kings-america-edition.md`](./estate-kings-america-edition.md).
Ships as a month-2 drop with its own launch beat.

**Trademark note.** Do not use classic Monopoly property names
(Boardwalk, Park Place, Marvin Gardens, etc.) — those are Hasbro
trademarks. Use original US-themed street/landmark names instead. Same
rule applies to card flavor text ("Advance to Fifth Avenue," not
"Advance to Boardwalk"). This keeps the edition clearly "the American
edition" to every player without inviting a takedown letter.

Future edition candidates (month 3+): Arctic, Christmas, Lagos, Tokyo,
London, Campus/School Championship.

## Games that can have EDITIONS vs THEMES

An **edition** requires a content layer inside the rules (property names,
themed cards). A **theme** requires a rich visual surface.

### Ship as editions (content variants)

Only one game truly warrants an edition surface at launch:

- **Estate Kings** — Naija, Arctic, Lagos, Tokyo, Christmas, Retro. Property
  names, card flavor, currency, landmark art.

Party/question games (Trivia, Would You Rather, Never Have I Ever, Most
Likely To, Codewords, Punchline, Bingo, Two Truths, Date My Kid, Smash Marry
Kill, Red Flag Green Flag, Hot Seat, Who Said This, and the word games:
Word Search / Hunt / Scramble / Grouping, Wordle, Crossword) — these are
**packs in the library**, not editions. Do not build two systems for the
same idea.

### Ship as themes (visual reskin)

- Whot (card back, deck art, table felt)
- Sudoku (board frame, digit typography, palette)
- Chess (piece sets, board)
- Checkers — American / International / Nigeria
- Ludo (board, pieces, dice)
- Snake & Ladder (board illustration)
- Ayo (bowl art, seed art)
- Mahjong (tile face, felt)
- Crazy Eights / Match Up (card backs)
- Five Dice / Yahtzee (dice faces, scorecard)
- Matching Pairs (card art sets)
- Quick Draw (brush/canvas)
- Troll Run / Landmine (skins)
- Mafia / Secret Message / Anonymous Room (role cards, envelope art)
- Word Tiles / Scrabble (tile/board art)

### Not shop products (skip)

- Tic-Tac-Toe (too structural)
- Pick a Number, I Call On (NPAT), Custom Game (nothing to skin)
- Text Charades (mostly text UI)

## Existing field-name mapping

We are not going to rename DB columns at launch — a rename migration touches
too many game views. Instead, this table documents how existing fields map
to the new vocabulary. Rename only when we touch a given game for other
reasons.

| Current field | Concept in new vocab | Rename recommendation |
|---|---|---|
| `crossword_theme` | Pack | eventually → `crossword_pack_id` |
| `word_search_theme` | Pack | eventually → `word_search_pack_id` |
| `word_scramble_theme` | Pack | eventually → `word_scramble_pack_id` |
| `chess_board_theme` | Theme | keep |
| `chess_piece_set` | Theme | keep |
| `game.theme` (generic) | Theme (mostly) | keep; add `game.edition_slug` for Estate Kings when the edition ships |
| `is_bot` on `players` | (unchanged) | keep — bots are already player rows |

## Where cosmetics render (grounded audit)

All of the shop cosmetics we're shipping ride on components that already
exist in `src/components/` and are already shared across all 49 games.
That's why the surface is small.

### Avatar frames (via shared `Avatar.tsx`)

Frame renders wherever `Avatar` is used. Confirmed usages:

- `RoomLobby` (pre-game seat list)
- `WaitingView` (between-round waiting)
- `RoundResultsView` (end-of-round scoreboard, every game, every round)
- `FinalLeaderboard` (final standings)
- `FinishedWinner` (winner hero)
- `PlayerSessionBar` (persistent player bar during play)
- `VoteResults`, `CustomVoteCard`, `CustomRoundResults`
- `PollHostView`, `PollGamePlayerExperience`
- `LudoBoard` (turn indicator on the board)
- `DailyLeaderboardClient`
- `PublicProfileCard`
- `ProfileChip`
- `MltPlayerPicker`
- `PlayAgainSetup`

Frames must read well at 40 px+. In 32 px `sm` contexts (leaderboard rows)
the ring shows but fine detail is lost — design accordingly.

### Name colors (add a small `PlayerName` treatment)

Names render next to avatars in every surface above, plus chat and voice
indicators. Introduce a shared `PlayerName` component that reads the
profile's `equipped_name_color` slug and applies the treatment. Solid
palette + a handful of curated gradients; no free picker.

### Winner animation (via `FinishedWinner.tsx`)

`FinishedWinner` is the shared winner hero used by every game's finished
screen. Read `equipped_animation` from the winner's profile and render an
overlay (CSS/SVG/Lottie). Every viewer in the room sees it.

### Card templates (via `FinalResultsShareBlock.tsx` + `ShareResultsCaptureHeader.tsx`)

The shared results-share pipeline screenshots the current results card via
`captureRef`. Templates are pure JSX/CSS variants of the wrapper — same
capture flow, different styling. Read `equipped_card_template` from the
owner's profile.

### Editions (Estate Kings today)

Add a `game_editions` table:
`game_editions (id, game_type, slug, name, content jsonb, price_coins,
active)`. Content JSONB holds property names, card text, art refs, currency
symbol. Every game has a default free edition. Room creation flow picks the
edition; every player at the table experiences it, whether they own it or
not — the host is essentially "hosting the edition" for the session. Guests
seeing it is the marketing loop.

### Themes (per-game)

Follow the pattern already in place for `chess_board_theme` +
`chess_piece_set`. Each themable game gets a per-game theme slug column
(or reuses `game.theme`), and a `game_themes` table:
`game_themes (id, game_type, slug, name, art jsonb, price_coins,
active)`. Owned themes are picker options for the host in room creation.

## Proposed price bands

Tune these once we see actual earn rates in the first two weeks — but
starting values:

| Item | Coins | Rationale |
|---|---|---|
| Streak freeze | 500 | Non-trivial but not scary; cap 1 use per week |
| Extra bot seat (per bot per room) | 50 | Small enough to buy on impulse, adds up |
| Name color (solid) | 150 | Cheap taste item; buy several |
| Avatar frame | 200 | Vanity, visible everywhere |
| Card template | 250 | Nice one-time flourish |
| Name color (gradient) | 300 | Premium vs solid |
| Winner animation | 300 | Seen by whole room per win |
| Premium library pack | 300 | Content pack, played many times |
| Game theme | 400 | Visual reskin, per-game |
| Game edition | 800 | Cinematic, new-game-feeling, headline shop item |

**Coin-earning starter numbers** (tune from live data):

| Event | Coins |
|---|---|
| Win a round | 15 |
| Placement (2nd–3rd) in a round | 5–8 |
| Full-lobby bonus (5+ players) | +10 |
| Daily challenge completion | 30 |
| Daily streak multiplier | x1.0 → x2.0 over 30 days |
| First time playing a new mode | 50 |
| Host bounty (room reaches 5 rounds) | 25 |
| Tournament — per game | 5 |
| Tournament — finish placement (top 3) | 100 / 50 / 25 |

A median active player should earn roughly 200–400 coins per week of casual
play. That means the $1.99 pack (later) needs to close a gap of one or two
weeks' worth of grind on a specific desirable item — feels earnable, but
paying is a real shortcut.

## Guest earnings & migration to signed-up profiles

Guests never see a coin balance, but their earnings are still tracked
server-side so signup delivers real coins, not a promise.

### Data

- `guest_pending_grants (id, device_id, session_id, game_id, delta, reason,
  created_at)` — one row per earning event.
- Keyed on `(device_id, session_id)` — device id is whatever anonymous id
  we already put on guest players; session id lets us scope migration to
  the same physical device across a short window without pulling in an
  ex-roommate's play history.
- No index into `coin_ledger` yet — nothing is real until signup.

### At earn time (guest)

- Write to `guest_pending_grants`, not `coin_ledger`.
- Results screen shows the amount **for this game only**: "Sign up to
  claim 40 coins." Never a running total (that would leak history and
  create "I had more than that" complaints).

### At signup time

- Sum `guest_pending_grants` for the new profile's device id, over the
  last 7 days.
- Cap the summed grant at **500 coins** — prevents a friend-group signup
  farm (five people signing up on one shared device each claiming full
  history).
- Write one row to `coin_ledger` with `reason: 'guest_migration'`,
  itemized in `admin_note`.
- Delete the consumed `guest_pending_grants` rows.
- Signup success screen: "Welcome — here's your 100 coin welcome bonus
  plus 340 coins from the games you played as a guest. Total: 440."

### Anti-abuse

- 7-day window means old orphaned grants expire.
- 500-coin cap prevents farming.
- One migration per profile (unique constraint on profile_id + reason for
  `guest_migration`, or check-and-skip).
- Device id fingerprint is not perfect — that's fine; the cap absorbs the
  slop.

### Not shown to guests

- No coin badge in the UI as a guest.
- No shop access as a guest.
- No ledger view.
- The only surface is the results-screen "sign up to claim X" nudge.

## Default coins for new profiles

Every brand-new signup starts with:

- **100 coin welcome grant** — always. Reason `welcome_v1`. Big enough
  to immediately buy one small item (a solid name color or a cheap
  frame), which is what makes the economy feel real on day one.
- **Plus any guest migration** (capped 500, see above) if they played as
  a guest first.

100 is deliberately small. Bigger welcome grants train players that coins
are cheap; small ones make earning feel meaningful.

## Admin coin adjustment

Support / ops need a way to grant coins for bug reimbursements, goodwill,
or promotional events.

### UI

- Admin panel: search a profile → see balance and recent ledger → "Adjust
  coins" button.
- Required fields: **amount** (positive or negative), **category** (dropdown:
  `bug_reimbursement`, `support_goodwill`, `promotion`, `correction`,
  `other`), **note** (free text, min 10 chars — forces a real reason).

### Backing

- Ledger row with `reason: 'admin_adjustment'`, plus columns `admin_id`,
  `admin_note`, `admin_category`. Audited forever.
- Shows in the player's ledger with a distinct label ("Adjustment by
  support") so they can see where the coins came from.

### Guardrails

- Cap per admin per day (e.g. 5 000 coins). Protects against a compromised
  admin account. Rare corrective grants are 100–500 coins; anything huge
  should require a second admin's approval or a code-side migration.
- **Admins can only adjust the coin balance itself**, never directly grant
  a specific edition/theme/frame. The player uses their new coins to buy
  what they want. Keeps the audit clean and the shop the single source of
  ownership truth.
- Negative adjustments (clawbacks) allowed but require category
  `correction` and are logged with high visibility.

## Backfill methodology (retro grant for existing players)

Existing players should not launch at zero — that punishes exactly the
audience most likely to spend. Grant coins for work already done, using
signals we already track.

### Formula (starting point — tune)

For each profile compute:

```
raw = 5   * trophy_count
    + 3   * completed_daily_challenges (capped at 100)
    + 25  * tournaments_placed
    + 1   * games_finished (capped at 500)
    + 100 flat welcome bonus
```

Cap the total per profile at **2000 coins**. Cap matters: without it, top
whales wake up with 10,000+ coins and buy every cosmetic day one, hollowing
out the shop.

Guests who later sign up: only the flat 100-coin welcome bonus, since we
don't attribute guest history to devices. Consistent with "no profile, no
coins."

### Delivery

- One-shot migration that computes each profile's grant and writes **one**
  ledger row per profile with `reason: 'launch_grant_v1'`. The `v1` matters
  — if we ever re-grant, we can detect and skip duplicates.
- Grant runs at the moment coins ship, not before. Anyone signing up after
  launch gets only the welcome bonus (no gaming the timing).
- First time a granted player opens the coin UI: show a "Welcome — here's
  X coins for everything you've already played" screen, **itemized**:
  "40 trophies × 5 = 200 · 60 daily challenges × 3 = 180 · welcome: 100 ·
  Total: 480." The itemization is the point — it says "we saw you."
- After acknowledgement the screen doesn't reappear; the ledger row is the
  permanent record.

### Anti-abuse

- Backfill signals are read from server-side data only (trophy count from
  `trophies` table, daily challenge completions from their own table, etc.)
- No client-provided input to the grant calculation.
- One ledger row per profile with a unique constraint on
  `(profile_id, reason)` for `launch_grant_v1`.

## Monetization staging (not launching now, but designed for)

**Month 0–6: free economy.** Coins earn-and-spend only. Watch which sinks
players reach for.

**Month 6+: real money.** Layered on top:

- **Coin packs** ($1.99 / $4.99 / $9.99) — priced so the small pack buys
  one specific desirable item with change left over.
- **FateRound Plus** subscription (~$3–5/mo) — monthly coin stipend +
  ad-free + Plus-only cosmetics + higher AI quota.
- **Seasonal battle pass** (~$5/quarter) — free tier + paid tier of
  cosmetic rewards unlocked by playing.
- **Room-host upgrades** (later, if rooms take off) — analytics, larger
  brackets, branding.
- **Sponsored library packs** — only at scale.

The economy today is designed so all of the above bolt on cleanly without
retconning free features.

## Ship checklist

- [ ] Schema: `profiles.coins`, `coin_ledger`, `profile_owned_*`,
      `equipped_*`, `game_editions`, `game_themes`
- [ ] Server functions: `award_coins()`, `spend_coins()`, `grant_launch_v1()`
- [ ] End-of-game coin panel in `FinishedWinner` / `FinalResultsShareBlock`
- [ ] Signup CTA with real coin amount at claim moments
- [ ] Shop page + category filters + owned badges
- [ ] Extend `Avatar.tsx` to render `equipped_frame`
- [ ] `PlayerName` component reading `equipped_name_color`
- [ ] Winner animation layer in `FinishedWinner`
- [ ] Card template variants in `FinalResultsShareBlock` /
      `ShareResultsCaptureHeader`
- [ ] Estate Kings edition wiring (`game.edition_slug`, engine reads from
      `game_editions.content`)
- [ ] 2–3 game themes wired for Whot / Ludo / Sudoku
- [ ] Extra-bot coin gate in room lobby
- [ ] `price_coins` on library packs + coin badge in library row
- [ ] Ledger / history view on profile
- [ ] Grandfathering flag on existing editions/themes/packs (all set to
      `price_coins = 0` at launch)
- [ ] Backfill migration + itemized welcome screen
- [ ] `guest_pending_grants` table + guest-earning write path
- [ ] Guest → profile migration at signup (with 500-coin cap)
- [ ] 100-coin welcome grant for every new signup
- [ ] Admin coin adjustment UI + per-admin daily cap + ledger integration
- [ ] Anti-abuse: server-authoritative spend, rate limits on shop
      purchases, unique constraint on launch grant ledger row

## Decisions (previously open questions)

1. **Tournament coin awards** — **both.** Small per-game award (5 coins)
   inside the tournament so every match feels like it counts, plus a
   placement bonus at tournament finish (100 / 50 / 25 for top 3). Two
   awards, same results-screen surface, no new UI concept.
2. **Refund window on purchases** — **yes, 24h if unused, applies to
   every durable item.** Refund writes a reversing ledger row
   (`reason: 'refund'`) and drops the corresponding `profile_owned_*`
   row (or increments `streak_freeze` count back down). Per-item rules:

   | Item | Refundable | "Unused" check |
   |---|---|---|
   | Edition | Yes | No `games` row with this `edition_slug` and buyer's `host_player_id` since purchase |
   | Theme | Yes | Same as edition, keyed on theme slug |
   | Frame | Yes | Never set as `equipped_frame` |
   | Name color | Yes | Never set as `equipped_name_color` |
   | Winner animation | Yes | Never set as `equipped_animation` (equipped = used, even without a win yet — keeps the rule simple) |
   | Card template | Yes | Never set as `equipped_card_template` |
   | Premium library pack | Yes | No rounds/games reference the pack since purchase |
   | Streak freeze | Yes | Not yet consumed (still in inventory) |
   | **Extra bot** | **No** | Consumed at add-time — the button press is the use, no take-backs |
3. **Gifting** — **not in v1.** Adds ownership-transfer complexity for
   little demonstrated demand, and there's a natural workaround (host
   plays the edition in a room the giftee joins). Revisit if people ask
   for it.
4. **AI-remix on library packs** — **deferred**, same wave as host AI
   generation (turned on when real-money monetization ships).
5. **Edition experience for non-owners** — **everyone at the table plays
   the host's edition; only the host needs to own it.** Host is
   "hosting the edition" for that session. Guests seeing it is the
   marketing loop that sells the next copy. Consistent with party-game
   feel — the host sets the vibe for the room.
6. **Bot pricing across future games** — **flat 50 coins per bot per
   room, first bot free, applies to every game that supports bots
   today or in future.** Bots are consumable per-room, not durable
   unlocks. Doesn't matter if it's Estate Kings, Whot, Ludo, or a game
   we haven't built yet — same price.
