# High Scores & Leaderboards — Plan / Recommendation

Status: **Recommendation / not yet scheduled** · Companion to
[`trophies-and-streaks.md`](./trophies-and-streaks.md),
[`account-tiers.md`](./account-tiers.md) and
[`feature-backlog.md`](./feature-backlog.md)

The ask: let people **beat their own high score** on the score-based games (Crossword,
Sudoku, Word Search, Word Hunt, …) and **see a global leaderboard** of other players'
high scores so they want to beat those too. Whether it needs auth, whether to wait for
auth, and which games are involved — all answered below.

> **TL;DR recommendation.** Build this as the **third retention pillar** next to trophies
> and streaks, reusing the *same* identity model that `trophies-and-streaks.md` already
> specifies (anonymous Supabase auth → email OTP). **Do not wait for a separate auth
> project** — anonymous-first auth *is* the auth you need, and it lets scores accrue from
> the very first play. The hard part is not auth; it is **fair comparison**: a leaderboard
> is only meaningful when everyone is scored on the *same puzzle*. So the centrepiece is a
> **Daily Challenge** (one shared seeded puzzle per game per day) with a **global daily
> board + a rolling all-time personal best**. That is the format world-class puzzle apps
> (NYT Games, GamePigeon, Wordle) use, and it is the one I recommend.

---

## 1. The core problem: you can't leaderboard apples against oranges

Every score-based game today is **room-scoped and plays a different puzzle each time**
(recon confirmed — scores live in per-round `*_submissions` / `*_found` tables that
`CASCADE` when the game is deleted; nothing aggregates across sessions).

That matters because **raw scores from different puzzles are not comparable**:

- A Sudoku score depends on difficulty and how many other players raced you for each cell
  (scoring is *ranked* — 1st to solve a cell = 10, 2nd = 6…; see `0128_sudoku_cell_rank_scoring.sql`).
- A Word Hunt score depends on which letters the board happened to contain.
- A Crossword / Word Search "score" is a **count of correct cells / found words**, which
  depends entirely on the size of that particular puzzle.

So a global "high score" table fed by whatever puzzle each room happened to generate would
be **noise** — unbeatable boards would top it, and "beating your best" would just mean
"got lucky with an easy board." **The score must be tied to a puzzle everyone shares.**

There are two clean ways to get shared puzzles, and I recommend doing both, in order:

| Format | Everyone plays… | Comparison is fair? | Recommended |
|---|---|---|---|
| **Daily Challenge** | the **same seeded puzzle** for that game, that day | ✅ yes | **Phase 1 — the backbone** |
| **Per-room board** | the room's own puzzle | ✅ within that room only | Phase 2 — nice-to-have |
| Free-play global board | a *different* puzzle each session | ❌ **no — don't build this** | ✗ never |

