# Word Search — implementation brief (web + mobile)

Status: **proposed, not built.** This brief maps the Word Search game onto the
exact architecture used for **Crossword** and **Sudoku**, so it can be built the
same way. Word Search is ~90% the Crossword build with one new interaction
(drag-to-select instead of typing). Use `crossword` as the copy-from template
throughout; fall back to `sudoku` for the single-grid timer/race shell.

See also: [new-game-checklist.md](./new-game-checklist.md) (web),
[mobile-game-checklist.md](./mobile-game-checklist.md) (mobile).

---

## 0. Concept & archetype

Players hunt for a list of hidden words in a shared grid of scattered letters.
Words run in 8 directions (H, V, both diagonals, each forwards/backwards). Same
grid + word list for everyone. **Race mode only** for v1: first to find all
words (or highest score when the timer ends) wins.

- **Archetype:** single-round, timed, play-first **race** — identical to
  Crossword and Sudoku (`participant_mode: 'joiners'`, `rounds_count: 1`, host
  plays along, "play again while active" allowed).
- **Min players:** 1 (solo-practice friendly, like Crossword/Sudoku).

### ⚠️ Naming clash — resolve before building
This repo already has **Word Hunt** (`word_hunt`), a *Boggle-style* game where
you **form** words from adjacent letters. Word Search is the opposite: you
**find** words from a **given list**. They are distinct games, but the names are
close. Recommendation: ship as **"Word Search" 🔎** (distinct emoji + tagline
"Find the listed words in the grid") and keep Word Hunt's 🔤⏱️ "Boggle-style
rush". Confirm the display name before wiring landing/SEO copy.

---

## 1. The one real design decision: selection & anti-cheat

Everything else is mechanical Crossword reuse. This is the part to get right.

**Interaction:** drag/swipe from a word's **first** letter to its **last**
letter. The client sends the two endpoints; the server decides if that straight
line spells a planted word.

**Submit contract** — `POST /api/word-search/found`:
```
{ gameId, resumeToken, startRow, startCol, endRow, endCol, hint? }
```
- Server validates the endpoints form a straight line in one of the 8 allowed
  directions, walks the cells, and checks the string (and its reverse) against
  the **planted word set** for the round.
- Valid + not already found by this player → insert a `word_search_found` row
  (`word`, `player_id`, cell path, `via_hint`). Response `{ found: true, word }`.
