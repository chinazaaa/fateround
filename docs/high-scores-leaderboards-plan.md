# High Scores & Leaderboards — Build Plan

Status: **Ready to build when you are** · Companion to
[`trophies-and-streaks.md`](./trophies-and-streaks.md) and
[`account-tiers.md`](./account-tiers.md)

**What we're building:** on the puzzle games (Word Hunt, Sudoku, Crossword, Word Search),
players get a **high score they can beat**, and they can **see other players' scores** so
they want to beat those too.

There are **four leaderboards** in total. This doc explains each one, which **games** they
apply to, and whether we need **auth** — in plain terms first, then the technical detail at
the end.

---

## Part 1 — The one idea that makes it all work: the Daily Challenge

Before the leaderboards make sense, one thing has to be true: **everyone has to be scored
on the same puzzle.**

Right now every game generates a *different* puzzle each time it's played. That means a
score of 900 on an easy Sudoku and 900 on a hard one aren't the same achievement — so you
can't rank them against each other. A leaderboard built on random puzzles would be
meaningless.

The fix is the **Daily Challenge**:

> **Once a day, per game, everyone in the world gets the exact same puzzle.**
> Word Hunt has one board today. Sudoku has one grid today. Everyone plays *that* one.

Because everyone played the same puzzle, the scores are finally comparable — and *that's*
what every leaderboard below is built on. (This is the same "daily puzzle" idea behind
Wordle and the NYT games.) It also doubles as the daily activity that feeds the **streak**
system in [`trophies-and-streaks.md`](./trophies-and-streaks.md).

A few rules that keep it fair:
- **The puzzle is the same for everyone**, decided by the date (so no one gets an easier board).
- **You get one scored attempt per day, per game.** You can keep practising after, but only
  your first real attempt counts toward the boards — otherwise people would just retry until
  they got lucky.
- **The answer key never reaches the phone** (it stays on the server), so no one can cheat
  by reading the solution.

Everything below hangs off this.

---

## Part 2 — The four leaderboards, explained

All four are **per game**. Word Hunt has its own set of four boards; Sudoku has its own;
and so on. Here's what each board is, why it exists, and an example.

### 1. Personal Best — *"beat your own high score (and your best time)"*

**What it is:** your own best result, kept per game, on **two axes**:
- **Best score** — Today's score vs your highest Daily score ever (higher is better).
- **Best time** ⏱️ — Today's time vs your fastest completion ever (lower is better),
  shown as `m:ss`, e.g. *"Sudoku — best time 1:23."*

**Why:** this is the core loop the whole feature is about. When today's result beats your
best-ever *on either axis*, we throw a little **"New personal best!"** celebration (score) or
**"New record time!"** (time). It feels good even if literally no one else is playing — so
it's the first thing that works.

**Which axis matters per game:** some games are naturally **score-first** (you accumulate
points in a fixed time — Word Hunt), others are **time-first** (you complete a fixed puzzle,
fastest wins — Sudoku). Each game declares a **primary metric**; we still track *both* where
they're meaningful, because "my best time" is intuitive even on score games. See Part 3.

**Example (score-first):** *"Word Hunt — Today: 3,200 · Your best: 4,100."*
**Example (time-first):** *"Sudoku — Today: 1:41 · Your best: 1:23."* Tomorrow you try to go
faster than 1:23.

### 2. Daily Global Board — *"beat everyone else, today"*

**What it is:** a ranked list of **everyone's score on today's puzzle**, for that game. It
**resets every day** with the new puzzle.

**Why:** this is the headline, social feature. Because it resets daily, it's *always
beatable* — a brand-new player who plays today can land at #1 today. Nobody is ever staring
at an untouchable all-time record they can't dream of beating. Fresh competition every day
is the single biggest reason daily boards keep people coming back.

**Example:** *"Sudoku — Today's board: 1. Ada 980 · 2. Bimpe 940 · 3. **You** 910 …"* Beat
Bimpe and you move up. Tomorrow it starts over.

### 3. All-Time Board — *"the hall of fame"*

**What it is:** the best Daily scores **ever recorded** by anyone, for that game. It moves
slowly and only changes when someone has a truly great day.

**Why:** it gives your dedicated players a long-term wall to climb — a record that stands
for weeks. It's the aspiration that sits above the daily churn.

