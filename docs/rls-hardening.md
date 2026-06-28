# RLS Hardening — Server-Authoritative Writes (Option A)

> Status: **In progress.** Phase 0 (foundations) landed. This is the living tracker for
> closing the permissive-RLS issue CodeRabbit flagged on PR #132.

## The problem

Every game-state table uses `FOR ALL USING (true) WITH CHECK (true)` (mostly granted to
`anon`). The Supabase **anon key ships in the public JS bundle**, so anyone can read,
update, or delete any row in any game directly — bypassing the API routes. On the write
side this means **cheating / griefing**: rewriting turns, token positions, and winners, or
deleting other people's game state.

Compounding it: the secret tokens we'd use to authorize are themselves exposed in open
reads today — `host_token` is in `GAME_SELECT` and `resume_token` is in `PLAYER_SELECT`
(`src/lib/supabase-selects.ts`). So token-based authz is meaningless until those columns
are hidden from anon (Phase 3).

## Hard constraints (must not regress)

1. **No auth anywhere.** Play is fully anonymous. Ownership is purely secret-token based
   (`games.host_token`, `players.resume_token`, `rooms.creator_token`,
   `room_members.member_code`). The design uses `auth.uid()` nowhere.
2. **Cross-device resume must keep working.** A player can move a game to another device
   and keep playing by carrying their `resume_token` (URL `?player=` or entered player
   code → `/api/players/resume` → `localStorage['kmk_player_<code>']`). Authorization is by
   the **token in the request**, never by device/cookie/IP — so any device with the correct
   token is authorized. This *strengthens* security (today moves are authorized by a bare,
   public `playerId`) while preserving cross-device play.

## Threat model (scope)

In scope: **write-side cheating/griefing of game state.** Out of scope (for now):
read-side data privacy — reads and realtime stay public, so the anon key can still *read*
any game. This is an accepted, documented decision; revisit only if the threat model
expands to privacy (which would be the point to consider anonymous Supabase auth).

## Design (Option A)

- **Anon key → SELECT only.** Reads stay open (realtime needs them); INSERT/UPDATE/DELETE
  on game-state tables are denied to anon.
- **All writes go through server routes using the service role**, which bypasses RLS.
- **The secret token is the authorization boundary.** Each write route validates:
  - host actions → `host_token` via `assertHost*` (`src/lib/game-admin.ts`)
  - player actions → `resume_token` via `assertPlayer` (`src/lib/game-admin.ts`), which
    resolves the player **server-side from the token** and ignores any client-supplied
    `playerId` (a public, forgeable value).
- **Tokens are never exposed to anon.** Removed from client SELECT lists and revoked at the
  DB (column privileges); only vended by server endpoints (create-game, join,
  `/api/players/resume`).

## Phases

- [x] **Phase 0 — Foundations**
  - [x] `getSupabaseAdmin()` fail-loud: no silent anon fallback in production
    (`src/lib/supabase-admin.ts`). Dev keeps an anon fallback with a warning.
  - [x] `assertPlayer(supabase, gameCode, resumeToken)` authz helper added
    (`src/lib/game-admin.ts`), mirroring the existing `assertHost*` helpers.
  - [x] This tracking doc / write inventory.
- [x] **Phase 1 — Authorization boundary in routes** (per-game tables): every game's write
  routes use the service-role client and enforce `assertHost`/`assertPlayer`; player schemas
  carry `resumeToken`; the actor `playerId` is derived from the token server-side.
- [x] **Phase 2 — Writes server-side** (per-game tables): confirmed all game-state-table
  writes already flow through API routes (no direct browser writes were found for the locked
  tables); shared writers in start/play-again/players/promote switched to the service role.
- [x] **Phase 4 — RLS lockdown** for all 16 game-state table groups (migrations 0106–0121):
  `FOR ALL USING(true)` replaced with SELECT-only `_read` policies; rollbacks drafted in-file.