- Invalid → `{ found: false }` (no penalty in Race; optional −N in hard mode).
- `hint: true` → server returns the location of one still-unfound word for a
  −2 penalty (reveal its cells, don't require a drag).

**Data-secrecy model (differs from Crossword):**
- The **grid letters are fully public** (rendered from round metadata) — unlike
  Crossword, where letters are the secret. There is no per-cell hidden solution.
- The **word placements** (each word's start/end/direction) live server-side in
  a `word_search_solutions` row (RLS-hidden), used to (a) validate found words,
  (b) power the hint, (c) keep the answer coordinates off the client.
- **Known limitation:** because the whole letter grid is visible, a determined
  client could scan it for the listed words. This is inherent to word search and
  acceptable for v1 — validation still runs server-side so scores can't be
  forged. Note it; don't try to hide the grid.

**Metadata split** (mirrors Crossword's `buildCrosswordRoundRow`):
- `rounds.word_search_metadata` (public): `{ size, grid: string[][], words: string[], directions: Direction[] }`.
- `word_search_solutions.solution` (RLS-hidden): `WordSearchPlacement[]` =
  `{ word, row, col, direction }` (endpoints derivable from word length).

---

## 2. Web files (mirror `crossword` 1:1)

### Lib (`src/lib/`)
- **`word-search.ts`** ← copy of `crossword.ts`. Constants
  (`WORD_SEARCH_MIN/MAX/DEFAULT_PLAYERS`, `WORD_SEARCH_WORD_POINTS=10`,
  `WORD_SEARCH_FIRST_BONUS=5`, `WORD_SEARCH_LENGTH_BONUS=1` (optional),
  `WORD_SEARCH_HINT_PENALTY=-2`, `WORD_SEARCH_GAME_DURATION_OPTIONS`,
  `WORD_SEARCH_DIFFICULTIES`, `Direction` union). Types (`WordSearchMetadata`,
  `WordSearchPlacement`, `WordSearchFound`, `WordSearchPlayerScore`). Pure
  helpers: `parseWordSearchMetadata`, `placementCells(placement)`,
  `selectionCells(start,end)`, `selectionMatchesPlacement(...)`,
  `playerFoundWords(found, playerId)`, `wordSearchCompletionPercent`,
  `isWordSearchCompleteForPlayer`, `tallyWordSearchScores` (see §3),
  `clampWordSearchGameDuration`, `formatWordSearchGameDuration`,
  `wordSearchGameSessionExpired`, `generateWordSearch(words, opts)` →
  `{ metadata, solution } | null`, `buildWordSearchRoundRow`,
  `clearWordSearchSessionData`. Keep the same pure/DB boundary as `crossword.ts`.
- **`word-search-puzzles.ts`** ← copy of `crossword-puzzles.ts`. `WORD_SEARCH_THEMES`
  (CSV-style word banks: `{ word, theme }`), `buildWordSearchPuzzle(themeId,
  difficulty, seed)`, `findWordSearchTheme`, `wordSearchThemeOptions`,
  `parseWordSearchEntries(rows)` for custom CSV uploads.
- **`word-search-finish.ts`** ← copy of `crossword-finish.ts`:
  `finishExpiredWordSearchGame`, `finishWordSearchIfAnyPlayerDone`.
- **`word-search.test.ts`** ← generation (every planted word is actually findable
  in the grid) + scoring (first-finder bonus, hint penalty) unit tests.

### Registration
- `src/types/index.ts`: `'word_search'` in `GameType`; `word_search_metadata` on
  `Round`; `word_search_theme` / `word_search_difficulty` on `Game`;
  `WordSearchFound` DB type.
- `src/lib/game-types.ts`: `GAME_TYPE_CONFIG` entry, `parseGameType` branch,
  `isWordSearchGame`, `gameHowItWorks`, `NAME_ONLY_PLAYER_JOIN_GAMES` /
  `LOBBY_GAMES` flags.
- `src/lib/validation/shared.ts`: add to `gameTypeEnum`.
- `src/lib/validation/game.ts`: `word_search_theme` / `word_search_difficulty`
  create fields.
- `src/lib/game-limits.ts`: constants import + `LOBBY_LIMIT_GAME_TYPES` +
  `GAME_LIMIT_CODE_DEFAULTS` (min 1 / max 20 / default 20).
- `src/lib/game-landing.ts` + `game-landing-rules.ts`: slug, landing content, SEO
  keywords, rules list.

### API routes
- **`src/app/api/word-search/found/route.ts`** ← `crossword/submit` (validate a
  selection against placements instead of a single letter).
- **`src/app/api/games/[code]/expire-word-search/route.ts`** ← `expire-crossword`.
- `.../start/route.ts`: add `isWordSearchGame` branch — generate puzzle
  (custom-CSV pool → themed bank fallback), insert round + `word_search_solutions`.
- `.../play-again/route.ts`: `ClearableSessionGameType` + `SESSION_CLEARERS` +
  `canReturnToLobby` active-game branch.
- `.../lobby-settings/route.ts`: `limitOnlyLobbyType` → `'word_search'` + duration
  clamp branch.
- `.../games/route.ts` (create): `resolveMaxPlayers` branch, joiners
  `participant_mode`, `isQuickLobby`/game-switch defaults, store
  `word_search_theme` / `word_search_difficulty`.

### Components (`src/components/word-search/`)
- **`WordSearchBoard.tsx`** ← `CrosswordBoard.tsx`, but the interaction is a
  **drag-select**: pointer/mouse-down on a cell starts a selection, drag snaps to
  the nearest straight 8-way line, pointer-up submits start+end. Highlight found
  words in per-player colours (reuse the crossword ownership-colour approach).
- **`WordList.tsx`** — the list beside the grid; strike through found words,
  colour-match the finder.
- **`WordSearchGameTimerBar.tsx`** ← `CrosswordGameTimerBar.tsx` (calls
  `expire-word-search`).
- **`WordSearchPlayerView.tsx`** ← `CrosswordPlayerView.tsx`: bootstrap, realtime
  on `word_search_found`, live completion %, hint button (disable when all words
  found), finish standings via the shared leaderboard, play-again ready ring.
  Reuse the **per-selection in-flight guard** pattern (not a single global lock —
  see the Crossword fix) so rapid finds never drop.
- **`WordSearchHostView.tsx`** ← `CrosswordHostView.tsx` (play-first host + watch
  board).
- Register in `game-host-views.ts` and `game-player-views.ts`.

### Create flow
- `src/app/create/page.tsx`: "Word Search room" settings block (max players, theme
  dropdown, difficulty, **allowed directions** toggle, time limit) + state + flag
  + payload wiring + `isQuickLobby`/defaults — copy the Crossword block.

---

## 3. Scoring (Race) — same shape as Crossword's `tallyCrosswordScores`

Per word found:
- **+10** (`WORD_SEARCH_WORD_POINTS`) to every player who finds it.
- **+5** (`WORD_SEARCH_FIRST_BONUS`) to the **first** finder of that word.
- **+1 × length** (`WORD_SEARCH_LENGTH_BONUS`, optional / hard mode) to each finder.
- **−2** (`WORD_SEARCH_HINT_PENALTY`) per hint used.

Winner = highest score; ties broken by words-found then name. First to find **all**
words ends the round immediately (`finishWordSearchIfAnyPlayerDone`). Yes — this is
the same first-to-claim model as Sudoku blocks and Crossword words.

---

## 4. Difficulty levers → presets (like Crossword difficulty)

| Lever | Easy | Medium | Hard |
|-------|------|--------|------|
| Grid size | 8×8 | 12×12 | 16×16 (up to 20×20) |
| Word count | 6 | 10 | 14 |
| Directions | H/V only | + diagonals | all 8 incl. reversed |
| Overlapping words | off | light | on |
| Length bonus | off | off | on |
| Hints | on | on | off (or costlier) |

Store `word_search_difficulty` on the game; the generator reads the preset. Grid
size / directions are derived from difficulty (don't expose every lever in the UI
for v1 — mirror how Crossword hides internals behind a difficulty pick, plus one
extra "directions" toggle if you want it surfaced).

---

## 5. Supabase migration (one file, `YYYYMMDDHHMMSS_word_search.sql`)

Mirror `20260712120000_crossword.sql`:
- `ALTER TABLE games ADD COLUMN word_search_theme text`,
  `word_search_difficulty text NOT NULL DEFAULT 'medium' CHECK (...)`.
- `word_search_found` table (`game_id, round_id, player_id, word, start_row,
  start_col, end_row, end_col, via_hint, found_at`) + indexes + a unique index on
  `(player_id, round_id, word)` so a player can't double-score a word. RLS read =
  true; realtime publication add.
- `word_search_solutions` table (`round_id`, `solution jsonb`) — RLS insert-only,
  no select policy (server reads via service role).
- Extend `games_game_type_check` (+ `app_feedback_game_type_check` if present).
- Seed `game_player_limits` row for `word_search`.

Naming: timestamp prefix, per repo convention. Apply to the dev Supabase as a
separate deploy step (same as Crossword).

---

## 6. Shared package + mobile (mirror `crossword` mobile build)

### `packages/shared/`
- **`src/word-search.ts`** — client-safe port (types + pure helpers +
  `WORD_SEARCH_THEME_OPTIONS`; **no** generation/DB code), exported as
  `@fateround/shared/word-search` (add to `package.json` "exports").
- `src/types.ts`: `'word_search'` in `GameType`; `word_search_metadata` on `Round`;
  `word_search_theme/difficulty` on `Game`; `WordSearchFound` type.
- `src/game-type-checks.ts`: `isWordSearchGame`.
- `src/batch-3-games.ts`: add `word_search` (auto-flows into mobile supported
  games) — **and** `src/app/api/mobile-config/route.ts` `BATCH_3_GAMES` on web
  (the mobile-config list is hardcoded separately; Crossword needed this too).
- `src/lobby-limits.ts`, `src/create-party-games.ts`: register `word_search`.

### `apps/mobile/`
Registration points (each mirrors its `crossword` entry):
`lib/mobile-registry.ts`, `components/games/GameRouter.tsx`,
`lib/game-type-meta.ts`, `lib/game-rules.ts`,
`lib/game-api.ts` (`postWordSearchFound`), `lib/supabase-selects.ts`
(`WORD_SEARCH_FOUND_SELECT` + `word_search_metadata` in `ROUND_SELECT`),
`lib/late-join-context.ts`, `lib/create-settings/party-games.ts`,
`components/create/PartyRoomSettingsPanel.tsx`,
`components/host/HostLobbySettingsSheet.tsx`,
`components/host/lobby-settings/DurationGamesSection.tsx`.

View: `components/games/WordSearchPlayerView.tsx` (+ a `word-search/` subfolder for
board, timer, standings) ← the mobile `CrosswordPlayerView`. **Interaction on
mobile:** a pan gesture over the grid (PanResponder / RN Gesture Handler) that
snaps the drag to a straight 8-way line and submits start+end on release — this
replaces Crossword's on-screen keyboard. Runtime theming only
(`useThemedStyles`); realtime via `useGameTableSync` on `word_search_found`;
finish standings via `pointsLeaderboard`.

> Expo note: read `apps/mobile/AGENTS.md` — check the versioned Expo docs before
> using any gesture/animation API.

---

## 7. Verification (per platform)

- `npx tsc --noEmit` (web), `packages/shared` tsc, `apps/mobile` tsc → all clean.
- `pnpm test` / `vitest` — `game-type-coverage.test.ts` (CI guardrail) must pass,
  plus the new `word-search.test.ts`.
- Browser smoke: `/create?type=word_search` renders the room block; live
  create→join→start→find-a-word→score (needs the migration applied first).
- Re-use the Crossword lessons: **per-selection in-flight guard** (no global
  submit lock), and **`preventScroll` / no layout jump** on selection.

---

## 8. Effort & rollout

Comparable to Crossword: ~20–25 files, one migration, two large view components,
the drag-select interaction is the only net-new logic. Suggested order (same as
Crossword): lib + generator + tests → registration + migration → API routes →
create flow → web views → shared port → mobile. The two big view components can be
delegated in parallel; the generator + scoring should be built and unit-tested
first because everything else depends on their shapes.

**Open decisions to confirm before building:**
1. Display name / emoji vs. Word Hunt (§0).
2. Length bonus on by default, or hard-mode only? (§3)
3. Surface the "allowed directions" toggle in create, or fold it entirely into
   difficulty? (§4)
4. Invalid-selection penalty in hard mode, or never? (§1)
