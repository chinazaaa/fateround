# Per-game trophies — implementation plan

**Source brief:** `FateRound-Trophies-Per-Game.md` (270 trophies: 30 each for Monopoly, Whot,
UNO, Crazy Eights, Ludo, Trivia, Chess, Codewords, Text Charades = `describe_it`).

**Also:** `FateRound-Trophies-Wave-2.md` — 180 more (Group A: Yahtzee, Scrabble, Mafia, Mahjong,
Ayo, Checkers) + 135 (Group B, 15 each). **585 trophies across 24 games in total.**

**Status:** planning. Feasibility audit in progress (Whot and Monopoly complete). Nothing built.

### Audit scoreboard — COMPLETE (15 games, 450 trophies at 30 each)

| Game | A — derivable | B — needs in-play | C — cannot build | Verdict |
|---|---|---|---|---|
| **Chess** | 29 | 0 | 1 | Full PGN stored. Replay at finish. Nearly free. |
| **Yahtzee** | 23 | 5 | 2 | Complete 13-cell scorecard persisted. Nearly free. |
| Monopoly | 10 | 17 | 3 | RPC allowlist must be extended first |
| Ludo | 8 | 17 | 5 | Nothing recorded; 5 trophies describe absent mechanics |
| Scrabble | 8 | 22 | 0 | All buildable, none per-play free |
| Ayo | 6 | 22 | 2 | No per-player table — paired `a_*/b_*` columns |
| Crazy Eights | 5 | 23 | 2 | Whot's schema; shares Whot's mechanism |
| Whot | 6 | 24 | 0 (5 ambiguous) | The original ask; the +1 A is the Champion track |
| Checkers | 12 | 17 | 1 | THREE game types, TWO engines/tables |
| **Trivia** | 28 | 0 | 2 | Per-answer log with response times. FREE. |
| **Codewords** | 29 | 1 | 0 | Per-guess log. Blocked on a live bug (fixed). |
| **Text Charades** | 26 | 3 | 1 | Per-word log; needs a winner resolver first |
| Mafia | 17 | 10 | 3 | Roles/teams persisted; night OUTCOMES are not |
| Mahjong | 7 | 22 | 1 | Rich per-hand data, wiped every hand |
| UNO | 3 | 24 | 3 | Most contradictions of any game |

**The split is not a spectrum, it is two populations.** The RECORD-based games persist what
happened — a move list (Chess), a scorecard (Yahtzee), a per-answer log (Trivia), a per-guess
log (Codewords), a per-word log (Text Charades) — and are almost entirely derivable at finish.
The POSITION-based games (Whot, UNO, Crazy Eights, Scrabble, Ludo, Monopoly, Ayo, Mahjong,
Checkers, Mafia) persist only current state, and need in-play accumulation for ~three quarters
of their list.

Every game can ship its **Champion track today with zero new code** — `games_won` scoped to the
game type already works and all ten are wired in `outcome.ts`. That is 10 trophies (or 40 if
each track is four rows) available immediately.

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

## 2g. THREE live bugs the audit found in shipped code (all FIXED)

Neither was hypothetical — both affected counters already in PR #742.

1. **UNO Team-Up recorded a LOSS for the winning teammate.** A team round ends when one member
   empties their hand and `winner_player_id` holds only that player. `unoPlayerSharesWin` exists
   for exactly this case and the community leaderboard already used it; the trophy pass read the
   raw column. Fixed in `outcome.ts` (`expandUnoTeamWin`).
2. **Solo games counted as wins.** Yahtzee and Sudoku allow one player and still write
   `winner_player_id`, so every Champion track was farmable alone. Fixed: a win now needs
   ≥2 seated players. `games_played` still counts. Test added.
3. **Codewords produced NO standings, ever — and this one predates trophies.**
   `room-points.ts` selected `winner, turn_order` from `codewords_boards`, which has no
   `turn_order` column. PostgREST rejects the whole query (42703, verified live), so `board` was
   always null and `getCompetitiveStandings` returned `[]`. Codewords therefore contributed
   nothing to **room leaderboard points** either — a user-facing bug that shipped long before
   this work. Fixed by reading the roster from `codewords_player_roles`.

### Still open (not fixed — decide first)

- **Mafia has no winner source at all.** Absent from `WINNER_SOURCES` *and* from
  `NO_WINNER_BY_DESIGN`, so `games_won` is permanently 0. The winner is a TEAM
  (`mafia_sessions.winning_team`), so it needs a custom resolver joining through
  `mafiaRoleTeam()`, not a two-line map entry.
- **Mahjong's `games_won` means "won the last HAND", not the match.** `winner_player_id` is
  reset by `processMahjongNextHand`; the match result lives in `scores`.