**Example:** *"Crossword — All-time best: 1. Chidi 5,000 (set Mar 3) …"* Hard to reach, and
that's the point.

### 4. Weekly Board — *"this week's champion"* (optional, add after the first three)

**What it is:** scores added up (or best-of) over the last **7 days**, per game. Resets each
week.

**Why:** the daily board can feel punishing if you miss a day. The weekly board is gentler —
one bad day doesn't sink you — and it creates a satisfying "weekly champion" beat. It's
marked optional because the first three deliver the core experience; weekly is a nice layer
on top.

**Example:** *"Word Search — This week: 1. Dami 18,400 (6 days played) …"*

### How they fit together

| Board | Compares you against | Resets | Feeling |
|---|---|---|---|
| **Personal Best** | your past self | never (it only goes up) | "I'm improving" |
| **Daily Global** | everyone, today | every day | "I can win *today*" |
| **All-Time** | everyone, ever | never | "someday I'll get up there" |
| **Weekly** | everyone, this week | every week | "I'm this week's champ" |

Together they cover every kind of player: the solo self-improver, the daily competitor, the
long-term grinder, and the casual who plays a few times a week.

---

## Part 3 — Which games

### The launch games (the whole puzzle family — decided)

These five already give each player their own score on a puzzle *and* keep their answer key
server-side, so they slot straight into the Daily Challenge + leaderboards. **All five get all
four boards.**

| Game | What the score is | Primary metric | Notes |
|---|---|---|---|
| **Sudoku** | how much you solved + speed − a penalty for wrong cells | **Time** ⏱️ (score = secondary) | you complete a fixed grid — fastest correct solve wins; this is the `1:23` case |
| **Word Hunt** | points for the words you find (longer word = more points) + a bonus for finishing fast | **Score** (time = secondary) | fixed time limit, so "fastest" doesn't apply the same way; still show best time as flavour |
| **Word Search** | how many words you found + speed − a penalty for using hints | **Time** ⏱️ (score = secondary) | fastest to find all words wins; hint penalty already exists |
| **Crossword** | how many cells you got right + speed − a penalty for using hints | **Time** ⏱️ (score = secondary) | fastest full correct fill wins; hint penalty already exists |
| **Word Scramble** | how many words you unscramble + speed − a penalty for using hints | **Time** ⏱️ (score = secondary) | answer key already server-side via `/api/word-scramble/solution`; fastest correct solve wins |

The **primary metric** decides which axis the Daily Global / All-Time / Weekly boards *rank*
by for that game (time-first games rank fastest-first; score-first games rank highest-first).
The secondary metric is still stored and shown on the Personal Best card — only the ranking
axis differs.

**Suggested order within the family:** start with **Sudoku + Word Hunt** (most ready, one
time-first + one score-first so both ranking paths get exercised early), then fold in **Word
Search, Crossword, Word Scramble**. Same plan for all five.

### Games that can join later

Same idea, add once the first four are proven: **Yahtzee** (it already has a solo mode),
**Trivia**, **Word Rush**, **Quick Draw**, **Matching Pairs**.

### Games this is *not* for

The turn-based and party games — chess, checkers, ludo, whot, crazy eights, monopoly,
scrabble, tic-tac-toe, mahjong, ayo, snake & ladder, mafia, quiplash, bingo, the poll games.
Those are **win/lose**, not "score you beat," so a high-score board doesn't fit them. Their
competitive layer is **trophies and tournaments**, which is a separate system already
planned in [`trophies-and-streaks.md`](./trophies-and-streaks.md).

---

## Part 4 — Do we need auth? (Yes — and it's the same auth trophies needs)

**A leaderboard needs to know who each score belongs to, and remember it across days.**
Today the app has *no* memory of who a player is — someone is just a name typed into one
game, forgotten the moment the game ends. So yes, this needs an identity system.

**The good news: it's the exact same identity system already planned for trophies and
streaks**, so we're not building anything new or waiting on a separate project. From
[`trophies-and-streaks.md`](./trophies-and-streaks.md) §2:

- **Everyone gets an identity automatically on first play** (an "anonymous account" created
  behind the scenes — no sign-up screen, no friction). Their scores attach to that from day
  one.
