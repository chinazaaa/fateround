# Trophies & Streaks — Retention Build Spec

Status: **Build spec / ready to implement** · Companion to
[`account-tiers.md`](./account-tiers.md), [`feature-backlog.md`](./feature-backlog.md)
and [`revenue-model.md`](./revenue-model.md)

This document is the detailed build spec for FateRound's two core retention systems:

1. **Trophies** — a PlayStation-style, **per-game** progression + collection system
   (Bronze / Silver / Gold / Platinum), account-bound, with rarity and an aggregate
   Trophy Level.
2. **Streaks** — a **general (Duolingo-style)** daily-return streak, fed by any game or
   the solo Daily Challenge, with streak freezes.

Both hang off a **persistent account** whose reason-to-exist is *"don't lose your
trophies and your streak."* This spec also defines the account/auth model (anonymous-first
play, email + one-time-code login) that makes the other two persist and sync across
devices.

> **Read this alongside `account-tiers.md`.** That doc owns the tier philosophy (Guest ⊂
> Account ⊂ Pro), the guest-first principle, and the moment-of-value signup prompts. This
> doc does **not** re-litigate those; it specifies the trophy + streak + auth mechanics in
> build-level detail.

---

## 0. Non-negotiable principles (inherited)

These come straight from `account-tiers.md` and constrain every decision below:

1. **Guest play stays pristine, forever.** Nothing here gates playing. Trophies and
   streaks accrue for guests *on-device* immediately; an account only *saves and syncs*
   them.
2. **Every layer is additive.** We never make guest play worse to push signup.
3. **Ask for signup at the moment of earned value, never at the door.** The prompt fires
   right after the user earned something they'd hate to lose (a trophy, a streak day).
4. **No pay-to-win.** Trophies and streaks are earned by playing, never bought. (Cosmetics
   are a separate line — see `revenue-model.md`.)
5. **Accessibility/fun is never behind the account.** The games are all free; the account
   only adds *persistence*.

---

## 1. The retention loop (why these three pieces fit together)

```
                 ┌─────────────────────────────────────────────┐
                 │                                             │
   Streak  ──────┤  brings you back DAILY                      │
   (Duolingo)    │  (fed by the solo Daily Challenge OR        │
                 │   any game with friends)                    │
                 │                                             │
   Trophies ─────┤  keep you playing EACH GAME                 │
   (per-game)    │  (per-game mastery ladders + Platinum)      │
                 │                                             │
   Account  ─────┤  makes both PERSIST + SYNC across devices   │
   (email OTP)   │  → the thing you protect by signing up      │
                 └─────────────────────────────────────────────┘
```

- **Streak** owns the *daily-return* habit.
- **Trophies** own the *per-game depth* habit (rewarding "not everyone plays every game").
- **Account** is the vault: the streak + trophy count you can *see* are the hook, and
  signing up *saves* them rather than resetting.

Division of labour (important — avoid double-rewarding the same behaviour):

| System | Rewards | Cadence | Analogy |
|---|---|---|---|
| **Trophies** | depth/mastery *within* a game | per game session | PSN trophies |
| **Streak** | *coming back at all* | daily | Duolingo streak |
| Existing `achievements.ts` | one-off fun callouts *inside* a finished game | per round/game | ephemeral badges |

---

## 2. Identity & Accounts

### 2.1 Anonymous-first, account-optional

- On first play, the client establishes an **anonymous identity** so trophies/streaks
  have something to attach to *before* any signup.
- **Recommended implementation: Supabase Auth anonymous sign-in.**
  `supabase.auth.signInAnonymously()` creates a real `auth.users` row with
  `is_anonymous = true`. Trophies/streaks key off `auth.uid()` from the very first game.
- The alternative (a client-generated device UUID in `localStorage`) works but forces us
  to hand-roll the later "merge into a real account" logic and can't use RLS on
  `auth.uid()`. **Use anonymous auth users instead.**
- Guests therefore already have a stable `profile.id`; the only thing signup changes is
  attaching an **email identity** to that same row so it survives device changes.

### 2.2 Login == Signup (one door, email + one-time code)

**We do not build separate login and signup flows.** With email OTP they are the same
action:

1. User enters their email.
2. We send a **6-digit code** (not a magic link — see rationale below).
3. User types the code back **into the same tab they're playing in**.
4. Backend: if the email already has an account → **log in** (their trophies/streak load).
   If not → **create** the account. The user never chooses "login" vs "signup".

**UI copy (single screen):**

> **Enter your email**
> New here? We'll create your profile. Been here before? We'll load your trophies.
> Button: **Save to profile** / **Continue with email**

The button label is deliberately **account-agnostic** ("Save to profile"), because the
person acting might be a brand-new guest *or* a returning user who happened to start this
session logged out. Never label it "Sign up."

### 2.3 Why code, not magic link

