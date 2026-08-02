# Per-game trophies — implementation plan

**Source brief:** `FateRound-Trophies-Per-Game.md` (270 trophies: 30 each for Monopoly, Whot,
UNO, Crazy Eights, Ludo, Trivia, Chess, Codewords, Text Charades = `describe_it`).

**Also:** `FateRound-Trophies-Wave-2.md` — 180 more (Group A: Yahtzee, Scrabble, Mafia, Mahjong,
Ayo, Checkers) + 135 (Group B, 15 each). **585 trophies across 24 games in total.**

**Status:** planning. Feasibility audit in progress (Whot and Monopoly complete). Nothing built.

### Audit scoreboard

| Game | A (derivable) | B (needs in-play) | C (cannot build) |
|---|---|---|---|
| Whot | 5 | 24 | 0 outright, 5 ambiguous |
| Monopoly | 10 | 17 | 3 |

Both games can ship their **Champion track today with zero code** — `games_won` scoped to the
game type already works, and both are wired in `outcome.ts`.

---

## 1. The blocker: the games do not remember how they were played

The award pass runs after a game finishes (`/api/profile/attribute`) and reads **persisted
state**. The seat-based games persist only their *current* state, not their history.

`whot_sessions` (`supabase/migrations/0064_whot.sql:1`) is the clearest case. It holds
`turn_order`, `current_turn_index`, `phase`, `draw_pile`, `top_card`, `required_shape`,
`pick_two_stack`, `pick_five_stack`, `winner_player_id`. Every one of those describes the board
*right now*. There is no move log.

So at the moment a Whot game ends the server can answer "who won" and "what was in each hand",
and almost nothing else. It cannot answer:

- did this player ever play a Pick Two? (trophy 3)
- how many cards did they draw? (2, 14, 27)
- were they ever hit by a penalty? (19)
- what was their peak hand size? (23)

Those facts existed while the game ran and were overwritten as state advanced. **They cannot be
recovered at finish.** No amount of work in the award pass fixes this — the information is gone.

This is why the brief's *Tracking* column is the important column, and why "existing" in it is
mostly optimistic: it means "the game shows this in the UI", not "the server has it in a row
after the game ends".

## 2. What follows from that

Trophies split into three buckets, and the split decides the build:

| | Meaning | Cost |
|---|---|---|
| **A** | Derivable at finish from state already persisted | Cheap — a counter function, no migration |
| **B** | Needs a counter incremented **during play**, in the action route | Needs a per-session counter store + a bump at every action site |
| **C** | Not observable without new data structures | Cut, or re-specify |

Bucket B is the real project. It is not per-trophy work: it is **one mechanism** — somewhere to
accumulate per-(session, player) integers while a game runs, folded into
`player_stats.counters` at finish — plus a bump call at each action site.

`player_stats.counters` is already a per-game-type jsonb bag, so **the destination needs no
migration**. What is missing is the in-play accumulator and the emit points.

## 2b. CONFIRMED (Whot audit): in-play routes cannot reach the counter bag at all

`players.profile_id` is **NULL while a game is running**. It is written only at finish, by
`/api/profile/attribute`. The action routes authenticate by `resume_token` → `players.id` and
never see a profile.

`player_stats.counters` is keyed by `profile_id`. So an in-play route **cannot write to it** —
not "shouldn't", *cannot*. Every bucket-B counter therefore needs:

1. a per-(game, player) accumulator — a jsonb column on the game's existing per-player table
   (for Whot, `whot_player_hands`, which is already UNIQUE(game_id, player_id)),
2. incremented inside the action route, **inside the won-CAS branch** (all four Whot write paths
   use optimistic concurrency; an increment outside it double-counts on a lost race),
3. folded into `player_stats.counters` by a game-specific extras block in the award pass.

That single missing column gates ~24 of Whot's 30 trophies. It is one migration per game, not
per trophy.

**Bucket A still needs code.** The award pass currently reads only `games`, `players` and the
winner. "Derivable at finish" means no new data has to be *recorded* — it does not mean no work.

## 2c. Negative conditions: invert at emit time (settled)

The DSL has exactly one scalar predicate, `gte`. There is deliberately no `lt`/`eq`/`not`:
counters are monotone, so a `lt` rule would be satisfied *before the player ever played* and
would then un-earn itself. Trophies are permanent, so a rule that flickers is a bug.

So "never hit by a Pick Two" is built as: a per-game flag set during play → at finish, emit
`whot_untouched_games: 1` only if the flag is clear → the rule is a plain positive
`{counter: 'whot_untouched_games', gte: 1}`. Every "without ever…" trophy across every game
takes this shape.

## 2d. THE ARCHITECTURAL FORK: per-counter writes vs one event log

Both audits so far independently reach the same place, and the Monopoly one names the
alternative explicitly. There are two ways to build bucket B:

**Option 1 — per-counter in-play writes.** Every trophy that counts something gets a counter
column/key bumped at its action site. Whot needs ~18 accumulator keys; Monopoly needs 17. Each is
a small change, but each is also a place to get the CAS/atomicity wrong, and the count grows with
every trophy authored.