- [x] **Phase 3 — Hide tokens from reads** (migration 0122, approach A = column-level grants):
  `REVOKE SELECT` on `games.host_token` / `players.resume_token` from anon+authenticated, re-grant
  every other column (built dynamically from `information_schema`). The service role bypasses the
  grant, so server auth reads keep working. Tokens removed from `GAME_SELECT`/`PLAYER_SELECT`
  (+ new `HOST_GAME_SELECT` for the host page); ~25 client `select('*')` on games/players rewritten
  to curated lists (Postgres rejects `*` on an ungranted column); ~20 server token-read routes and
  all anon `insert/update().select()` that returned a token switched to the service role; client
  token-readers (`useHostPlayerSession`, `player-resume`) now rely on the local session; host page
  gates via a new `/api/games/[code]/verify-host` endpoint instead of reading `host_token`.
  `Game.host_token` made optional on the shared type.
  ⚠️ **Realtime must be verified on the live DB** — approach A relies on Supabase realtime
  excluding ungranted columns from anon `postgres_changes` payloads. If a test shows the tokens
  still arrive over realtime, escalate those two columns to separate secret tables.
- [ ] **Core tables** still permissive: `games`, `players`, `participants`, `rounds`, `votes`,
  `confessions`, `player_questions`, `wst_quote_pool`, `anime_quote_pool`,
  `hot_seat_submissions`, `game_snapshots`, and `rooms`/`room_*`. These back the original
  voting games (SMK/WYR/MLT/who-said-this/hot-seat/etc.) and shared infra — not yet locked.

### Games hardened (Phase 1+2+4 done): migrations 0106–0121
snake-and-ladder, tic-tac-toe, yahtzee, whot, ludo, chess, monopoly, scrabble, trivia,
two-truths, sudoku, word-hunt, codewords, describe-it, bingo, npat/i-call-on. Snake & Ladder
verified live (happy path, cross-device resume, anon-write rejected). The other 15 are
typecheck/lint/audit-clean but **not yet verified live** — apply 0107–0121 and smoke-test.

## Branch & scope

All of this work lands on a **single branch** (`feat/rls-hardening`) and covers **all games**,
not just one. The per-game "slices" below are units of work and **verification**, not separate
branches or PRs — they all accumulate on the one branch.

## Staging rule (do not violate)

Per game: (a) move writes server-side + add token authz, **then** (b) add that game's RLS
lockdown migration. **Never add a table's lockdown before its writes are server-side** — order
the commits so the branch is always internally consistent. **Snake & Ladder goes first** as
the smallest end-to-end proof of the pattern, then the rest follow on the same branch.

## Per-game slice checklist (template)

For each game:
- [ ] All browser writes for the game moved into API routes
- [ ] Routes use the service-role client (`getSupabaseAdmin`)
- [ ] Host routes enforce `assertHost*`; player routes enforce `assertPlayer` (token, not playerId)
- [ ] `resumeToken` added to the game's player-action schemas
- [ ] Happy path verified with RLS locked (create → join → full turn loop → finish)
- [ ] **Cross-device resume verified** (join on A, move on B via token)
- [ ] Negative tests: anon write rejected; anon `select host_token`/`resume_token` rejected; move with wrong/absent token → 403
- [ ] Lockdown migration + restore-permissive rollback migration committed

---

## Progress log

### Snake & Ladder (canary) — code-complete, ⏳ live verification pending

Proves the full pattern end-to-end. Snake & Ladder was a clean first case because all
its writes already lived in `src/lib/snake-and-ladder.ts` functions that take a
`SupabaseClient` param (Phase 2 was effectively already done) — every writer just needed
the service-role client.

Changed:
- `snakeLadderActionSchema`: `playerId` → `resumeToken` (`src/lib/validation.ts`).
- `/api/snake-and-ladder/roll`: service role + `assertPlayer` (token → authoritative
  `player.id`); no longer trusts a client `playerId`.
- `/api/snake-and-ladder/expire-turn`: service role; system/timer, deadline-guarded.
- `/api/games/[code]/start`, `/play-again`, `/api/players` (DELETE): the snake-specific
  lib calls now receive `getSupabaseAdmin()` (surgical — other games' writes on these
  shared routes are untouched until their own slice).