The "personal best" the user asked for then means: **your best score on the Daily**
(today's, and your all-time best Daily score), plus your best *within a room*. Both are
apples-to-apples.

---

## 2. Auth: don't wait, but don't build a second auth system either

The recon is unambiguous: **there is no auth and no durable identity today.** A player is
a `players.id` uuid scoped to one game + a free-text `name` + a per-game `resume_token`.
The same human in two games is two unrelated rows. There is no `user_id`, no `profiles`
table, no device id.

**But `trophies-and-streaks.md` §2 already specifies the exact identity you need** and
recommends **anonymous-first Supabase Auth**: `supabase.auth.signInAnonymously()` gives
every player a real `auth.users` row (with `is_anonymous = true`) from their first play,
and email OTP later *upgrades that same row in place* (same `auth.uid()`), so nothing is
lost. Leaderboards should key off that **same `profiles.id`**.

**Recommendation:**

1. **Leaderboards depend on `profiles` (the anonymous-first identity), not on email
   login.** So this feature ships the moment that identity layer exists — which is Phase 1
   of the trophies doc. You are not blocked on "real" auth.
2. **Sequencing:** the identity foundation (anon profile + `profiles` table) is a shared
   prerequisite for *both* trophies and leaderboards. Build it once. Then trophies and
   leaderboards are two consumers of it and can ship in either order.
3. **If you genuinely want something before any identity work:** a device-id
   (`SecureStore` / `localStorage` UUID) *personal-best-only* board is possible as a stopgap
   (see §8), but it **cannot do a real cross-player global leaderboard** and creates
   throwaway migration work. I recommend against it unless you need a demo this week.

> **In one line:** anonymous Supabase auth is the auth this needs, it is already the plan
> in `trophies-and-streaks.md`, and it unblocks a *real* global leaderboard — so build on
> it rather than waiting for or hand-rolling anything separate.

---

## 3. Games involved

### Tier 1 — the score-race grid games (the reason for this feature)

These already accrue an independent per-player score on a puzzle, so they map directly
onto a high-score model. **These are the launch set.**

| Game | `GameType` | Score today | Fair-comparison note |
|---|---|---|---|
| **Word Hunt** | `word_hunt` | Sum of `points_awarded` per found word (`wordHuntPoints`: 3-letter=100…) | Timed; score depends on board letters → **needs shared seed** |
| **Sudoku** | `sudoku` | Sum of ranked `points_awarded` per cell (10/6/4/2, −3 wrong) | Ranked scoring is **multiplayer-relative** → for a fair solo board, score by **time + accuracy**, not race-rank (see §5) |
| **Crossword** | `crossword` | Count of correct cells (no `points_awarded` col); has hint penalty | Score = correctness + speed − hints |
| **Word Search** | `word_search` | Count of found words (no `points_awarded` col); has hints | Score = words found + speed − hints |

### Tier 2 — other per-player-score games (fast-follow)

Same shape, add once the Tier-1 pattern is proven: **Yahtzee** (`yahtzee`, has solo mode),
**Trivia** (`trivia`), **Word Rush** (`word_rush`), **Quick Draw** (`quick_draw`),
**Matching Pairs** (`matching_pairs`).

### Not in scope

Turn-based / head-to-head board games (chess, checkers, ludo, whot, crazy_eights,
monopoly, scrabble, tic-tac-toe, mahjong, ayo, snake & ladder) and host-run party games
(mafia, quiplash, codewords, bingo, the poll family, …). These are **win/loss**, not
**score-you-beat**. Their competitive layer is **trophies + tournaments**, not a high-score
board. (A W/L or Elo ladder for these is a *separate* future idea; keep it out of this doc.)

---

## 4. Scope of leaderboards to build (my "best worldwide" pick)

You asked me to pick the scope. Here's the set that top puzzle apps use and that I
recommend, smallest-meaningful-first:

1. **Personal best (the core loop).** Per game, per player: *your best Daily score ever*
   and *today's score*. This is the "beat your high score" the user explicitly asked for.
   Ships first; needs no one else to be playing to feel good. **Always build this.**
2. **Daily global board (the social hook).** Per game, per day: the ranked list of
   everyone's score on **today's shared puzzle**. Resets daily, so it is always beatable
   and always fresh — the single biggest reason time-boxed boards out-retain all-time
   boards (a newcomer is never staring at an untouchable all-time #1). **This is the
   headline feature.**
3. **All-time board (the aspiration).** Per game: best-ever Daily scores across all
   players. Slower-moving, gives long-term players a wall to climb.
4. **Weekly board (optional, Phase 2).** A 7-day rolling sum or best-of, for a "this
   week's champion" beat that's less punishing than daily for casual players.

**Deliberately *not* in v1:** friends-only / room-history boards (needs a social graph you
don't have yet) and country/regional boards (needs location; revisit once there's volume).

> **Format recommendation in one line:** *Personal best + Daily global board*, both fed by
> a **shared Daily Challenge puzzle per game**, with an **all-time** board layered on. That
> combination is what makes "beat your best" *and* "beat theirs" both fair and habit-forming.

---

## 5. Scoring — normalise so a score means the same thing every day

Because the leaderboard compares across days (all-time) and the underlying puzzles vary in
difficulty, store a **normalised, difficulty-aware score**, not the raw in-game number. A
good, simple model per game:

```
daily_score = base(objective_completeness)     // how much of the puzzle you solved
            + speed_bonus(time_remaining)       // faster = more, only if fully solved
            - penalty(hints_used, wrong_moves)  // discourage brute-force / reveals
```

Per-game specifics (reusing mechanics that already exist):

- **Word Hunt** — sum of `wordHuntPoints` for found words + time-left bonus. Already
  point-based; just add the time bonus and store the total.
- **Sudoku** — for a *solo/daily* board, **drop the race-rank scoring** (10/6/4/2 is
  inherently multiplayer-relative and unfair on a solo board) and score by
  **completion + time − (wrong-cell penalties × 3)**, reusing the existing −3 penalty
  constant. Keep race-rank scoring for the *in-room* multiplayer game as-is.
- **Crossword** — correct cells ÷ total cells → completeness, + time bonus,
  − per-hint penalty (the `via_hint` flag already exists; the reveal penalty is already
  −3/letter per recent commits).
- **Word Search** — found ÷ total words, + time bonus, − per-hint penalty (`via_hint`
  exists).

**Tie-breakers** (define once, apply everywhere): higher completeness → faster time →
fewer hints → earlier submission timestamp.

Put every tunable (time-bonus curve, hint penalty, tie-break order) in **one shared module
in `packages/shared`** (e.g. `packages/shared/src/scoring/daily.ts`) so web and mobile
compute identical scores and you can retune in one place. **The authoritative score is
computed server-side** at submit/finish (see §7) — the client value is display-only.

---

## 6. The Daily Challenge (the mechanism that makes it fair)

This is the backbone and it also feeds the **streak** system (`trophies-and-streaks.md`
§4.2 already assumes a "solo Daily Challenge — Sudoku / Trivia / Word Hunt" exists — this
builds that).

- **One puzzle per game per day, identical for everyone.** Derive the puzzle from a
  **deterministic seed = `hash(game_type + YYYY-MM-DD in WAT)`** so every device generates
  (or is served) the same board. Reuse the WAT day boundary the community leaderboard
  already uses (`result_date`, `src/lib/room-timezones.ts`) so Daily, streak, and
  leaderboard all agree on when "today" flips.
- **Generate server-side, store the seed** (and, for Crossword/Word Search where the
  solution is RLS-protected, keep the solution server-only exactly as the existing
  `*_solutions` tables do). The client gets the puzzle but never the answer key.
- **One scored attempt per player per day per game** (that's what makes the board fair and
  the "beat your best" meaningful — your *best-ever daily*, not "spam until lucky").
  Practice/replays after the scored attempt are fine but don't post to the board.
- **A Daily is a first-class "solo game" instance** so it reuses the finish path, and its
  finish is exactly where the leaderboard row and any trophies get written together.

---

## 7. Data model (Postgres / Supabase) — sketch

New migration under `supabase/migrations/` (timestamped `YYYYMMDDHHMMSS_` prefix per repo
convention). Keys off `profiles.id` from the trophies/identity foundation.

```sql
-- One shared puzzle per game per day. Solution stays server-only (like *_solutions).
create table daily_challenges (
  id            uuid primary key default gen_random_uuid(),
  game_type     text not null,
  challenge_date date not null,                 -- WAT calendar date
  seed          text not null,                  -- deterministic: hash(game_type + date)
  puzzle        jsonb not null,                 -- board given to clients (no answers)
  created_at    timestamptz not null default now(),
  unique (game_type, challenge_date)
);

-- One scored attempt per player per daily. The leaderboard reads from here.
create table daily_scores (
  challenge_id  uuid not null references daily_challenges(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  score         integer not null,               -- normalised, server-computed (§5)
  completeness  numeric  not null default 0,     -- 0..1, for tie-breaks / display
  time_ms       integer,                         -- for tie-breaks / display
  hints_used    integer  not null default 0,
  submitted_at  timestamptz not null default now(),
  primary key (challenge_id, profile_id)         -- one scored attempt per player per day
);
create index idx_daily_scores_board on daily_scores(challenge_id, score desc, time_ms asc);

-- Denormalised personal best per player per game (the "beat your high score" number).
-- Kept in sync on each daily submit; also trivially rebuildable from daily_scores.
create table personal_bests (
  profile_id    uuid not null references profiles(id) on delete cascade,
  game_type     text not null,
  best_score    integer not null,
  best_date     date   not null,                 -- which daily it was set on
  updated_at    timestamptz not null default now(),
  primary key (profile_id, game_type)
);
```

Notes:

- **All-time board** = top N of `daily_scores` for a `game_type` (join `daily_challenges`),
  optionally materialised/cached if it gets hot.
- **Weekly board** (Phase 2) = aggregate `daily_scores` over the last 7 `challenge_date`s.
- **`personal_bests` is a cache** — the source of truth is `daily_scores`; you can always
  rebuild it, so a bug can't permanently corrupt someone's best.

**RLS (follow `docs/rls-hardening.md`, same as trophies):**

- `daily_scores` / `personal_bests`: **owner reads own rows** (`auth.uid() = profile_id`).
- **Public leaderboard reads go through a narrow view / server route** that exposes only
  `handle + score + rank` (never email/PII), and joins the public `profiles` handle — the
  same "narrow view" pattern the trophies doc uses for its boards.
- **All writes go through the server-side finish/submit path using `getSupabaseAdmin()`**
  (service role, bypasses RLS) — never a client insert, so scores can't be forged.
- `daily_challenges.puzzle` is public-read (clients need the board); the **solution is
  never in this table** — keep it server-only like the existing `crossword_solutions` /
  `word_search_solutions` RLS-locked tables.

---

## 8. Where it hooks into existing code

- **Submit / finish:** reuse the existing server-authoritative finish pattern —
  `src/app/api/games/[code]/finish-game/route.ts` already calls per-game finalizers
  (`finishScrabbleGameEarly`, `markGameFinished`, `awardTournamentPlacements`). Add a
  `writeDailyScore(...)` step in the **same transaction** so a finished Daily produces its
  `daily_scores` row, updates `personal_bests`, *and* fires any trophies together. This is
  the identical hook the trophies award engine uses — one server path, one atomic write.
- **Score computation:** `packages/shared/src/scoring/daily.ts` (shared web+mobile),
  invoked authoritatively on the server; the client mirrors it only for live display.
- **Anti-cheat (mirror the trophies §3.9 approach):**
  - Score is **derived server-side** from the recorded submissions for that daily, never
    trusted from a client-sent number.
  - **One scored attempt** enforced by the `(challenge_id, profile_id)` primary key.
  - **Idempotent finish** — a retried/duplicate finish no-ops (same session-marker pattern
    as the trophies award transaction).
  - The **solution never leaves the server** (existing `*_solutions` RLS pattern), so a
    client can't self-complete instantly.
  - Optional: sanity-cap `time_ms` (reject sub-human completions) and log outliers.

### Stopgap option (only if you want something before the identity layer exists)

A **device-id personal-best-only** board: generate a UUID in `SecureStore`
(mobile — `apps/mobile/lib/secure-session.ts` already does device-scoped storage) /
`localStorage` (web), store `best_score` per game against it. This gives "beat your own
high score" **on that one device**, with **no global leaderboard and no cross-device
sync**, and every row has to be re-pointed to a real `profile_id` once identity lands.
I'd only do this if a personal-best demo is needed before Phase 1 of the identity work —
otherwise it's throwaway.

---

## 9. Client surface (sketch)

Mirrors the existing `src/components/*` (web) and `apps/mobile/components/*` conventions,
and reuses the mobile finish-standings / ShareCard patterns already in the codebase.

- **Daily entry point** — a "Daily Challenge" card on home (web + mobile) showing today's
  game(s), your streak flame, and "played / not yet" state.
- **Post-game result** — after a Daily finishes: your score, your rank on today's board,
  **"New personal best!"** celebration when `score > best`, and a compact top-of-board
  preview. Reuse the mobile `GameFinishPanel` / ShareCard mechanism
  (see `mobile-finished-screen-sharecards.md`) so a Daily result is shareable.
- **Leaderboard screen** — tabs: **Today · All-time · (Weekly, Phase 2)**, per game;
  highlight the viewer's own row; show handle + score + rank only.
- **Personal-best surfacing** — show each game's best score on the profile / game screen,
  next to (not duplicating) its trophies.
- **Share hook** — a "beat my score" share card links back into today's Daily (ties into
  the existing share-card work in [`share-win-cards`] and `ShareResults.tsx`).

---

## 10. Phasing

**Prerequisite (shared with trophies):** the identity foundation from
`trophies-and-streaks.md` §2 — anonymous Supabase auth + the `profiles` table. Build once.

**Phase 1 — the beatable loop (ship first):**
1. `daily_challenges` + deterministic per-day seeding for **Word Hunt** and **Sudoku**
   (the two most-ready score games; Sudoku scored solo-style per §5).
2. Shared `scoring/daily.ts` + server-authoritative score write into the finish path.
3. `daily_scores` + `personal_bests`; **personal-best celebration** on the result screen.
4. **Daily global board** (Today) + **All-time board**, narrow public read view.
5. Daily entry card + leaderboard screen (web + mobile).

**Phase 2:**
6. Add **Crossword** + **Word Search** dailies (completeness + speed − hints scoring).
7. **Weekly board**; share-to-beat card; profile personal-best surfacing.
8. Tier-2 games (Yahtzee solo, Trivia, Word Rush, …).

**Phase 3:**
9. Friends/room-history boards (needs the social graph); seasonal resets;
   country/regional boards once volume justifies it.

---

## 11. Open decisions (call these before building)

1. **Daily vs always-on:** confirm the **Daily-Challenge** model (my recommendation) vs an
   always-available "practice puzzle" that only posts your *first* attempt. Daily is
   stronger for retention; practice is gentler.
2. **One attempt vs best-of-N per day:** I recommend **one scored attempt** for board
   integrity; confirm you're OK with that (practice replays stay unscored).
3. **Score formula weights** per game (time-bonus curve, hint penalty) — §5 defines the
   shape; the constants need a first-pass tuning.
4. **Which 2 games seed Phase 1** — I propose Word Hunt + Sudoku (most score-ready); confirm
   against actual play data.
5. **Handle shown on the board** — reuse the `profiles.handle`; decide whether guests
   (anonymous, no email) appear on the global board or only after they claim a handle
   (recommend: guests can appear with an auto-handle, nudged to claim it — same
   moment-of-value logic as the trophies doc).
6. **Anti-cheat ceiling** — whether to add server-side time-sanity caps in v1 or defer.

---

## 12. How this relates to trophies & streaks (so we don't double-build)

| Pillar | Rewards | Fair because | Identity |
|---|---|---|---|
| **Trophies** (`trophies-and-streaks.md`) | per-game **mastery / collection** | criteria are absolute | `profiles.id` |
| **Streaks** (`trophies-and-streaks.md`) | **daily return** | one action/day | `profiles.id` |
| **High scores / leaderboards** (this doc) | **competitive score ranking** on score games | everyone plays the **same daily puzzle** | `profiles.id` |

All three share the **same identity, the same `finish-game` server hook, and the same RLS
pattern.** The Daily Challenge built here is *also* the solo action that feeds the streak.
Build the identity foundation once; these three are consumers of it.