- **`describe_it` has no winner source** and is not in `isCompetitiveRoomGame`.
- **Only the FIRST round in a room can ever award.** `awarded_sessions` is keyed on the game
  CODE, and a rematch reuses it — so every subsequent game in the same room is a silent no-op.
  This contradicts the brief's "award at end of round/match" premise.

## 2h. THE ATTRIBUTION RACE — decide this before building anything

The award pass runs when the **client** posts attribution, after the finished screen. But:

- Ludo's play-again **DELETEs `ludo_sessions` and `ludo_player_state`** (`ludo.ts:635`).
- Chess's rematch **wipes `pgn` to `''`** (`chess.ts:175`).
- Play-again also clears Yahtzee and Scrabble session data
  (`api/games/[code]/play-again/route.ts:145,159`).

So the evidence a trophy is derived from can be **gone before attribution lands**. This already
costs legitimately-earned wins today for a slow client, and it makes every bucket-A derivation
unreliable.

**Fix: derive facts at FINISH, not at attribution.** Compute the per-player integer facts inside
the game's own finish path and write them somewhere durable (a `game_facts(game_id, player_id,
facts jsonb)` table that play-again does not touch). The award pass then reads facts, never live
session state. This also removes the need to keep session rows alive purely for trophies.

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

## 4b. Trophies that describe rules the games do not have

Rewrite or cut these **before** anyone builds them. An unearnable trophy is indistinguishable
from a typo.

| Game | # | Problem |
|---|---|---|
| Monopoly | 15 | 4 houses — engine caps at 3 then hotel |
| Monopoly | 25, 26 | Naija / London editions do not exist; the only board IS London |
| Yahtzee | 20 | 100-point Yahtzee bonus not implemented |
| Yahtzee | 22 | Joker rule not implemented — the code explicitly does the opposite |
| Ludo | 13, 22 | "Exact" entry — overshoot is already illegal, so these are always true |
| Ludo | 9, 15 | Blockade/roadblock — no path-blocking exists; a stack only grants immunity |
| Ludo | 24 | Says "three doubles"; the engine forfeits on three double-SIXES only |
| Ludo | 4 | Safe squares are an EMPTY set in the `traditional` variant |
| Ludo | 11, 16 | Need per-victim / per-piece history that nothing records |
| UNO | 9 | "Caught Out" — no catch action exists, the penalty is automatic |
| UNO | 15 | "Four colours in one turn" impossible in the default multi-play mode |
| UNO | 17 / C8 15, 23 | "Win holding X" — the winner's hand is empty by definition |
| UNO | 13 | Stacking is OFF by default |
| C8 | 8, 24, 28 | Jokers are OFF by default |
| Chess | 26 | Title says smothered mate, condition says knight mate — different trophies |
| Chess | 29 | "Sacrificed" is not decidable without an engine eval or intent model |
| Ayo | — | Brief says "12 houses + 2 stores"; there are no stores |
| Ayo | 15, 25 | 30s is a whole-game bank, not per-move; no per-move clock exists |
| Ayo | 27 | 44-of-48 unreachable once traditional match rounds shrink the rows |
| Ayo | 4,5,11,19,26 | Oware-only mechanics — silently unearnable in the DEFAULT traditional variant |
| Checkers | header | "All three share an engine" is wrong — American is a separate engine and table |
| Checkers | 26, 27 | Labelled International-only; the mechanics are equally live in Nigeria |
| Checkers | 30 | Cross-variant track — the DSL cannot sum counters across game types |

Confirmed **correct** despite looking wrong: Checkers #29 "seeds" is the real Nigerian-draughts
term for pieces, used in the product's own room copy.

## 4c. Vocabulary gaps in the engine itself

- `games_lost` does not exist (Ayo #10 "Ọpẹ" needs it). Derivable at finish.
- No turn/ply counter in Whot, UNO, Crazy Eights, Ayo or Checkers. One counter unblocks every
  "win in N turns" trophy AND the brief's own anti-farm minimum-length rule.
- `player_distinct` has only a GLOBAL `opponents` key, and the DSL's `distinct` node takes no
  `gameType`. The brief's anti-farm rule 3 (5 distinct opponents per Champion track) needs both
  a new key shape and a DSL change.
- No way to sum a counter across game types (Checkers' cross-variant track).

## 5. Sequence

1. Finish the feasibility audit (in progress) — get the A/B/C split per game.
2. Cut bucket C, and re-specify anything ambiguous.
3. Build the in-play counter mechanism once, and pilot it on **one** game end to end.
4. Register that game's counters in the vocabulary; author its trophies.
5. Repeat per game — by then it is mechanical.

Whot is the right pilot: it is the game the request started from, it is the template UNO and
Crazy Eights are modelled on, and its counters (`cards_drawn`, `penalties_taken`, peak hand size)
are the ones the brief says recur across every card game.