**Option 2 — one append-only per-game event log.** A generic `game_events` table
(`game_id, player_id, seq, kind, payload jsonb`) written at the same action sites. Then **most of
bucket B collapses into bucket A**: the award pass derives counters at finish by aggregating the
log, with no in-play counter logic at all, and a new trophy needs no new write path — only a new
aggregation.

Option 2 is very likely the higher-leverage build. It also has costs to price honestly: write
volume per game, retention/cleanup after finish, and payload discipline (a log is only as good as
its `kind` vocabulary). It would additionally give the activity feed a real backing store, which
Monopoly currently fakes with single-slot `last_*_event` columns.

**This decision should be made before any counters are written**, because the two options do not
compose — building 35 counters and then adding a log means doing the work twice.

## 2e. Monopoly-specific blocker: the RPC allowlist

Monopoly funnels every write through `monopoly_claim_and_apply`, which has a hard column
allowlist and `RAISE EXCEPTION 'UNKNOWN_PLAYER_COLUMN'` on anything else
(`20260702130000_monopoly_atomic_claim_and_apply.sql:57-63`, update block `:109-118`).

So no per-player stat can be written through the existing path. One migration extending that
allowlist with delta-shaped stat columns (mirroring the existing `cash_delta` / `cards_delta`)
unblocks all 17 at once. Writing outside the RPC instead would forfeit the atomicity that
migration exists to guarantee — don't.

## 2f. Trophies that cannot be built as written (found so far)

| Game | # | Problem |
|---|---|---|
| Monopoly | 15 | "Own 4 houses on a single property" — the engine caps at 3 (`monopoly-board.ts:43`, 3 houses then hotel). Unreachable. Reword to 3. |
| Monopoly | 25 | "Naija Edition" — no edition exists. `games.theme='naija'` is platform-wide cosmetic chrome, not a board. Needs a feature first. |
| Monopoly | 26 | "London Edition" — the only board IS London (`monopoly-board.ts:60`), so this fires on every game. Worse than not shipping. |
| Whot | 8, 18, 26 | Silently unearnable when the host disables Pick Three or Pick 2 stacking. Needs an admin note; an unearnable trophy is indistinguishable from a typo. |
| Whot | 11, 12, 18 | Ambiguous units — "in a row" (whose turns?) and "3+ stacks" (cards or draws?). Re-specify before building. |

Also worth knowing: Monopoly **destroys ownership history for bankrupt players**
(`returnPlayerAssetsToBank`, `monopoly.ts:2938`), and `removeMonopolyPlayer` **deletes the
players row** — so seated counts for anti-farm minimums must be read from
`monopoly_boards.turn_order`, not from `players`.

## 3. What is already true and does not need rebuilding

- `player_stats.counters` — per-(profile, game_type) integer bag, merged atomically by
  `bump_player_stats` (`supabase/migrations/20260805000000_trophy_counters_atomic.sql`).
- The criteria DSL (`src/lib/trophies/criteria.ts`) already scopes a rule to a game type, so a
  Whot-only rule is `{type:'counter', counter:'…', gte:N, gameType:'whot'}` — the admin rule
  builder can already express these once the counters exist.
- `src/lib/trophies/counters.ts` is the vocabulary gate: a rule naming an unmeasured counter is
  rejected at save time rather than silently never firing. Every new counter must be registered
  there or the trophy cannot be created.
- Award is once-per-(profile, session), claim-first on `awarded_sessions`.

## 4. Open design questions (decide before building)

1. **Negative conditions.** "Never hit by a Pick Two", "won without drawing a card" cannot be
   expressed with monotonically-increasing lifetime counters — `penalties_taken == 0` lifetime is
   not the same as "zero in that game". These need a per-game *outcome* flag counted at finish
   (e.g. `clean_games` incremented when that game had zero penalties), not a raw event counter.
   This pattern covers a large share of the Gold/Platinum tier.
2. **Champion tracks.** The brief wants one levelling trophy per game (5/15/30/50) displayed as
   the highest level reached. The current model is one row per trophy. Either four trophies with
   only the top one shown, or a new track concept. Decide before authoring 9 of them.
3. **Anti-farm.** The brief's rules (minimum players, minimum game length, distinct opponents,
   unlock rate limit) are cross-cutting and belong in the award pass, not in individual rules.
   Distinct-opponents in particular needs data the counter bag cannot hold.
4. **Two-wave ship.** The brief recommends launching Bronze + Silver only (18/game, 162 total).
   Worth honouring — it front-loads the trophies players actually hit.

## 5. Sequence

1. Finish the feasibility audit (in progress) — get the A/B/C split per game.
2. Cut bucket C, and re-specify anything ambiguous.
3. Build the in-play counter mechanism once, and pilot it on **one** game end to end.
4. Register that game's counters in the vocabulary; author its trophies.
5. Repeat per game — by then it is mechanical.

Whot is the right pilot: it is the game the request started from, it is the template UNO and
Crazy Eights are modelled on, and its counters (`cards_drawn`, `penalties_taken`, peak hand size)
are the ones the brief says recur across every card game.
