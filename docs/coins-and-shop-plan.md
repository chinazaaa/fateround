# Coins & Shop — Plan

A brainstorm-to-plan document for FateRound's first virtual economy. This is
what we're shipping in month one, why, and what we deliberately are not
shipping yet.

## Core principles (the rules the whole design comes back to)

1. **No profile, no coins.** Guests can play everything they play today. The
   moment they earn coins, they see "Sign up to claim X coins" — with the
   real number, not "save your progress." Coins are the sign-up flywheel.
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
- `coin_ledger (id, profile_id, delta, balance_after, reason, ref_id, created_at)`
  — every credit/debit is a row. Reasons: `win`, `daily_challenge`,
  `streak_multiplier`, `tournament_placement`, `host_bounty`,
  `first_mode_bonus`, `launch_grant_v1`, `shop_purchase`,
  `refund`.
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
- Guest sees "Sign up to claim X coins" with the number, not a generic
  message.

### Shop page (main-nav item)

Browseable, category-filtered, "owned" badge on things already unlocked.

1. **Game edition** — Estate Kings: Naija (1 at launch)
2. **Game themes** — 2–3 at launch (Whot, Ludo, Sudoku picks)
3. **Winner animations** — 2–3 (confetti, fireworks, one signature)
4. **Card templates** — 2 premium (default stays free)
5. **Avatar frames** — 4–6
6. **Name colors** — 6 solids + 3 gradients
7. **Streak freeze**

### Inline (contextual, at moment of use)

8. **Extra bot seats** — button in the room lobby shows "50 coins" after the
   first free one. Flat cost across all games. Consumable per-bot, per-room.
9. **Premium library packs** — coin badge on library rows. Tap to preview
   1–2 items, tap again to unlock. Owned forever after purchase.

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
- [ ] Backfill migration + itemized welcome screen
- [ ] Anti-abuse: server-authoritative spend, rate limits on shop
      purchases, unique constraint on launch grant ledger row

## Open questions worth deciding before code

1. **Tournament coin awards** — per game + finish, or finish only? (Doc
   recommends both; small per-game plus bonus.)
2. **Refund window on purchases** — 24h if unused? (Nice trust builder;
   deferrable if it adds too much complexity to ledger.)
3. **Gifting** — probably not v1. Later.
4. **AI-remix on library packs** — deferred with host AI generation.
5. **Edition experience for non-owners** — everyone at the table plays the
   host's edition; only the host needs to own it. (Doc recommends this;
   confirm before implementation.)
6. **Bot pricing across future games** — flat 50 coins per bot, regardless
   of game. (Doc recommends flat; confirm.)