- **Signing up with email later just *saves* that same identity** so it survives switching
  phones. Nothing is lost; the anonymous identity becomes a real account in place.
- **We never force login to play.** Playing is always instant. The only nudge to sign up is
  *after* someone does well — *"Nice score — save it to your profile so you don't lose it."*

So the honest answer to *"do I wait for auth?"*: **the auth this needs is the anonymous-first
login that trophies already requires. Build that identity foundation once, and both trophies
and leaderboards run on top of it.** You are not blocked on a bigger auth project.

> If you ever wanted a taste *before* that identity layer exists, you could do a
> **personal-best-only** version saved on the one device (no global board, doesn't move
> between phones). But it's throwaway work — the real version needs the shared identity, so
> it's cleaner to build the identity first.

---

## Part 5 — How scoring stays fair (short version)

Because different days have different puzzles, we don't store the raw in-game number. Each
game converts its result into a **normalised score** with the same shape everywhere:

```
score  =  how much of the puzzle you solved
        + a bonus for finishing quickly
        − a penalty for hints used or wrong moves
```

- **The server calculates the official score** (the phone's number is just for show), so
  scores can't be faked.
- **Ties are broken** by: solved more → finished faster → used fewer hints → submitted
  earlier.
- All the knobs (how big the speed bonus is, how much a hint costs) live in **one shared
  place** so web and mobile always agree and we can retune easily.

---

## Part 6 — The technical build (for when you start)

This part is for implementation; skip it if you just wanted the concept.

### Where it plugs in
- **Identity:** the `profiles` table + anonymous Supabase auth from
  [`trophies-and-streaks.md`](./trophies-and-streaks.md) §2. Shared prerequisite — build once.
- **Scoring logic:** a shared module, `packages/shared/src/scoring/daily.ts`, used by both
  web and mobile, but run authoritatively on the server.
- **Saving a score:** reuse the existing finish path
  `src/app/api/games/[code]/finish-game/route.ts` (it already runs per-game finishers). Add a
  step that writes the daily score + updates the personal best, in the same transaction that
  awards trophies — one server path does everything at once.
- **Day boundary:** reuse the WAT date logic the community leaderboard already uses
  (`src/lib/room-timezones.ts`) so Daily, streak, and leaderboards all agree on when "today"
  flips.
- **Puzzle generation:** derive each day's puzzle from a fixed seed
  (`hash(game_type + date)`) so every device gets the identical board; keep the answer key in
  a server-only table, exactly like the existing RLS-locked `crossword_solutions` /
  `word_search_solutions` tables.

### Database sketch
New migration under `supabase/migrations/` (timestamped `YYYYMMDDHHMMSS_` prefix per repo
convention). Keys off `profiles.id`.

```sql
-- One shared puzzle per game per day. The answer key is NOT in this table.
create table daily_challenges (
  id             uuid primary key default gen_random_uuid(),
  game_type      text not null,
  challenge_date date not null,                 -- WAT calendar date
  seed           text not null,                 -- hash(game_type + date)
  puzzle         jsonb not null,                -- the board sent to clients (no answers)
  created_at     timestamptz not null default now(),
  unique (game_type, challenge_date)
);

-- One scored attempt per player per daily. Every board reads from here.
create table daily_scores (
  challenge_id  uuid not null references daily_challenges(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  score         integer not null,               -- normalised, computed server-side
  completeness  numeric  not null default 0,     -- 0..1, for tie-breaks / display
  time_ms       integer,
  hints_used    integer  not null default 0,
  submitted_at  timestamptz not null default now(),
  primary key (challenge_id, profile_id)         -- enforces one attempt per day
);
create index idx_daily_scores_board on daily_scores(challenge_id, score desc, time_ms asc);

-- Cached personal best per player per game (rebuildable from daily_scores).
-- Tracks BOTH axes: best score (higher wins) and best time (lower wins).
create table personal_bests (
  profile_id      uuid not null references profiles(id) on delete cascade,
  game_type       text not null,
  best_score      integer,                         -- null until a scored attempt
  best_score_date date,
  best_time_ms    integer,                         -- fastest completion; null if never completed
  best_time_date  date,
  updated_at      timestamptz not null default now(),
  primary key (profile_id, game_type)
);
-- best_time_ms only counts a FULL/valid completion (completeness = 1), so a fast
-- partial solve can't fake a record time. A game's primary metric (see Part 3) decides
-- which of best_score / best_time_ms the boards rank by.
```

Which board is which query (**order direction depends on the game's primary metric** — a
time-first game orders `time_ms asc`, a score-first game orders `score desc`):
- **Personal Best** → read `personal_bests` (best score *and* best time) + today's row in
  `daily_scores`.
- **Daily Global** → `daily_scores` for today's `challenge_id`, ordered by the primary metric.
- **All-Time** → best rows in `daily_scores` for a `game_type`, all dates, by primary metric.
- **Weekly** → `daily_scores` over the last 7 `challenge_date`s: **best-of** (fastest / highest)
  for time-first games rather than a sum, since times don't add up.

The existing `idx_daily_scores_board(challenge_id, score desc, time_ms asc)` already serves
score-first ranking with a time tie-break; add a mirror index
`(challenge_id, time_ms asc, score desc)` for time-first games so their boards read cheaply.

### Security / anti-cheat
- **All writes go through the server** using the admin client (`getSupabaseAdmin()`), never a
  direct insert from the phone — so scores can't be forged. Follow `docs/rls-hardening.md`.
- **Players read only their own** score rows; the **public board is a narrow view** exposing
  only handle + score + rank (never email/PII) — same pattern as the trophies boards.
- **One attempt per day** enforced by the `(challenge_id, profile_id)` primary key.
- **The solution stays server-side** (existing `*_solutions` RLS pattern).
- Optional: reject impossibly-fast completions and log outliers.

### Screens to build (web + mobile)
- A **Daily Challenge card** on home: today's game(s), your streak, played/not-yet.
- A **result screen**: your score, your rank today, the **"New personal best!"** moment,
  a peek at the top of today's board. Reuse the mobile ShareCard pattern
  (`mobile-finished-screen-sharecards.md`) so results are shareable.
- A **Leaderboard screen** with tabs: **Today · All-time · Weekly**, per game, your own row
  highlighted.
- **Personal best** shown on the profile / game screen.

---

## Part 7 — Build order

**First, the shared foundation (also needed by trophies):** anonymous Supabase auth + the
`profiles` table. Build once.

**Then:**
1. Daily Challenge for **Sudoku + Word Hunt** (seed, server-side scoring, one attempt/day) —
   one time-first + one score-first so both ranking paths are exercised from day one.
2. **Personal Best** (best score *and* best time) + the "new personal best / new record time"
   celebration. *(Board #1)*
3. **Daily Global board** + **All-Time board**. *(Boards #2 and #3)*
4. Fold in the rest of the puzzle family: **Word Search, Crossword, Word Scramble** dailies.
5. **Weekly board.** *(Board #4)*
6. Extend to later games (Word Rush, Yahtzee solo, Trivia…).

---

## Part 8 — How this relates to trophies & streaks

Three separate systems, one shared identity — so nothing is double-built:

| System | Rewards | Kept fair by |
|---|---|---|
| **Trophies** ([doc](./trophies-and-streaks.md)) | mastering each game | fixed, absolute criteria |
| **Streaks** ([doc](./trophies-and-streaks.md)) | coming back every day | one action per day |
| **High scores / leaderboards** (this doc) | scoring higher than before / than others | everyone plays the **same daily puzzle** |

All three share the same identity (`profiles.id`), the same server finish-hook, and the same
security pattern. And the **Daily Challenge built here is also the daily action that keeps a
streak alive** — one feature feeds two systems.

---

## Part 9 — Small decisions — RESOLVED with recommended defaults (2026-07-17)

Reversible; override anytime.

1. ✅ **One scored attempt per day** (keeps boards honest). Practising after doesn't count.
2. ✅ **Score formula weights** — start at **completion 70% / speed 20% / −penalty 10% on a
   0–1000 scale**, then tune per game from real play data. The shape is set in Part 5.
3. ✅ **Guests appear on the global board** — yes, with an auto-generated handle, nudged to claim
   it after a good result (moment-of-value; keeps boards populated).
4. ✅ **Launch set** — the whole puzzle family (Sudoku, Word Hunt, Word Search, Crossword, Word
   Scramble), phased in starting with Sudoku + Word Hunt (Part 7).