| | Email code (OTP) ✅ chosen | Magic link ❌ |
|---|---|---|
| Stays in the tab you're playing in | Yes — type code back into the game | No — link opens a different browser / the mail app's in-app webview, logging you in *there*, not where the game is |
| Works when email lands on a different device | Yes (read code on phone, type on laptop) | Awkward |
| Mobile UX mid-game | Clean | Breaks context |

We may add magic link later purely as a *"log in on a brand-new device"* convenience, but
**the primary in-flow mechanism is the code.**

### 2.4 Email delivery: Supabase Auth + Resend SMTP

- Supabase Auth has **email OTP built in** (`supabase.auth.signInWithOtp({ email })`
  returns a 6-digit token when the email template uses `{{ .Token }}`).
- Configure Supabase Auth's **custom SMTP** to use **Resend** (free tier ≈ 3k emails/mo,
  cheap beyond). This is config, not code — we are *not* hand-rolling an auth system.
- No phone/SMS: cheaper, simpler, and email is enough for "save my trophies".

### 2.5 The profile button (the "chip")

A small, always-present **"you" button** in the corner of the home screen / header —
exactly like the avatar circle in Gmail/YouTube. It does two jobs at once: **status
label** + **the way in**.

| State | Shows | Tapping it |
|---|---|---|
| **Guest** (anonymous, no email) | `🔥 3 · 🏆 12 · Guest` | Opens the email+code screen → "Save your trophies" |
| **Logged in** | `🔥 12 · 🏆 32 · Chinaza` (+ avatar) | Opens the profile page |

The word "Guest" is the signal that *trophies/streak are only on this device and not
saved.* This is the returning-user's login door **and** the new-user's save door — same
button.

### 2.6 Where we prompt — and where we never do

- **Never at lobby join / game start.** Joining is a high-intent "play now" moment; auth
  there is pure friction and most joiners are one-off guests. Play is always instant.
- **Two prompt surfaces only:**
  1. **The profile button** (passive, always available — a returning user can log in
     first thing on a new device, before playing).
  2. **The post-win / post-Daily prompt** (active, highest motivation):
     *"🥉 Nice — save this to your profile so you don't lose it."*
- See `account-tiers.md` §"Signup prompts" for the full moment-of-value trigger table;
  this doc adds the trophy-unlock trigger to it.

### 2.7 Claim & merge logic (the make-or-break detail)

Signing up must **never reset progress to zero.** Two cases:

**Case A — guest upgrades to a brand-new account (common).**
The anonymous `auth.users` row is *upgraded in place* by attaching an email identity
(`supabase.auth.updateUser({ email })` then verify with OTP, or `linkIdentity`). Same
`auth.uid()`, so **every trophy/streak day carries over automatically.** No merge code.

**Case B — guest on this device logs into an account that already exists elsewhere
(the merge case).**
E.g. earned 3 trophies as a guest on the laptop, then logs into the phone account that has
20. Two distinct `auth.users` rows must be reconciled. Rule: **merge, never overwrite.**

Merge algorithm (`mergeProfiles(fromAnonId, intoAccountId)`), run server-side in a
transaction:

- **Trophies** (`player_trophies`): union. Insert any `trophy_id` the account is missing,
  keeping the **earlier** `earned_at`. (`ON CONFLICT (profile_id, trophy_id) DO NOTHING`
  after re-pointing rows.)
- **Per-game counters** (`player_stats`): take **`max`** per counter, not sum
  (summing risks double-counting a game that somehow logged to both). Recompute
  `trophy_points` / `trophy_level` from the merged set afterward.
- **Streak**: take the **longer** `current_streak` and the max `longest_streak`; take the
  more recent `last_active_date`; sum `streak_freezes` (capped at the max, §4.4).
- Delete/tombstone the anonymous profile; re-point the session to the account.
- Log the merge for audit (`profile_merges`).

> Supabase's native anon→permanent linking handles **Case A** for free; **Case B** is the
> only real logic we write, and it's small and well-bounded.

---

## 3. Trophies

### 3.1 Model — per-game + cross-game

Two categories, both attach to the account:

1. **Per-game trophy lists** (the core). Every game mode (all 32) has its own ladder.
   This is what makes "not everyone plays every game" a *feature*: you earn depth in
   whatever you actually play, and each game has its own **Platinum** to chase. A
   Whot-only player has a full progression path and never needs to touch Chess.
2. **Cross-game / platform trophies.** Habit + hosting + breadth: streak milestones,
   "host N nights", "play with N different people", "Explorer — try N modes",
   "Completionist — Platinum N games".

### 3.2 Tiers & points

| Tier | Meaning | Points |
|---|---|---|
| 🥉 **Bronze** | Easy / participation ("win your first Whot") | 15 |
| 🥈 **Silver** | Moderate ("win 10 Whot games") | 30 |
| 🥇 **Gold** | Hard / skill ("win Whot without drawing a card") | 90 |
| 🏆 **Platinum** | **Auto-awarded when every other trophy in that one game is earned** | 300 |

