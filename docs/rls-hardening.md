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
   token is authorized. This _strengthens_ security (today moves are authorized by a bare,
   public `playerId`) while preserving cross-device play.

## Threat model (scope)

In scope: **write-side cheating/griefing of game state.** Out of scope (for now):
read-side data privacy — reads and realtime stay public, so the anon key can still _read_
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
- [x] **Core tables** locked: `games`, `players`, `participants`, `rounds`, `votes`,
      `confessions`, `player_questions`, `wst_quote_pool`, `anime_quote_pool`,
      `hot_seat_submissions`, `game_snapshots`, and `rooms`/`room_*`. These back the original
      voting games (SMK/WYR/MLT/who-said-this/hot-seat/etc.) and shared infra. Locked by
      `20260628132823_rls_lockdown_core_gameplay.sql` (core gameplay tables) and
      `0126_rls_lockdown_rooms.sql` (rooms/`room_*`, plus hiding `creator_token`/`member_code`
      from anon reads). See Phase 5 below (marked **IMPLEMENTED**).

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

## Phase 7 — hand redaction (per-player secret state) — ⏳ IN PROGRESS

Opened by the Aug 2026 audit follow-up. **The read-side threat model above says reads stay
public; these tables are the documented exception**, because the row IS the secret.

`whot_player_hands`, `uno_player_hands`, `crazy_eights_player_hands` and `bingo_cards` hold one
row per player and are readable with the publishable anon key. Confirmed live on dev:
`select player_id, cards from whot_player_hands` returned every hand in every game (54 rows).
The clients render other players' cards face-down — presentation, not a control.

### Why this is NOT a column revoke

Two things make the naive fix worse than the leak, and both are why this is its own phase:

1. Realtime payloads for these tables are applied **directly** to state (`applyHandRow`), not
   used as a reload trigger — a payload without `cards` overwrites a good hand with an empty one.
2. The views derive `myHand = row?.cards ?? []` and then `isOut = !!row && myHand.length === 0`,
   so a redacted row does not merely blank the hand — **it makes the client believe the player
   is out of the game**. Mobile's finished screen additionally sums every player's cards for the
   standings.

So the count must survive redaction. `card_count` is public information in all of these games
and is what the table UI and the out/finished checks actually consume.

### The pattern (established by the Whot canary)

- `src/lib/hand-redaction.ts` — `redactHands()` returns the viewer's own cards in full and every
  other hand as `cards: null` plus `card_count`. `null` rather than `[]` deliberately: an empty
  array is meaningful state, and conflating "hidden" with "empty" is the bug above.
- `POST /api/<game>/hands` — resolves the viewer from their **resume token** via the service
  role, never a client-supplied `playerId`. POST so the token stays out of query strings.
  Reveals full hands once `games.status = 'finished'`, which keeps `/history/[code]` and the
  mobile finished standings working.
- Every browser reader switches to the route; realtime handlers must never let a payload shrink
  the local player's own hand (re-fetch instead) and must carry a known `card_count` forward.

### Per-game status

| Game         | Table                       | Server route         | Web readers                     | Mobile reader | Playtested      | Migration  |
| ------------ | --------------------------- | -------------------- | ------------------------------- | ------------- | --------------- | ---------- |
| Whot         | `whot_player_hands`         | ✅ `/api/whot/hands` | ✅ player, host, history        | ✅            | ❌ **required** | ⏳ blocked |
| UNO          | `uno_player_hands`          | ✅ `/api/uno/hands`  | ✅ player, host, history        | ✅            | ❌ **required** | ⏳ blocked |
| Crazy Eights | `crazy_eights_player_hands` | ✅ `/api/crazy-eights/hands` | ✅ player, host, history        | ✅            | ❌ **required** | ⏳ blocked (pile counts ready; pile revoke pending a mobile release — see below) |
| Bingo        | `bingo_cards`               | ✅ `/api/bingo/card` | ✅ player, host (own seat only) | ✅            | ❌ **required** | ⏳ blocked |

### Deliberate: the hands routes are unauthenticated reads

`POST /api/whot/hands` and `POST /api/crazy-eights/hands` accept a request with no token at all.
Anyone who knows a game code gets every hand's `card_count`, and full hands once the game is
`finished`. That is the intended contract, not an oversight:

- card counts are public information at the table (you can see how many cards an opponent holds),
  and the spectator/host views need them without holding any player's secret;