- Clients send `resumeToken` instead of `playerId` (`SnakeLadderPlayerView`,
  `SnakeLadderHostView`); host-as-player works because the host joins via `/api/players`
  and gets its own `resume_token`.
- `0106_rls_lockdown_snake_and_ladder.sql`: SELECT-only policies on
  `snake_ladder_sessions` / `snake_ladder_player_state`; rollback drafted in-file.

Verified locally: `pnpm typecheck` clean; eslint 0 errors (pre-existing warnings only).

**Still needs live verification against Supabase** (cannot run from this environment):
- Apply `0106`; play create → join → roll loop → finish with RLS locked.
- Cross-device resume: join on A, roll on B via token.
- Negative: anon-key `update`/`delete` on snake tables rejected; anon `select` + realtime
  still work; roll with wrong/absent `resumeToken` → 403.

> **Shared-route insight (affects sequencing for the rest):** writes to a game's tables are
> spread across per-game routes *and* shared routes (`start`, `play-again`, `players`). The
> lib-takes-a-client pattern lets us hand just the service-role client to a game's calls
> inside those shared routes, keeping each slice isolated. Games whose write logic is inline
> in client components (not lib functions taking a client) will need real Phase-2 work first.

### Players DELETE — follow-up noted

The non-host self-removal path (`/api/players` DELETE, else-branch) authorizes the *session*
but doesn't verify the target `playerId` belongs to the caller — a player could remove
another. Pre-existing; fix in the players-route slice (add `assertPlayer` and require the
removed id to match, unless host).

---

## Inventory (generated — refine per slice)

### Write routes (direct `.insert/.update/.delete/.upsert` in the route)

`client=anon` must switch to the service role in Phase 1. `playerId-only(NO-AUTHZ)` is the
core hole: authorize by `resume_token` instead.