Points feed the aggregate **Trophy Level** (§3.6). Values mirror PSN's rough ratios and
can be tuned in one place (`TROPHY_POINTS` constant).

### 3.3 The Platinum rule

- Each game defines a set of Bronze/Silver/Gold trophies. There is exactly **one
  Platinum** per game.
- Platinum is **not** hand-awarded by a criterion — it is granted automatically the moment
  a player holds **all** non-Platinum trophies for that `game_type`. The award engine
  checks this after every insert (§3.8).
- Platinum is the "100% this game" carrot and the strongest per-game retention pull.

### 3.4 Rarity

- Each trophy shows **"% of players who have earned it"**, PSN-style, with rarity bands:

  | Band | Threshold (share of eligible players) |
  |---|---|
  | Common | > 50% |
  | Uncommon | 20–50% |
  | Rare | 5–20% |
  | Very Rare | 1–5% |
  | **Ultra Rare** | < 1% |

- Compute `earned_count / eligible_players` where **eligible = players who have played
  that `game_type` at least once** (so a Chess trophy's rarity isn't diluted by people who
  never play Chess). Cache in `trophy_rarity` (§5), refreshed on a schedule (hourly is
  fine) — never computed live per request.
- Rarity is a bragging/retention engine: auto-post *"🏆 X just earned an Ultra-Rare
  trophy"* into the community WhatsApp (the invite link infra already exists via the
  leaderboard).

### 3.5 Hidden / secret trophies

- Support a `hidden` flag. Hidden trophies show as a locked "???" until earned — **title,
  description, and criterion/details are all withheld** (only the tier/grade is shown,
  PSN-style), with an optional "reveal" toggle. Classic PSN surprise-and-delight; good for
  a handful of the Gold/quirky ones.
- **Redaction is server-side.** The `GET /api/profile/game/:gameType` and
  `GET /api/trophies/:trophyId` responses must **omit** `title`/`description`/`criteria`
  for a hidden trophy the caller hasn't earned — never send them and hide in the client,
  or the spoiler leaks in the payload. Once earned, the full fields are returned.

### 3.6 Trophy Level (the aggregate)

