# Live trophy unlocks — plan

**Solves two things at once, because they share a root cause:**

1. **Evidence is destroyed before it is read.** Play-again deletes session rows; Chess's rematch
   blanks `pgn`. Facts are derived when the *client* posts attribution, after the finished
   screen — so a host who hits Play Again first destroys them. There is already a finished chess
   game in the production database with an empty PGN.
2. **Mid-game unlocks are impossible.** Some trophies are true the instant they happen (a Yahtzee
   on the first roll of a turn; a WHOT played as the last card). They should pop immediately, the
   way a console does it. Today nothing can: a gameplay route has no profile, because
   `players.profile_id` is null until attribution.

Both are the same mistake — **trophy work happens too late, in the wrong process.**

---

## 1. The move: derive facts at FINISH, not at attribution

Today: `finish → (client mounts screen) → attribute → read live session state → counters`.
The middle step is where the data goes missing.

Proposed: `finish → derive + persist facts → (later, whenever) → attribute reads facts`.

### 1.1 Where facts live

```sql
create table round_facts (
  game_id     text not null,
  player_id   uuid not null,
  finished_at timestamptz not null,   -- identifies the ROUND, matching the award claim key
  facts       jsonb not null default '{}',
  primary key (game_id, player_id, finished_at)
);
```

Keyed by round, for the same reason `awarded_sessions` now is: play-again reuses the game id, so
`(game_id, player_id)` alone would collide across rounds.

**Play-again must not delete this table.** That is the entire point — it is the durable copy of
what the session rows said before they were cleared. Worth a comment in every `clear*SessionData`
saying so, because the next person adding one will follow the pattern.

Retention: these rows are small and finite (one per player per round). If they ever need
pruning, prune on `finished_at` older than N months — never on play-again.

### 1.2 Who writes it

**`markGameFinished` (`src/lib/game-finish.ts`) is the single choke point** every game already
funnels through. One hook there covers all 40+ games rather than 40 call sites.

**Verified, not assumed** (2026-08-02): 51 call sites, and every non-test file that writes
`status: 'finished'` also calls it — ayo, chess, checkers, draughts10, describe-it, tic-tac-toe,
memory-match, npat, ping-pong, quiplash, quick-draw, word-rush, landmine, trivia, two-truths,
the three tournament paths and admin-end-game. Only test files set the status directly. If that
ever stops being true the hook silently stops firing for that game, so it is worth a test that
asserts the invariant rather than trusting it to stay.

```
markGameFinished(gameId)
  → load seated players
  → for each: buildGameFacts(...)   // the builders we already have
  → insert into round_facts
```

**Signature change worth making now:** builders currently take one `playerId` and re-query per
player. At 40-player Trivia that is 80 queries. Change them to take the game and return
`Map<playerId, facts>` — one pass over the same rows. Do this before adding more builders, not
after.

### 1.3 What attribution then does

`awardForFinishedGame` reads `round_facts` for `(gameId, me.id, finished_at)` instead of calling
builders. Everything downstream is unchanged.

**Fallback:** if no `round_facts` row exists (a game that finished before this shipped), fall
back to calling the builder live. Same behaviour as today, no backfill needed, and it degrades
to "some old games lose their facts" rather than breaking.

---

## 2. Instant unlocks

### 2.1 The constraint

A gameplay route knows the *player*, never the *profile*. So an unlock during play cannot be
written to `player_trophies` — that table is keyed by profile.

### 2.2 The shape

```sql
create table round_unlocks (
  game_id    text not null,
  player_id  uuid not null,
  trophy_id  text not null references trophies(id) on delete restrict,
  unlocked_at timestamptz not null default now(),
  primary key (game_id, player_id, trophy_id)
);
```

- The action route writes a row **and that is all it does** — no profile lookup, no counter
  maths, no criteria evaluation across the catalog.
- The client learns about it over the realtime channel the game already has, and shows the toast.
- At finish, these fold into the normal pass: each unlock becomes a `player_trophies` row for
  whatever profile the player turns out to belong to. Already-held trophies are skipped by
  `grantEligible`, so a second unlock of the same trophy is a no-op, exactly as it is now.

### 2.3 Which trophies qualify

**Not all of them, and the list must stay short.** A trophy is instant-eligible only when:

- its condition is decidable at a single action, with no cross-round aggregation, AND
- the action route already computes the fact as part of doing its job.

Yahtzee's "Yahtzee on the first roll of a turn" qualifies: `processYahtzeeRoll` already knows the
dice and `rolls_this_turn`. "Win from outside the top three at halfway" does not, and never will.

So instant unlocks are a **flag on a system trophy** (`instant: true`), not a new kind of trophy.
Everything else keeps arriving at the finished screen — which is fine and matches consoles, where
plenty of trophies land on the results screen.

**Anti-cheat note:** the unlock must be written by the SERVER inside the action handler, from
state it computed itself. A client-reported "I got it" is not acceptable — that is a free trophy
for anyone with devtools.

### 2.4 Cost

One insert on a small fraction of actions. Guard with an in-memory check so a route doesn't
re-insert a trophy the player already unlocked this round.

---

## 3. UX

**Toast.** Same position and z-index as `PostWinPrompt` — `fixed top-16 z-50`, above the game
header. Bottom corners are where people have learned nothing important lives, and this is a
reward, not a notification. Auto-dismiss ~5s, stack if several land together, never block input.
Mobile: same, respecting the safe area.

**Finished screen.** A single line: **"3 trophies this game →"**, linking to
`/profile/<gameType>`. Shows whenever `earned.length > 0`, regardless of whether the player won —
losing a game and still unlocking something is one of the better moments a trophy system has.

Nothing exists today; `PostWinPrompt` is the signup prompt and is a different job. It should stay
as it is and the trophy line should sit with the results, not replace it.

---

## 4. Phasing

| Phase | What | Why first |
|---|---|---|
| **1** | Builders return per-player maps | Cheap now, painful after more builders exist |
| **2** | `round_facts` + write in `markGameFinished` + read in attribution | Fixes the data loss. No UX change, fully shippable alone |
| **3** | Finished-screen "N trophies this game →" | Small, uses the award result that already exists |
| **4** | `round_unlocks` + realtime + toast, Yahtzee only | Proves the path end to end on one game |
| **5** | Mark instant-eligible trophies per game and roll out | Mechanical once 4 works |

Phase 2 is the one worth doing regardless — it fixes a live bug where legitimately-earned
trophies vanish. Phases 4–5 are the console-style polish and depend on nothing else being
in flight.

## 5. Explicitly out of scope

- Retro-awarding trophies for games that finished before this shipped. `/api/profile/sync`
  already grants anything the current counters justify; the per-game facts of a finished round
  are gone and cannot be reconstructed.
- Showing another player's unlocks live. Nice, but it needs a rarity/privacy decision first.