- a finished game's hands are already on `/history/[code]` for everyone;
- the secret that actually gates anything is the resume token, and it is the only thing that
  unredacts a live hand.

Rate limiting (`RATE_LIMITS.handsFetch`) is what bounds abuse. If this ever needs tightening, the
change belongs to every card game at once, not one route.

### Crazy Eights also had to hide the deck

Redacting hands alone is not enough where the ordered deck is public: with `draw_pile` +
`discard_pile` and your own hand, a 2-player opponent's hand is a subtraction, and at any table
size you know every future draw in order. The fix is split in two, per "Split the migration"
above: `20260815115000_crazy8_pile_counts.sql` **adds** the generated `draw_count` /
`discard_count` — all the clients ever used (`isDrawPileDepleted`, the play surface's draw count)
— and is safe against every client version, while `20260815120000_sec_crazy8_hide_piles.sql`
**revokes** the two piles and must wait for a compatible mobile build. The revoke raises rather
than proceeds if the counts are absent. **Whot and UNO are now closed too** (UNO `20261003120000`, Whot `20261120115000` +
`20261120120000`) — every card game's deck is now hidden from the anon key.

### Redacted state must never be read as real state (the recurring bug)

Three separate places on the Crazy Eights branch turned "I can't see this" into a game fact:
`isOut` from a hidden hand, opponent counts frozen because a realtime payload with no `cards` was
reported as absorbed (so `useGameTableSync` skipped the reconciliation reload), and
`crazyEightsPlacementOrder` scoring every hidden hand at 0 cards / 0 points, which ranks a whole
table as "out of cards". The rule: a redacted field resolves to `null`/unknown and is rendered as
unknown — never 0, never empty, never "out". `card_count` and `finish_order` are the only
substitutes, because they survive redaction / are public session state.

**Per the staging rule below, the migration revoking `cards` from anon comes LAST — one
migration covering all four, only once every reader for every one of those tables is on a
route.** Shipping it earlier breaks live games in the two ways described above.

Playtest per game before its row is ticked: deal → several plays → a player goes out → finish,
on web **and** mobile, watching that nobody is wrongly shown as out and opponent counts track.

### The deck is the other half of the secret

Redacting `cards` buys very little while the session row still ships the **full ordered deck** to
the anon key. Confirmed live on dev: `uno_sessions.draw_pile` returned 86 ordered cards. With two
players, `draw_pile` + `discard_pile` + your own hand subtract from the known deck to give your
opponent's exact hand; with N players you still know every future draw, in order.

Fix shape (Crazy Eights `20260815120000`, UNO `20261003120000`): add generated stored
`draw_count` / `discard_count` — jsonb columns, so `jsonb_array_length` behind a
`jsonb_typeof(...) = 'array'` guard, not `cardinality` — then revoke the two piles from
`anon`/`authenticated` and re-grant every other column. `top_card` stays public; it is a separate
column and is face-up at the table anyway. Every client reader only ever used `.length`.

Two rules this keeps tripping over, both encoded in the code:

- `isDrawPileDepleted` must return **false** when neither the count nor the array is readable.
  "I cannot see the pile" reported as "the pile is empty" flips live games into pass-turn and
  reshuffle states.
- Anon now holds **column-level** SELECT on these session tables, so a NEW column must also be
  granted (re-run the migration's do-block) or client reads of it error. Fails closed.

Whot's `whot_sessions` had the identical leak; closed by `20261120115000_whot_pile_counts.sql`
+ `20261120120000_sec_whot_hide_piles.sql`, the same additive-then-revoke split.

## Phase 8 — per-turn secret state (the word / the key card)

Same class as H2 (`codewords_boards.key`), but the secret is one column on a shared session row
rather than a whole table, so the fix IS a column revoke — the shape used for `games.host_token`
(0122) and `codewords_boards.key` (20260803170000):

1. Revoke table SELECT from anon + authenticated, re-grant every column except the secret,
   built dynamically from `information_schema` in an idempotent `do $$` block.
2. Add `POST /api/<game>/<secret>` that resolves the caller from a **secret** (resume token, or
   host token → `games.host_player_id` for a host who took a seat) and returns the secret only
   when that resolves to the entitled player. Everyone else gets a `200` with `null` — asking is
   normal traffic, so the status code must not become an oracle.
3. Every browser reader drops the column from its `*_SELECT` and refetches through the route.

Why it is safe here where Phase 7's hand tables are not: these session rows are consumed as a
**reload trigger** (`useGameTableSync` → `load()`), never applied to state, so a realtime payload
missing the column cannot corrupt anything.

**Check for shadow copies of the secret.** Both Describe It and Quick Draw kept the current word
in `used_words` as well — every write that sets `current_word` appends it — so the array's last
element _was_ the answer, and revoking `current_word` alone would have moved the leak rather than
closed it. Both columns are revoked in each game; a generated `word_seq` (`cardinality(used_words)`)
is granted in their place, because the one legitimate client use of `used_words` was "the word
changed" — a count, not the words.

### Per-game status

| Game               | Column                                                  | Route                         | Web readers     | Mobile reader | Playtested | Migration                                           |
| ------------------ | ------------------------------------------------------- | ----------------------------- | --------------- | ------------- | ---------- | --------------------------------------------------- |
| Codewords          | `codewords_boards.key`                                  | ✅ `/api/codewords/board`     | ✅              | ✅            | ✅         | ✅ 20260803170000                                   |
| Describe It        | `describe_it_sessions.current_word` + `used_words`      | ✅ `/api/describe-it/my-word` | ✅ player, host | ✅            | ✅         | ✅ 20260807110000 + 20260807115000 + 20260807130000 |
| Quick Draw (guess) | `quick_draw_guess_sessions.current_word` + `used_words` | ✅ `/api/quick-draw/my-word`  | ✅ player, host | ✅            | ✅         | ✅ 20260807140000                                   |

### Split the migration: additive first, revoke last

A redaction slice changes the schema in two ways that pull in opposite directions: the file
simultaneously **creates** the public counter new clients select and **removes** the columns old
clients select. The two directions are not equally dangerous, and the split exists because of the
asymmetry rather than because both break —

- **Database ahead of code** (42501, revoked column) breaks any client still selecting those
  columns, and has no client-side rescue by design. This is the direction that forces the wait.
- **Code ahead of database** (42703, undefined column) is _supported_: `readDescribeItSession()`
  retries once without `word_seq`, so a deploy landing before the migration degrades to a slower
  word refresh and self-heals. Supported is not the same as intended — the additive migration
  should still go first; the fallback exists so a mis-ordered deploy is a slowdown, not an outage.

Describe It is therefore three files:

| File                                           | Effect                             | Safe against                             |
| ---------------------------------------------- | ---------------------------------- | ---------------------------------------- |
| `20260807110000_sec_regrant_except.sql`        | defines the shared regrant helper  | every client version                     |
| `20260807115000_describe_it_word_seq.sql`      | **adds** `word_seq` + grants it    | every client version                     |
| `20260807130000_sec_describe_it_hide_word.sql` | **revokes** the two secret columns | only clients that stopped selecting them |

Apply 1+2 → deploy web and ship mobile → drain old installs → apply 3. Only the third file can
break a live client.

**The two skew directions are not symmetric.**

_Code ahead of the database_ (42703, undefined column) is handled in code and needs no
discipline: `readDescribeItSession()` (`src/lib/describe-it-session-read.ts`, mirrored in
`apps/mobile/lib/`) retries once without `word_seq`, so a deploy that lands before the migration
degrades to a slightly slower word refresh instead of taking out all session state. It self-heals
when the migration runs — no redeploy. Verified locally: primary select → 400/42703, fallback →
200, and 200 again after re-applying the migration.

_Database ahead of code_ (42501, revoked column) has **no** client-side rescue, deliberately — a
revoked column must keep failing loudly rather than be retried into success. It is handled only by
the ordering above, and it is mobile that forces the wait: a web deploy reverts in a minute, an
installed binary does not. Note that `expo-updates` is already a dependency and `eas.json` defines
per-profile channels, but OTA is **not** wired — `app.json` has no `updates` block or
`runtimeVersion` and nothing runs `eas update`.

**Wiring OTA does not rescue builds already installed.** `expo-updates` reads its update URL and
`runtimeVersion` from config baked into the native binary at build time, so a build produced
without them never checks for updates; `eas update:configure` affects only future builds. No valid
config has ever shipped here — `babc8f46` (2026-07-10) added a literal
`replace-with-eas-project-id` placeholder URL and `f287ac20` removed it the next day. Step 3 is
therefore a real store-release wait, or an accepted and recorded breakage window. Wire OTA anyway
so the _next_ revoke is hot-fixable, but do not plan this one around it.

### A failed read is not game state

Both `useDescribeItWord` hooks store a fetch result **only on success**. `null` from
`/api/describe-it/my-word` is real state ("you are not the describer"); a 429, a 500 or an offline
blip is not, and recording one under the current refetch key used to satisfy the key check and pin
the describer's panel to `…` for the whole turn — unrecoverable, since individual mode has no
skip. Failures now retry with backoff (500ms → 4s) and successes re-poll every 5s, which also
makes `word_seq` an optimisation rather than a correctness requirement. Only the describer polls,
so the cost is ~12 calls/min per game against `RATE_LIMITS.handsFetch` (1200 / 5 min).

Describe It playtest focus: the word rotates on every correct guess **and** every skip without
`turn_index` changing, so the refetch is keyed on `word_seq`. Watch that the describer's word
changes the instant a guess lands, on a skip, and at a turn/describer change — on web, mobile,
and as a host-player.

Playtested 2026-08-13 against a fully-migrated local database: exactly one player (the describer)
receives the word and everyone else gets a `200` with `null`; the word rotates on both a correct
guess and a skip with `word_seq` advancing; `current_word` and `used_words` are both refused
(42501) to the publishable anon key, confirmed from a real browser session as a guesser.

Quick Draw playtest focus: the word rotates on every correct guess **and** every skip without
`turn_index` changing, so the refetch is keyed on `word_seq`. Watch that the drawer's prompt
changes the instant a guess lands, on a skip, and at a turn/drawer change — team and individual
mode, on web, mobile, and as a host-player — and that the canvas clears with it.

Quick Draw "lie" mode (Drawful) is a separate flow: each drawer's private prompt lives in
`quick_draw_assignments.prompt`, which is not covered here.

---

## Phase 9 — Two Truths & a Lie answer redaction — ⏳ SHIPPED, AWAITING PLAYTEST

Same class as Phase 7 (the row *is* the secret), but it did not need the redaction plumbing —
just a hidden table plus a reveal write-back. Migration:
`20260807120000_sec_ttl_hide_lie.sql`.

Two independent leaks, both closed:

1. `rounds.ttl_metadata` was `{statements, lie_index}` and `ttl_metadata` is in the
   anon-readable `ROUND_SELECT`. All rounds are created up front (one per submitter) by
   `buildTtlRoundRows`, so the anon key could read the lie for **every** round — including the
   one being guessed — from the moment the game started.
2. `ttl_statements.lie_index` was anon-readable, handing over every player's lie directly.

The fix follows `0103_sudoku_hide_solution.sql`: the lie moves to `ttl_round_lies`
(RLS on, **zero** policies — every write is service-role, so anon needs no access at all), and
`/api/two-truths/guess` scores against that table, failing closed if the row is missing.

**No reveal route was needed.** `endActiveRound` (lib/two-truths-advance.ts) sets a round
`status:'finished'` — that IS the reveal moment the UI already renders
(`showLie = screen === 'revealed' || 'finished'`). It now folds the lie back into
`ttl_metadata` in the *same* update, so there is no window where the answer is readable early,
and none where the round reads as revealed with nothing to show. `parseTtlMetadata` therefore
tolerates a missing `lie_index` (`number | null`) instead of rejecting the whole metadata,
which would have blanked the board mid-round.

`ttl_statements.lie_index` is column-revoked from anon/authenticated; the caller's own row is
served by `POST /api/two-truths/my-statement` (resume-token gated, same shape as
`/api/whot/hands`). The bulk `ttl_statements` read stays — it is only the roster.

A third path to the same answer was closed by `20260815130000_sec_ttl_hide_guesses.sql`:
`ttl_guesses` is anon-readable and carried `guessed_index` / `is_correct` / `points`, and a
round only ends once **every** guesser has answered — so players 2..n could read the lie off
player 1's row mid-round. Those three columns are column-revoked; the surviving columns
(`id, game_id, round_id, player_id, guessed_at`) are live progress only ("who has guessed"),
which the lock-in UI and the realtime subscription need. Results are folded into
`ttl_metadata.guesses` at reveal; the caller's own in-flight row comes from
`POST /api/two-truths/my-guesses` (resume-token gated).

### ✅ Realtime honours column-level grants — measured on a LOCAL Supabase (2026-08-16)

The open question from Phase 3 ("a column-level REVOKE only constrains PostgREST — does
Realtime filter the same columns?") is answered **yes**, measured rather than reasoned — but read
the scope before relying on it. This was measured against a LOCAL Supabase stack, not a hosted
project. An earlier version of this heading said "VERIFIED on a live DB", which overstated it:
the setup below has always said local, and hosted Supabase differs from a from-scratch local
stack in exactly the area this concerns — grants (see the bootstrap-grant note in
`local-supabase-playtest`). The mechanism is the same Realtime build in both, so the result is
expected to hold, but a hosted confirmation has NOT been done.

- Setup: local Supabase (all migrations applied), an anon-key `supabase-js` client subscribed
  to `postgres_changes` (`event: '*'`) on `public.ttl_statements` and `public.ttl_guesses`
  (both are in the `supabase_realtime` publication). Writes made server-side, as the app does.
- INSERT + UPDATE on `ttl_statements` → payload contained `id, game_id, player_id,
  statement_a/b/c, created_at, updated_at` and **no `lie_index`** — including on the re-submit
  UPDATE path, whose `old` record was only `{id}`.
- INSERT on `ttl_guesses` → payload contained `id, game_id, round_id, player_id, guessed_at`
  and **no `guessed_index`, `is_correct` or `points`**.
- Not a vacuous result: re-running the identical script after
  `GRANT SELECT (lie_index) … TO anon` (and the three guess columns) made all four columns
  appear in the payloads immediately; re-revoking removed them again. So the absence is caused
  by the grant, not by replication config or by the columns being unset.

Mechanism: Realtime's WALRUS filter drops any column the subscriber's role lacks
`has_column_privilege(..., 'SELECT')` on, so this is table-agnostic — the same reasoning
covers the Phase 3 `games.host_token` / `players.resume_token` revokes, though those were not
themselves re-measured here.

Playtest: 3+ players submit → start → confirm devtools/network shows no `lie_index` on the
active round and no `guessed_index` on other players' guess rows → guess → reveal highlights
the right statement and shows everyone's results → next round → finish → `/history/[code]`
and the session summary still show every round's lie and scores.

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
> spread across per-game routes _and_ shared routes (`start`, `play-again`, `players`). The
> lib-takes-a-client pattern lets us hand just the service-role client to a game's calls
> inside those shared routes, keeping each slice isolated. Games whose write logic is inline
> in client components (not lib functions taking a client) will need real Phase-2 work first.

### Players DELETE — follow-up noted

The non-host self-removal path (`/api/players` DELETE, else-branch) authorizes the _session_
but doesn't verify the target `playerId` belongs to the caller — a player could remove
another. Pre-existing; fix in the players-route slice (add `assertPlayer` and require the
removed id to match, unless host).

---

## Inventory (generated — refine per slice)

### Write routes (direct `.insert/.update/.delete/.upsert` in the route)

`client=anon` must switch to the service role in Phase 1. `playerId-only(NO-AUTHZ)` is the
core hole: authorize by `resume_token` instead.

| Route                                                                                                          | Client | Authz today                  | Writes                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------- | ------------------------------------------------------- |
| ai-questions                                                                                                   | anon   | HOST                         | games                                                   |
| anime-quotes, anime-quotes/reroll                                                                              | anon   | HOST                         | anime_quote_pool, games                                 |
| anonymous-messages                                                                                             | anon   | HOST                         | anonymous_messages, anonymous_room_bans, games, players |
| anonymous-room/bans                                                                                            | ADMIN  | HOST                         | anonymous_room_bans, games, players                     |
| bingo/call, bingo/settings                                                                                     | anon   | HOST                         | bingo_called_numbers, games                             |
| **bingo/claim, bingo/mark**                                                                                    | anon   | **playerId-only**            | bingo\_\*, games, players                               |
| **codewords/chat, clue, end-turn, guess, role**                                                                | anon   | **playerId-only**            | codewords\_\*, games, players                           |
| codewords/expire-turn                                                                                          | anon   | NONE (system)                | codewords_boards, games                                 |
| codewords/host-role, timers                                                                                    | anon   | HOST                         | codewords\_\*, games, players                           |
| confessions                                                                                                    | anon   | NONE                         | confessions                                             |
| describe-it/balance, settings                                                                                  | anon   | HOST                         | describe_it_players, games                              |
| **describe-it/team**                                                                                           | anon   | **playerId-only**            | describe_it_players, games, players                     |
| feedback                                                                                                       | anon   | NONE (public insert)         | app_feedback                                            |
| games/[code]/end-round, finish-game, lobby-pool, lobby-settings, next-round, play-again, start, [code], games/ | anon   | HOST                         | games + many                                            |
| **hot-seat**                                                                                                   | anon   | **playerId-only**            | games, hot_seat_submissions, players, rounds            |
| library, admin/\*                                                                                              | ADMIN  | NONE (admin-gated)           | question_packs, product_updates, game_player_limits     |
| **npat/dispute, draft, letter, mark, submit**                                                                  | anon   | **playerId-only**            | npat\_\*, games, players, rounds                        |
| participants                                                                                                   | anon   | HOST                         | participants, players                                   |
| **photos, player-participants, player-questions, players/promote, players/ready, quote**                       | anon   | **playerId-only**            | various                                                 |
| players                                                                                                        | anon   | HOST + RESUME                | games, participants, players                            |
| rooms/\*                                                                                                       | anon   | NONE                         | rooms, room\_\* , games                                 |
| tournaments/\*                                                                                                 | anon   | HOST (most) / NONE (players) | tournaments, tournament\_\*                             |
| **trivia/answer, two-truths/guess, two-truths/statements, votes, word-hunt/submit**                            | anon   | **playerId-only**            | various                                                 |
| wst-quotes                                                                                                     | anon   | HOST                         | games, participants, players, wst_quote_pool            |

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

> **Note:** this is a **pre-lockdown snapshot**. The core and rooms tables listed
> immediately below are **now locked** — core gameplay by
> `20260628132823_rls_lockdown_core_gameplay.sql` and rooms/`room_*` by
> `0126_rls_lockdown_rooms.sql` (see the Phase 5 section, marked **IMPLEMENTED**).

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

| Route                                                      | Writes                           | Today                              | Needs                                                                                        |
| ---------------------------------------------------------- | -------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `votes`                                                    | votes                            | **playerId only**                  | `resumeToken` + `assertPlayer` (THE voting-games action)                                     |
| `player-questions`                                         | player_questions                 | playerId only                      | `resumeToken` + assertPlayer                                                                 |
| `player-participants`                                      | participants                     | playerId only                      | `resumeToken` + assertPlayer                                                                 |
| `photos`                                                   | participants, players            | playerId only                      | `resumeToken` + assertPlayer                                                                 |
| `confessions`                                              | confessions                      | **no authz** (anonymous)           | gate with `resume_token` + assertPlayer (player-facing anonymity preserved; stops anon spam) |
| `hot-seat`                                                 | hot_seat_submissions             | playerId only                      | `resumeToken` + assertPlayer                                                                 |
| `wst-quotes`                                               | wst_quote_pool                   | host + playerId                    | host path keeps hostToken; player submissions get `resumeToken`                              |
| `quote`                                                    | who-said-this lobby submission   | playerId only                      | `resumeToken` + assertPlayer                                                                 |
| `anime-quotes`(+reroll)                                    | anime_quote_pool                 | host (now admin)                   | already host-authed; service-role write                                                      |
| `players/promote`                                          | players                          | playerId only                      | host or self ownership check                                                                 |
| `participants`                                             | participants, players            | host                               | host-authed (service role)                                                                   |
| `games` (POST create)                                      | games, participants              | anon insert (host_token generated) | service-role insert when games is locked                                                     |
| `rooms` (POST create)                                      | rooms                            | none (creator_token generated)     | service-role insert; creator_token is the owner credential                                   |
| `rooms/[code]`                                             | rooms                            | member_code (partial)              | creator_token for room edits; service role                                                   |
| `rooms/[code]/join`                                        | room_members                     | member_code                        | service-role insert (returns member_code); keep member_code identity                         |
| `rooms/[code]/messages`                                    | room_messages                    | member_code-checked                | `member_code` author check (mostly present); service role                                    |
| `rooms/[code]/members/[memberId]`                          | room_members                     | none                               | member/creator ownership check                                                               |
| shared: `start`, `play-again`, `finish-game`, `next-round` | rounds, votes, confessions, etc. | mostly admin already (Phases 1–3)  | finish the sweep                                                                             |

## Slices (sequenced)

1. **Service-role sweep (mechanical, safe, no behavior change).** Convert every remaining
   _anon-client_ write of a core table to the service role (`getSupabaseAdmin()`), same pattern
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