| Route | Client | Authz today | Writes |
|---|---|---|---|
| ai-questions | anon | HOST | games |
| anime-quotes, anime-quotes/reroll | anon | HOST | anime_quote_pool, games |
| anonymous-messages | anon | HOST | anonymous_messages, anonymous_room_bans, games, players |
| anonymous-room/bans | ADMIN | HOST | anonymous_room_bans, games, players |
| bingo/call, bingo/settings | anon | HOST | bingo_called_numbers, games |
| **bingo/claim, bingo/mark** | anon | **playerId-only** | bingo_*, games, players |
| **codewords/chat, clue, end-turn, guess, role** | anon | **playerId-only** | codewords_*, games, players |
| codewords/expire-turn | anon | NONE (system) | codewords_boards, games |
| codewords/host-role, timers | anon | HOST | codewords_*, games, players |
| confessions | anon | NONE | confessions |
| describe-it/balance, settings | anon | HOST | describe_it_players, games |
| **describe-it/team** | anon | **playerId-only** | describe_it_players, games, players |
| feedback | anon | NONE (public insert) | app_feedback |
| games/[code]/end-round, finish-game, lobby-pool, lobby-settings, next-round, play-again, start, [code], games/ | anon | HOST | games + many |
| **hot-seat** | anon | **playerId-only** | games, hot_seat_submissions, players, rounds |
| library, admin/* | ADMIN | NONE (admin-gated) | question_packs, product_updates, game_player_limits |
| **npat/dispute, draft, letter, mark, submit** | anon | **playerId-only** | npat_*, games, players, rounds |
| participants | anon | HOST | participants, players |
| **photos, player-participants, player-questions, players/promote, players/ready, quote** | anon | **playerId-only** | various |
| players | anon | HOST + RESUME | games, participants, players |
| rooms/* | anon | NONE | rooms, room_* , games |
| tournaments/* | anon | HOST (most) / NONE (players) | tournaments, tournament_* |
| **trivia/answer, two-truths/guess, two-truths/statements, votes, word-hunt/submit** | anon | **playerId-only** | various |
| wst-quotes | anon | HOST | games, participants, players, wst_quote_pool |

### Move/expire routes (writes happen in the game-logic lib they call)

These are the turn-based action routes. `playerId-only` = needs `resume_token` authz.
`NONE (system)` = expire/tick routes with no actor (timer-driven) — these still need to be
service-role and should be guarded (e.g. only act when the turn deadline has actually
passed) rather than token-authorized.

- **playerId-only (need RESUME authz):** chess/move, chess/resign, describe-it/clue, guess,
  skip, ludo/move, ludo/roll, monopoly/auction, build, buy, forfeit, jail, mortgage, rent,
  roll, settle-debt, trade, npat/caller-approve, scrabble/exchange, pass, play,
  **snake-and-ladder/roll**, tic-tac-toe/move, whot/choose, draw, play, yahtzee/hold, roll, score
- **HOST:** codewords/randomize-teams, describe-it/advance, extend-monopoly-time, extend-scrabble-time
- **NONE (system / timer):** bingo/sync, chess/expire-turn, describe-it/expire-turn, tick,
  expire-monopoly/scrabble/whot/word-hunt, ludo/expire-turn, monopoly/expire-turn,
  scrabble/expire-turn, **snake-and-ladder/expire-turn**, tic-tac-toe/expire-turn,
  whot/expire-turn, yahtzee/expire-turn

### Browser write files (Phase 2 — move server-side)

Game-logic libs (the real targets), highest write-count first:

`monopoly.ts` (30), `describe-it.ts` (22), `yahtzee.ts` (17), `whot.ts` (16), `scrabble.ts`
(15), `snake-and-ladder.ts` (13), `ludo.ts` (12), `codewords.ts` (9), `npat-advance.ts` (7),
`anime-quotes.ts` (7), `chess.ts` (6), `trivia-advance.ts` (5), `tic-tac-toe.ts` (5),
`npat.ts` (5), `anonymous-messages.ts` (5), `tournament-scoring.ts` (4),
`two-truths-advance.ts` (3), `room-points.ts` (3), `host-pool-update.ts` (3),
`game-admin.ts` (3), `bingo.ts` (3), plus singles in `word-hunt*.ts`, `viewers.ts`,
`two-truths.ts`, `sudoku.ts`, `trivia.ts`, `player-resume.ts`, `game-finish.ts`,
`admin-end-game.ts`, `achievements.ts`, `host/[code]/page.tsx`,
`hooks/mutations/{useJoinGame,useSubmitPlayerQuestion}.ts`,
`word-hunt/WordHuntPlayerView.tsx`, `library/submit/page.tsx`.

> ⚠️ Counts come from a regex over `.insert/.update/.delete/.upsert(` and include a few
> **non-Supabase** false positives (`ReactionBar.tsx`, `useAnonymousReactions.ts`,
> `library/submit/page.tsx` use `Set`/`Map.delete`). Audit each file in its slice.

### Tables with permissive `FOR ALL USING(true)` (Phase 4 lockdown targets — ~50)

Core: games, participants, players, rounds, votes, confessions, player_questions,
wst_quote_pool, anime_quote_pool, hot_seat_submissions, game_snapshots. Rooms: rooms,
room_members, room_games, room_messages. Per-game: monopoly_boards, monopoly_player_state,
scrabble_sessions, scrabble_player_state, chess_sessions, ludo_sessions, ludo_player_state,
whot_sessions, whot_player_hands, bingo_cards, bingo_called_numbers, bingo_claims,
codewords_boards, codewords_player_roles, codewords_guesses, codewords_messages,
sudoku_submissions, yahtzee_sessions, yahtzee_player_scores, trivia_answers,
describe_it_sessions, describe_it_players, describe_it_words, describe_it_guesses,
npat_answers, npat_marks, ttl_statements, ttl_guesses, word_hunt_submissions,
tic_tac_toe_sessions, snake_ladder_sessions, snake_ladder_player_state, tournaments,
tournament_players, tournament_games, anonymous_messages. (Already-narrow, leave/own pass:
product_updates, game_player_limits, question_packs, app_feedback, anonymous_room_bans,
sudoku_solutions.)

---

# Phase 5 — Core & shared tables

> Status: **IMPLEMENTED** on `feat/rls-core-tables` (pending live verification + merge). Locks
> the **shared/core tables** that back the **14 remaining game types** with no dedicated tables
> — the 9 voting games (smash_marry_kill, red_flag_green_flag, smash_or_pass, parent_approval,
> would_you_rather, never_have_i_ever, pick_a_number, this_or_that, most_likely_to), plus
> who_said_this, hot_seat, custom, anonymous_messages, secret_message — and the rooms feature.
>
> **Done:** votes + all player-submission routes (player-questions, player-participants, photos,
> hot-seat, quote, confessions [gated by resume_token], wst-quotes, players/promote,
> players/ready) authorize by `resume_token`; the service-role sweep moved every core-table
> writer server-side (incl. fixing two stray client writers: sudoku end-game, host anime-quote
> removal); `0124` locks the 11 core gameplay tables SELECT-only; `0125` locks the 4 rooms
> tables SELECT-only + revokes anon read of `rooms.creator_token` / `room_members.member_code`.
>
> ⚠️ **Before merge/deploy:** apply migrations `0124` + `0125` together with this code; verify
> realtime doesn't leak `creator_token`/`member_code` (same check as Phase 3); smoke-test a
> voting game, who-said-this, hot-seat, custom, and a rooms session (create → join → play →
> finish → play-again). The Phase-3 column-grant footgun now also applies to rooms/room_members.
>
> _(Original plan retained below for reference.)_

## Why this is the largest / most delicate phase

These tables are written by the **hot paths every game uses** (create-game, join, start,
finish, next-round, play-again), so locking them touches **all 30 games**, not just the 14.
Much of the service-role groundwork already landed incrementally in earlier phases; what's
left is finishing the sweep, adding **player/room ownership authz** to the player-action
routes, and the lockdown migrations.

## Tables in scope

**Core gameplay:** `games`, `players`, `participants`, `rounds`, `votes`, `confessions`,
`player_questions`, `wst_quote_pool`, `anime_quote_pool`, `hot_seat_submissions`,
`game_snapshots`.
**Rooms (distinct identity model):** `rooms`, `room_members`, `room_games`, `room_messages`.

## Identity / authz model (no auth, token-based — unchanged)

- **Host actions** → `games.host_token` (`assertHost*`). Already widely enforced.
- **Player actions** → `players.resume_token` (`assertPlayer`, derive `auth.player.id`).
- **Room member actions** → `room_members.member_code`. **Room ownership** → `rooms.creator_token`.
  (Rooms do NOT use resume_token — treat as a separate slice.)

## Write surface (from audit) — what each route needs

| Route | Writes | Today | Needs |
|---|---|---|---|
| `votes` | votes | **playerId only** | `resumeToken` + `assertPlayer` (THE voting-games action) |
| `player-questions` | player_questions | playerId only | `resumeToken` + assertPlayer |
| `player-participants` | participants | playerId only | `resumeToken` + assertPlayer |
| `photos` | participants, players | playerId only | `resumeToken` + assertPlayer |
| `confessions` | confessions | **no authz** (anonymous) | gate with `resume_token` + assertPlayer (player-facing anonymity preserved; stops anon spam) |
| `hot-seat` | hot_seat_submissions | playerId only | `resumeToken` + assertPlayer |
| `wst-quotes` | wst_quote_pool | host + playerId | host path keeps hostToken; player submissions get `resumeToken` |
| `quote` | who-said-this lobby submission | playerId only | `resumeToken` + assertPlayer |
| `anime-quotes`(+reroll) | anime_quote_pool | host (now admin) | already host-authed; service-role write |
| `players/promote` | players | playerId only | host or self ownership check |
| `participants` | participants, players | host | host-authed (service role) |
| `games` (POST create) | games, participants | anon insert (host_token generated) | service-role insert when games is locked |
| `rooms` (POST create) | rooms | none (creator_token generated) | service-role insert; creator_token is the owner credential |
| `rooms/[code]` | rooms | member_code (partial) | creator_token for room edits; service role |
| `rooms/[code]/join` | room_members | member_code | service-role insert (returns member_code); keep member_code identity |
| `rooms/[code]/messages` | room_messages | member_code-checked | `member_code` author check (mostly present); service role |
| `rooms/[code]/members/[memberId]` | room_members | none | member/creator ownership check |
| shared: `start`, `play-again`, `finish-game`, `next-round` | rounds, votes, confessions, etc. | mostly admin already (Phases 1–3) | finish the sweep |

## Slices (sequenced)

1. **Service-role sweep (mechanical, safe, no behavior change).** Convert every remaining
   *anon-client* write of a core table to the service role (`getSupabaseAdmin()`), same pattern
   as earlier phases. Targets: `votes`, `confessions`, `player-questions`, `player-participants`,
   `photos`, `quote`, `hot-seat`, `wst-quotes`, `games` (create), `participants`, plus any
   stragglers in `start`/`play-again`/`next-round`. Also fix anon `insert/update().select()`
   that return a row (RETURNING needs privileges once locked).
2. **Player-action authz (`resume_token`).** Add `resumeToken` to the player-action schemas
   above; in each route call `assertPlayer` and act on `auth.player.id` (never trust client
   `playerId`); update the client callers to send `resumeToken` (they already hold it in the
   player session). This is the anti-griefing core (e.g. stop anyone from casting/altering
   votes or submitting questions as another player).
3. **Rooms slice (`member_code` / `creator_token`).** Separate, because identity differs.
   Route writes through the service role; enforce `member_code` for member actions (join,
   messages, leave) and `creator_token` for room edits/locks; then lock `room_*`. Hide
   `creator_token` / `member_code` from anon reads if they're currently exposed (audit
   `ROOM_*` selects, mirror the Phase-3 token-hiding approach).
4. **Lockdown migrations (last).** Per the established pattern: replace `FOR ALL USING(true)`
   with SELECT-only `_read` policies on the core tables (realtime reads stay open), with
   drafted rollbacks. Ship a table's lockdown **only after** all its writers are server-side.
   Likely split: one migration for core gameplay tables, one for rooms.

## Risks / gotchas

- **Blast radius:** create/join/lobby/start/finish are shared by all 30 games — a regression
  here breaks everything. Stage carefully; verify a sample across game families.
- **Anonymous inserts:** `confessions` (and possibly some lobby submissions) are intentionally
  anonymous — locking them needs a product decision (gate via server with a player token, or
  keep an explicit anon INSERT policy).
- **Open game discovery / joining must keep working:** SELECT on `games`/`players`/`rooms`
  (public lobby, join-by-code, public room list) stays open via `_read` policies.
- **Column-grant footgun (from Phase 3):** `games`/`players` are already column-grant-based;
  any new column added during this phase needs an anon SELECT grant (see migration 0123).
- **Realtime:** `games`, `players`, `rounds`, `votes`, `rooms`, `room_*` are in the realtime
  publication — keep reads open; confirm no secret (`creator_token`/`member_code`) leaks over
  realtime (same check as Phase 3).

## Testing

- Per game-family smoke test with the core tables locked: create → join → play a round →
  vote/submit → finish → play-again, for at least one voting game, who-said-this, hot-seat,
  custom, and a rooms session.
- Negative (anon key): `insert/update/delete` on each locked core table rejected; `select` +
  realtime still work; voting/submitting with a wrong/absent `resumeToken` → 403; room actions
  with a wrong `member_code` → 403.
- `pnpm typecheck` + `eslint` per slice.

## Decisions (resolved)

1. **Confessions** → **gate with `resume_token`** (route through the service role + `assertPlayer`).
   Player-facing anonymity is unchanged (other players still never see the author); the token
   only proves the poster is a real player in the game, which stops anon-key spam. No public
   anon INSERT policy.
2. **Rooms** → **`member_code` + `creator_token`** model: member actions (join/message/leave)
   gated by `member_code`; room edits/locks/kicks gated by `creator_token`; hide both from anon
   reads (mirror Phase 3). Rooms is its own slice (Slice 3).
3. **Game / room creation** → **keep open, just move the write server-side** (service role) so it
   works under the lockdown. No new friction. Rate limiting / captcha is noted as a **future
   follow-up**, not part of this phase.