- Sum trophy points across **all** games → a single **Trophy Level** with a progress bar,
  shown on the profile button and profile page (PSN's "Level 214"). This is the one number
  that makes every game you play feed one growing identity — currently missing entirely.
- Level curve (tunable): non-linear so early levels are fast and later ones slow.
  Reference formula: `level = floor( sqrt(points / 100) ) + 1`, i.e. L1 at 0 pts, L2 at
  100, L3 at 400, L4 at 900… Store both raw `trophy_points` and cached `trophy_level` on
  the profile; recompute on award.
- **PSN presentation (Screen 1):** the level shows as a **medallion** whose plate colour
  advances by band as the level climbs (bronze → silver → gold → platinum), wrapped in a
  **progress ring = progress toward the next level**. Derive the medallion band and the
  ring % from `trophy_points` (points into current level ÷ points needed for next).

### 3.7 Relationship to the existing `achievements.ts`

- `src/lib/achievements.ts` + `AchievementBadges` currently produce **ephemeral,
  end-of-game badges** computed from vote data and attached to *participants* (the people
  being voted on). They are fun callouts, **not** persistent and **not** account-bound.
- **Trophies are a distinct, new, persistent layer.** They may be *triggered by* the same
  kinds of moments (a clean sweep, a win), but they:
  - attach to the **player's account** (`auth.uid()`), not to a participant;
  - persist forever and count toward Trophy Level;
  - are evaluated by the server-side **award engine** (§3.8), not the client-side badge
    renderer.
- We keep `achievements.ts` as-is for the in-game moment, and (optionally, Phase 2) let
  certain achievement events *emit* trophy-award events. Do not conflate the two systems.

### 3.8 The award engine

**Where it hooks in.** Game completion already flows through
`src/app/api/games/[code]/finish-game/route.ts`, and the winner is already detected
client-side by `PostWinToCommunity` (which posts to the leaderboard). The award engine
runs in the **same server path** as finish/leaderboard-post so a win reliably produces
both a leaderboard entry and any trophies.

**Flow (server-side, uses the admin client + the authenticated `auth.uid()`):**

1. On game finish (or win-post), collect the **facts** about this session for the acting
   player: `game_type`, did-they-win, per-game signals (e.g. `whot.win_no_draw`), player
   count, etc. Reuse the same server-derived `game_type` the leaderboard already trusts
   (do not trust a client-sent game type — see anti-spoof §3.9).
2. **Increment `player_stats` counters** for that profile + game_type
   (`games_played`, `games_won`, plus game-specific counters in a `jsonb` bag).
3. **Evaluate the trophy catalog** for trophies not yet held whose `criteria` now pass
   (§3.10). Insert newly-earned rows into `player_trophies`
   (`ON CONFLICT DO NOTHING` — the unique index is the backstop against double-award).
4. **Platinum check:** for each affected `game_type`, if all non-Platinum trophies are now
   held, award the Platinum.
5. Recompute `trophy_points` + `trophy_level` on the profile.
6. Return the list of **newly-earned** trophies so the client can show the unlock moment.

**Atomicity (required).** Steps 2–5 span three tables (`player_stats`,
`player_trophies`, `profiles`) and MUST commit or roll back as **one unit** — a partial
failure (e.g. counters incremented but the Platinum/`trophy_level` write fails) would
leave the three tables out of sync. Wrap the whole award pass in a **single database
transaction**, implemented as a Postgres `security definer` function / RPC
(`award_for_session(profile_id, session_facts)`) called from the finish path, so the
counter increments, trophy inserts, Platinum recompute, and cached
`trophy_points`/`trophy_level` writes all land together. The service-role client invokes
it; nothing partial is ever observable.

**Idempotency (on top of atomicity).** The transaction must also be **safe to re-run**
(finish can fire twice on retries/races). Guards: `player_trophies` has
`unique(profile_id, trophy_id)` (`ON CONFLICT DO NOTHING`); and counter increments are
**keyed to the game session** so a retried finish doesn't double-count — record a
processed-session marker (`awarded_sessions(profile_id, session_id)` unique, or the same
per-round dedupe key `PostWinToCommunity` already uses) and no-op inside the transaction if
it's already present. Atomic + idempotent together = a retry either does the full award
once or nothing.

### 3.9 Anti-spoof

Rooms are host-riggable (a host can stack a lobby, replay rounds). So:

- **Gate competitive trophies** ("win N", streaks-of-wins, "beat N players") behind a
  **minimum real-player count** and, where relevant, minimum round length — same
  philosophy as the leaderboard's server-side game-type guard.
- **Participation trophies** ("played your first Trivia", "answered 50 questions") stay
  liberal — low incentive to cheat, high delight.
- Always derive `game_type` and win/loss **server-side** from the room state, never from a
  client-declared value. (The leaderboard already does this and rejects mismatches; reuse
  that.)
- Rate-limit / dedupe by session id so replaying the same finished game can't farm a
  counter.

### 3.10 Criteria DSL (catalog-driven, no code per trophy)

Trophies live in a **data catalog** (`trophies` table, seeded from a
`src/lib/trophies/catalog.ts` source of truth) so adding a trophy is data, not a code
change. `criteria` is a small JSON DSL the engine understands:

```jsonc
// Counter threshold (uses player_stats)
{ "type": "counter", "key": "whot.wins",        "gte": 10 }
{ "type": "counter", "key": "trivia.answers",   "gte": 50 }

// One-shot event flag emitted by a game at finish
{ "type": "event",   "event": "whot.win_no_draw" }
{ "type": "event",   "event": "trivia.perfect_round" }

// Distinct-set size (cross-game breadth). Backed by the `player_distinct` table
// (§5): the engine INSERTs (profile_id, key, member) ON CONFLICT DO NOTHING as
// members are seen, and evaluates via `count(*) where profile_id=? and key=?`.
// Never a jsonb array — see the schema note for why.
{ "type": "distinct", "key": "modes_played",     "gte": 10 }   // member = game_type slug
{ "type": "distinct", "key": "opponents",        "gte": 20 }   // member = opponent profile_id

// Streak milestone (reads profile streak)
{ "type": "streak",  "gte": 7 }

// Platinum — engine-managed, never authored directly (§3.3)
{ "type": "platinum", "game_type": "whot" }
```

Adding a game's ladder = adding rows to the catalog + (for `event` criteria) having that
game emit the named event at finish. `counter`, `distinct`, and `streak` need **no
per-game code** beyond incrementing the shared counters.

### 3.11 Example catalogs (illustrative — final lists TBD per game)

**Whot**
| Trophy | Tier | Criteria |
|---|---|---|
| First Whot Win | 🥉 | `event whot.win` (or `counter whot.wins ≥ 1`) |
| Whot Regular | 🥈 | `counter whot.wins ≥ 10` |
| Clean Hands (win without drawing a card) | 🥇 | `event whot.win_no_draw` |
| **Whot Master** | 🏆 | Platinum (all above) |

**Trivia**
| Trophy | Tier | Criteria |
|---|---|---|
| Quiz Starter (answer 50 questions) | 🥉 | `counter trivia.answers ≥ 50` |
| Perfect Round | 🥈 | `event trivia.perfect_round` |
| Five in a Row | 🥇 | `counter trivia.win_streak ≥ 5` |
| **Trivia Master** | 🏆 | Platinum |

**Cross-game / platform**
| Trophy | Tier | Criteria |
|---|---|---|
| Warmed Up (7-day streak) | 🥈 | `streak ≥ 7` |
| On Fire (30-day streak) | 🥇 | `streak ≥ 30` |
| Party Host (host 10 nights) | 🥈 | `counter host.nights ≥ 10` |
| Social Butterfly (play with 20 people) | 🥈 | `distinct opponents ≥ 20` |
| Explorer (try 10 modes) | 🥉 | `distinct modes_played ≥ 10` |
| Completionist (Platinum 3 games) | 🥇 | `counter platinums ≥ 3` |

### 3.12 Trophy progress — measurable vs binary

PlayStation shows a **progress bar + %** on every trophy, and it behaves differently by
trophy type. We match this exactly, and it falls straight out of the criteria DSL (§3.10):

| Criteria type | Progress behaviour | Example (unearned) |
|---|---|---|
| `counter`, `distinct`, `streak` | **Measurable** — show `min(100, current/target × 100)%` while unearned | "Collect 36 Outfits" → **Not earned · 11%** (you have 4/36) |
| `event`, `platinum` | **Binary** — no partial progress; **0%** until the moment it's earned, then 100% | "Land on Mayfair" → **Not earned · 0%** |

- This is the user's exact requirement: a *collection/threshold* trophy shows partial
  progress (11%); a *do-it-or-you-don't* trophy shows 0% until earned.
- Implementation: the award engine (or the `GET .../trophies` read) computes progress from
  `player_stats` for measurable criteria; for `event`/`platinum` it returns `0` unearned /
  `100` earned. Store nothing extra — progress is derived from the same counters.
- When **earned**, the bar is full and the row shows **"Earned · DD/MM/YYYY · h:mm AM/PM"**
  (date **and** time — PSN shows both; we already store `earned_at timestamptz`).

### 3.13 Finite catalog & completion % (this is what makes the PSN screens work)

PSN's per-game screen shows **"32 Earned / 59 Available"** and a completion ring. That only
works because each game has a **fixed, finite trophy list with a known total**. So:

- **Every game's trophy catalog is finite and versioned.** "Available" = count of active
  trophies for that `game_type`. "Earned" = how many that player holds. Adding trophies
  later raises "Available" for everyone (expected — PSN does this with DLC).
- **The Platinum is literally "earn every other trophy"** (§3.3) — mirrors PSN's "For the
  Brigade — Earn every Trophy" platinum. One per game.
- **Completion % is POINTS-WEIGHTED, not a raw count.** In the screenshot Spell Brigade is
  32/59 by count (≈54%) but the ring reads **48%**, because tiers are weighted. Use:

  ```
  completion% = round( earned_points / total_available_points × 100 )
  ```

  using the same tier points as Trophy Level (Bronze 15 / Silver 30 / Gold 90 / Plat 300).
  Show the **raw "Earned / Available" count AND the weighted %** side by side, exactly like
  PSN (the count and the ring are different numbers on purpose).
- **"Rarest trophy earned"** (per game) = of the trophies the player holds for that game,
  the one with the lowest `trophy_rarity.pct`. Featured on the per-game screen.

---

## 3A. Trophy UI — screen-by-screen (PlayStation-modeled)

Four screens, matching the PSN app the user shared. All dark-theme, mobile-first.

### Screen 1 — Profile / trophy overview (`/profile`)

- **Header:** avatar, handle (`babymarshmallow2`-style) + display name.
- **Level medallion + ring + total:** a circular **level medallion** whose look changes by
  level band (bronze → silver → gold → platinum plate as levels climb), the label
  **"Level N"**, a **progress ring** = progress to next level, and **"Total Trophies"**
  (the grand count across all games).
- **Tier totals row:** four icons with counts — 🏆 Platinum · 🥇 Gold · 🥈 Silver ·
  🥉 Bronze — summed across every game (e.g. `4 / 28 / 42 / 118`).
- **"Games played" list.** One row per game the player has any trophy in:
  - game icon + title,
  - the four tier counts underneath (small trophy + number each: `plat/gold/silver/bronze`),
  - **completion %** on the right (points-weighted, §3.13),
  - a thin **progress bar** under the tier counts.
  - Sorted by most-recently-played (or a sort control).

### Screen 2 — Per-game summary (`/profile/game/:gameType`)

- Game icon + title (+ a small platform/tag chip if we want one).
- Player avatar + name.
- **Summary card:** big **"N Earned"** | **completion ring %** | **"M Available"**, with the
  four tier counts row beneath. (Earned/Available is the raw count; the ring is weighted.)
- **Sort control** (by grade / earned date / rarity / not-earned-first).
- **"Rarest trophy earned"** featured card: trophy art, title, description, tier icon,
  earned date+time (§3.13).
- **"All trophies"** list begins (Screen 3).

### Screen 3 — All-trophies list (within Screen 2, scrolls)

One row per trophy in the game's finite catalog:

- trophy **art thumbnail** (earned = full-colour art; **locked/unearned = padlock**;
  **hidden** trophies show a generic "???" until earned, §3.5),
- **title** + **one-line description** — **redacted while hidden-and-unearned** (show
  "Hidden Trophy" / "This is a hidden trophy" placeholder, PSN-style, with an optional
  "reveal" toggle); shown normally once earned,
- small **tier trophy icon** (bronze/silver/gold/platinum) — the tier *is* shown even
  while hidden (PSN reveals grade, not the objective),
- **earned date + time** on the right if earned (blank if not),
- a larger **trophy glyph** far-right, filled when earned.
- The Platinum ("Earn every Trophy") sits at the top, locked until 100%.

### Screen 4 — Single trophy detail (modal)

- Large **trophy art** (or the trophy-with-padlock lock icon if unearned; "???" if hidden).
- Game icon + game title + **trophy name** — **redacted while hidden-and-unearned**
  ("Hidden Trophy", optional reveal toggle).
- **Grade:** tier icon + label (Bronze / Silver / Gold / Platinum) — shown even while hidden.
- **Rarity:** the **pyramid icon** (fills from the base up — more filled = more common; an
  Ultra-Rare shows just the tip) + label + **%**, e.g. "Common 82.8%" or
  "Ultra rare 3.1%". Bands per §3.4.
- **Progress row:**
  - earned → **"Earned · 9/5/2026 · 5:33 PM"** + checkmark, full bar;
  - unearned measurable → **"Not earned"** + **"11%"** on the right, partial bar (§3.12);
  - unearned binary → **"Not earned"** + **"0%"**, empty bar.
- **Details:** the criterion in plain English ("Complete a Mission in the Verdant Meadows.",
  "Collect 36 Outfits.") — **redacted while hidden-and-unearned** (the whole point of a
  hidden trophy is that the objective is a surprise); revealed on unlock.

> **Two visual assets to design:** the **level medallion** (bands by level) and the
> **rarity pyramid** (fill by rarity band). Both are small, reusable SVGs.

---

## 4. Streaks

### 4.1 General (Duolingo), NOT per-game (Snapchat) — decision + rationale

**One general streak per account.** We explicitly reject per-game (Snapchat-style)
streaks:

- Party games aren't a daily solo action, so a per-game daily streak (e.g. "play Whot
  every day") would **reset constantly and feel punishing**, and stacking many parallel
  streaks is obligation overload for a casual app.
- **Per-game depth is already owned by trophies** (§3.1). Making streaks *also* per-game
  double-rewards the same behaviour. Clean split: **trophies = per-game depth; streak =
  one daily-return habit.**

### 4.2 What keeps the streak alive

Aligned with `account-tiers.md` §"Streak = any game played today":

> **Playing *any* game today OR completing the solo Daily Challenge → the streak ticks up.**

- **Group play** keeps it alive on game nights.
- The **solo Daily Challenge** (a rotating single-player puzzle — Sudoku / Trivia /
  Word Hunt, which already support solo play) is the *guaranteed* way to keep the streak
  when no friends are around. Without a daily solo option a daily streak is impossible for
  a party app — this is why the Daily and the streak are one system.
- We do **not** require the Daily specifically. Punishing someone who played three games
  with friends but skipped the Daily is the fastest way to make streaks feel unfair.

### 4.3 The "day" boundary

- A streak day is a **calendar day in WAT (West Africa Time)** — the same day definition
  the community leaderboard already uses (`result_date`, `YYYY-MM-DD` WAT). Reuse that
  logic (`src/lib/room-timezones.ts` / the leaderboard's date helper) so streaks, the
  Daily, and the leaderboard all agree on when "today" flips.
- `current_streak` increments when `activity_date == last_active_date + 1 day`, stays flat
  if `== last_active_date` (already counted today), and otherwise breaks (subject to
  freezes).

### 4.4 Streak freezes (forgiveness)

- A missed day does **not** immediately kill the streak if the player has a **freeze**
  available (Duolingo model). One freeze auto-consumes to cover one missed day.
- Grant freezes slowly (e.g. earn 1 per 7 consecutive days, cap ~2 held). Tunable
  constants. This forgiveness is a large part of why streaks retain instead of demoralise.
- Freezes are a candidate future cosmetic/Pro perk (extra freezes) — but the **base
  forgiveness stays free**; see principle §0.5 and `revenue-model.md`.

### 4.5 Milestones & nudges

- Milestone trophies at 7 / 30 / 100 days (§3.11) — the streak feeds the trophy system.
- **Come-back notification** when the streak is about to break (see §6). This is the
  single most important re-engagement trigger.
- Show the flame + count on the profile button and prominently on the home screen so the
  streak is *visible* (visibility is the payoff for returning).

---

## 5. Data model (Postgres / Supabase)

New migration(s) under `supabase/migrations/` (never edit the schema in the SQL editor —
see `CONTRIBUTING.md`). All identity keys are `auth.uid()`.

```sql
-- One row per identity (anonymous OR email). id == auth.users.id.
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  handle          text,                        -- display name; nullable for anon
  avatar_url      text,
  is_anonymous    boolean not null default true,
  trophy_points   integer not null default 0,  -- cached sum, recomputed on award
  trophy_level    integer not null default 1,  -- cached, derived from points
  current_streak  integer not null default 0,
  longest_streak  integer not null default 0,
  last_active_date date,                        -- WAT calendar date
  streak_freezes  integer not null default 0,
  created_at      timestamptz not null default now()
);

-- Per-profile, per-game-type counters. Feeds `counter`/`distinct` criteria.
create table player_stats (
  profile_id  uuid not null references profiles(id) on delete cascade,
  game_type   text not null,                    -- '__global__' for cross-game counters
  games_played integer not null default 0,
  games_won    integer not null default 0,
  counters     jsonb not null default '{}',     -- scalar counters only, e.g. {"whot.win_no_draw_ct":2}
  updated_at   timestamptz not null default now(),
  primary key (profile_id, game_type)
);

-- Canonical storage for `distinct` criteria (modes_played, opponents, …).
-- One row per (profile, set, member). The PK gives free dedupe; count(*) is the value.
-- NOT stored as a jsonb array in player_stats — arrays can't be deduped/indexed/counted
-- cheaply and grow unbounded.
create table player_distinct (
  profile_id    uuid not null references profiles(id) on delete cascade,
  key           text not null,                  -- 'modes_played' | 'opponents'
  member        text not null,                  -- e.g. game_type slug, or opponent profile_id
  first_seen_at timestamptz not null default now(),
  primary key (profile_id, key, member)
);
create index idx_player_distinct_lookup on player_distinct(profile_id, key);

-- Processed-session markers so the award transaction is idempotent (§3.8).
create table awarded_sessions (
  profile_id uuid not null references profiles(id) on delete cascade,
  session_id text not null,                      -- game_id / per-round session key
  awarded_at timestamptz not null default now(),
  primary key (profile_id, session_id)
);

-- Trophy catalog (seeded from src/lib/trophies/catalog.ts).
create table trophies (
  id          text primary key,                 -- 'whot.first_win'
  game_type   text,                             -- null = cross-game/platform
  tier        text not null check (tier in ('bronze','silver','gold','platinum')),
  title       text not null,
  description text not null,
  criteria    jsonb not null,                   -- the DSL (§3.10)
  points      integer not null,
  hidden      boolean not null default false,
  sort_order  integer not null default 0,
  is_active   boolean not null default true
);

-- Trophies a profile has earned.
create table player_trophies (
  profile_id uuid not null references profiles(id) on delete cascade,
  trophy_id  text not null references trophies(id),
  earned_at  timestamptz not null default now(),
  primary key (profile_id, trophy_id)
);
create index idx_player_trophies_trophy on player_trophies(trophy_id);

-- Cached rarity (refreshed hourly by a job; never computed per request).
create table trophy_rarity (
  trophy_id        text primary key references trophies(id),
  earned_count     integer not null default 0,
  eligible_players integer not null default 0,  -- players who played that game_type
  pct              numeric not null default 0,
  refreshed_at     timestamptz not null default now()
);

-- Audit for Case-B merges (§2.7).
create table profile_merges (
  id           uuid primary key default gen_random_uuid(),
  from_profile uuid not null,
  into_profile uuid not null,
  merged_at    timestamptz not null default now()
);
```

**RLS:**
- `profiles`, `player_stats`, `player_trophies`, `player_distinct`, `awarded_sessions`:
  **owner can read own rows** (`auth.uid() = profile_id`). Public leaderboards read a
  **narrow view** exposing only handle + trophy_level + streak (not email/PII).
- **All writes go through the server-side award engine using the service-role/admin
  client** (`getSupabaseAdmin()`), never directly from the client — so counters and
  trophies can't be forged. Follow the patterns in `docs/rls-hardening.md`.
- `trophies` catalog: public read, no client write.

---

## 6. API surface

New routes under `src/app/api/` (mirroring existing conventions — Zod-validated bodies via
`parseJsonBody`, admin client, `internalErrorMessage`):

| Route | Purpose |
|---|---|
| `POST /api/profile/anon` | Ensure an anonymous profile exists for the current anon `auth.uid()` (called on first play). |
| `POST /api/auth/request-code` | Send the 6-digit email code (wraps `signInWithOtp`). |
| `POST /api/auth/verify-code` | Verify the code; log in or create; trigger Case-A upgrade or Case-B merge. |
| `POST /api/profile/merge` | (Internal) run `mergeProfiles` (Case B). |
| `GET  /api/profile/me` | Screen 1: handle, level medallion band, next-level ring %, total trophies, tier totals, and the "games played" list (per-game tier counts + weighted completion %). |
| `GET  /api/profile/game/:gameType` | Screen 2/3: Earned/Available counts, weighted completion %, tier counts, "rarest trophy earned", and the full trophy list with per-trophy earned state + date/time + rarity + progress %. |
| `GET  /api/trophies/:trophyId` | Screen 4: single-trophy detail (grade, rarity band+%, progress state, details). |
| `GET  /api/trophies/catalog` | Full catalog for the "all trophies" browse view. |
| *(internal)* award engine call inside `finish-game` | Evaluate + award; returns newly-earned trophies (§3.8). |

The award engine is a library function (`src/lib/trophies/award.ts`) called from the
finish path, **not** a public endpoint the client can hit to grant itself trophies.

---

## 7. Client surface

New / changed components (folder conventions per existing `src/components/*`):

- `src/components/profile/ProfileButton.tsx` — the corner "you" button (§2.5), Guest vs
  logged-in states, live streak + trophy counts.
- `src/components/auth/EmailCodeDialog.tsx` — the one-door email → 6-digit code flow.
- `src/components/profile/ProfileOverview.tsx` (route `/profile`) — **Screen 1**: level
  medallion + next-level ring, total trophies, tier totals, "games played" list.
- `src/components/profile/GameTrophies.tsx` (route `/profile/game/[gameType]`) —
  **Screens 2 + 3**: Earned/Available card, weighted completion ring, "rarest trophy
  earned", all-trophies list.
- `src/components/trophies/TrophyDetail.tsx` — **Screen 4** modal: grade, rarity pyramid,
  measurable-vs-binary progress row, details.
- `src/components/trophies/LevelMedallion.tsx` + `RarityPyramid.tsx` — the two reusable
  SVG assets (§3A).
- `src/components/trophies/TrophyUnlockToast.tsx` — the unlock moment on the end screen
  (reuse the share-block styling, e.g. `AchievementsShareBlock`).
- Hook the post-win prompt into the existing end-screen path alongside
  `PostWinToCommunity`.
- `src/lib/trophies/catalog.ts` — source of truth for the seed; `src/lib/trophies/award.ts`
  — the engine; `src/lib/streak.ts` — day-boundary + freeze logic (reusing the WAT date
  helper).

---

## 8. Notifications (re-engagement)

The push infra already exists (VAPID keys + `push_subscriptions`), but it is currently
**per-game** (a subscription is tied to `game_id` + a player resume token — see
`src/app/api/games/[code]/push/subscribe/route.ts`).

- **Re-scope push to the account** so it can fire *between* sessions: subscriptions attach
  to `profile_id`, not just a game.
- Cross-session triggers (all opt-in):
  - 🔥 **Streak about to break** — the single highest-value nudge (fire in the evening WAT
    if no activity today and a freeze isn't going to save it).
  - 🆕 **New Daily Challenge is up.**
  - 🏆 **Weekly rarity/leaderboard recap** ("you're rank #3; new season Monday").
- Respect a global notification opt-out on the profile. See `account-tiers.md`
  ("Return notifications") for the tier placement.

---

## 9. Phasing / MVP

**Phase 1 — foundation + first loop (ship this first):**
1. Anonymous auth profile + `profiles` / `player_stats` tables.
2. `player_trophies` + `trophies` catalog with ~4 trophies each for the **top 5
   most-played modes** + 3 platform trophies.
3. Award engine wired into `finish-game`; unlock toast on the end screen.
4. The general streak (any-game-or-Daily) + WAT day boundary + basic freeze.
5. The four PSN-modeled screens (§3A): profile overview → per-game summary → all-trophies
   list → trophy detail, plus the corner profile button (Guest + logged-in states) and the
   two SVG assets (level medallion, rarity pyramid). Weighted completion % + measurable/
   binary progress from day one.
6. Email + code login (Supabase OTP + Resend SMTP), one-door flow, Case-A upgrade.

**Phase 2:**
7. Case-B merge, rarity computation + display, hidden trophies, Trophy Level curve polish.
8. Cross-session re-engagement push (streak-break nudge).
9. Expand catalogs to all 32 games; Completionist/Explorer platform trophies.

**Phase 3:**
10. Community auto-posts for Ultra-Rare unlocks; seasonal leaderboard tie-in; extra
    freezes as a cosmetic/Pro perk.

---

## 10. Open decisions (need a call before/while building)

1. **Level curve** — confirm `sqrt(points/100)` or tune (affects how "fast" early levels
   feel).
2. **Freeze economics** — earn rate + cap (proposed 1 per 7 days, hold ≤ 2).
3. **Competitive-trophy min player count** — proposed floor (e.g. ≥ 3 real players) for
   "win N" trophies (§3.9).
4. **Handle uniqueness** — are display handles globally unique, or is the account keyed
   only by email with a non-unique display name? (Leaderboard currently uses normalized
   names.)
5. **Which 5 games seed Phase 1** — pull from actual play analytics (Whot / Trivia likely,
   confirm the rest).
6. **Anonymous retention window** — how long do we keep an unclaimed anonymous profile's
   trophies server-side before pruning?

---

## 11. Metrics to instrument (so we can tell if it works)

- **D1 / D7 / D30 return rate**, split guest vs account.
- **Signup conversion at each prompt** (post-win vs Daily vs profile-button).
- **Streak distribution** (how many hold 3/7/30-day streaks) and **streak-break recovery**
  (did the push bring them back?).
- **Trophies per player**, **Platinums earned**, **rarity distribution**.
- **Merge frequency** (Case B) — proxy for genuine multi-device usage.
