# Wordle — Codebase Audit Report

Status: **audit complete, no code written.** This document captures what can be
reused from the existing Fateround codebase, what needs modification, and what
must be built from scratch to ship a Wordle game (guess-the-word with per-letter
green/yellow/gray states, on-screen keyboard, daily per-category challenge).

Scope: `src/` (web) + `supabase/migrations/`. `apps/mobile` excluded.

See also: [word-search-brief.md](./word-search-brief.md) (closest existing
game brief), [new-game-checklist.md](./new-game-checklist.md),
[trophies-and-streaks.md](./trophies-and-streaks.md).

---

## 0. Game mechanics recap (the spec the audit targets)

- N attempts (usually 6) to guess a target word of fixed length (length may vary
  per category, e.g. Naija Slang words may not be 5 letters).
- Per guess, each letter is **correct** (green, right position), **present**
  (yellow, in word wrong position), or **absent** (gray, not in word).
- Keyboard shows the **best-known state** of each letter across all guesses
  (once green, stays green).
- Game ends on a correct guess or when attempts are exhausted.
- One target word per category per day (daily challenge), same for all players.
- Category = separate word list + separate target word + independently playable
  the same day (e.g. "Naija Slang" and "General English" tracked separately).

---

## 1. Directly reusable

| What | Where | Notes |
|---|---|---|
| Daily seed RNG | `getDailyChallengeSeed(gameType, date)` — `src/lib/daily-challenge.ts:127` | FNV-1a over `` `daily:${gameType}:${date}` ``, masked int4-safe. `'wordle'` (or `wordle:naija_slang`) just works. |
| "Today" cutoff | `watToday()` — `src/lib/community-dates.ts:21` (`WAT_TIMEZONE` = Africa/Lagos, UTC+1, no DST) | Server-computed, one global "today"; re-exported from `daily-challenge.ts:278`. |
| Mid-session word pinning | Lazy-create + submit guard | GET `daily-challenges/[gameType]/route.ts:47-96` lazily inserts the day's row; submit refuses any `challenge_id` whose `challenge_date != watToday()` (`submit/route.ts:483-493`). A word cannot change mid-session. |
| Daily storage + RLS | `daily_challenges` (unique `game_type,challenge_date`, `puzzle_data` jsonb holds the solution), `daily_scores` (PK `(challenge_id, profile_id)` — one scored attempt enforced at DB level, `20260820010000_daily_challenges.sql:53`), `personal_bests`, `daily_challenge_content` | All RLS-on with **no policies**, `revoke anon/authenticated` — service-role only. |
| Answer-hash validation | `hashWord()` — `src/lib/daily-word-hash.ts:12`; `stripSolution()` — `daily-challenge.ts:171-250` | Client can test guesses vs hashes without the target ever reaching devtools; server re-verifies on submit. |
| Client progress persistence | `src/lib/daily-progress.ts` — localStorage key `daily-progress:<challengeId>`, `getOrCreateStartedAt` wall-clock epoch | Refresh-safe, cleared on submit; used by 10+ daily games (`DailyWordHuntPlay`/`DailyWordScramblePlay`/`DailyCrosswordPlay` etc.). |
| Daily game framework | `DailyChallengeGame.tsx` `PlaySurface` switch (`src/components/daily/DailyChallengeGame.tsx:72-131`), `useDailyChallengeSession.ts`, `useDailyChallengeTimer.ts`, `generateDailyPuzzle()` dispatch (`src/lib/daily-challenge-server.ts:13`) | Add a `wordle` case + a `DailyWordlePlay.tsx` following the `DailyWordScramblePlay` template. |
| Game-finish + scoring wiring | `markGameFinished()` — `src/lib/game-finish.ts:8` (CAS `onlyIfActive`); `awardRoomGamePoints()` — `src/lib/room-points.ts:370`; streak math `advanceStreak()`/`watDate()` — `src/lib/trophies/streak.ts` | Daily submit path already advances the profile streak (`submit/route.ts:624-653`). |
| In-game streak-bonus pattern | `computeStreakBonus` + `tallyMatchingPairsScore` — `src/lib/memory-match.ts:22,262,589` | Template for a within-game Wordle streak bonus. |
| Server-only dictionary | `src/lib/word-rush-dictionary.ts` (merges Scrabble + Collins + TWL + words.txt into a lazy `Set` via `fs`, `:42-51`) | Guess-validation word set (filter to 5 letters) — no new dictionary needed. |
| UI primitives | `src/components/ui/`: `Modal.tsx` (visualViewport-aware — keeps content above the mobile keyboard), `Toast.tsx` (aria-live), `ConfirmDialog.tsx`, `CustomSelect.tsx`, `Toggle.tsx` (real `role="switch"` — ready shell for a colorblind-mode toggle), `PageShell.tsx`, `SegmentedControl` (`CreateWizard.tsx:96`) | Use for stats/how-to modal, toasts, give-up confirm, category picker. |
| CSS tokens / themes | `src/app/globals.css` + `src/app/fate-round-ds.css` (light/dark + 9 game themes incl. `naija` — `src/lib/themes.ts:13-22`) | Board auto-adapts via CSS vars. Reduced-motion block already present (`globals.css:~960`). |
| Tile-flip animation | `MemoryCard` — `src/components/matching-pairs/MatchingPairsPlayerView.tsx:1195-1303` (`perspective:600px`, `preserve-3d`, `rotateY`, `backface-visibility`) | The only 3D flip/reveal in the repo. Pair with `.animate-stagger` (`globals.css:1781-1799`) for the reveal cascade. |
| Word-bank shapes | `src/data/daily-banks/themed-words.ts` (`{word, clue}` themes), `puzzle_themes` / `platform_content` tables, `pickLeastUsed` (`src/lib/question-picker.ts:24`) | Exact `{word, hint}` content shape Wordle needs. |
| Category concept | `trivia_category` CHECK (`20260913120000_trivia_categories.sql`), `content_collections`, `platform_content.variant`, `WordTheme.tag` | Existing "category" taxonomy to model Wordle categories on. |

---

## 2. Reusable with modification

| What | Where | Change needed |
|---|---|---|
| On-screen keyboard | Only one exists — inline QWERTY at `src/components/daily/DailyCrosswordPlay.tsx:385-416` (3 rows + Backspace + spacer, no per-key state) | Extract into a component and add per-key state/coloring using the `SudokuBoard` number-pad pattern (`src/components/sudoku/SudokuBoard.tsx:214-239` — the only per-key-state pad). |
| Board/grid rendering | `CrosswordBoard.tsx` / `WordSearchBoard.tsx` (CSS-grid `repeat(N,1fr)` + memo); `BingoCardGrid` per-cell `stateClass` map (`src/components/bingo/BingoCardGrid.tsx:86-100`); `LetterTile` in `ScrabbleBoard.tsx:74` | Swap solve-coloring for green/yellow/gray per-tile states; `LetterTile` is the best letter-tile styling reference. |
| Guess-feedback UX | `WordGroupingPlayerView.tsx` (grid shake `:722`, "One away" toast, mistakes-dots = attempts-left `:745-757`); `WordScramblePlayerView.tsx` per-letter tiles + red wrong-flash (`:870-879`) | Portable shake + attempts + per-letter feedback patterns. |
| Scoring (room mode) | `isCompetitiveRoomGame` — `src/lib/room-points.ts:59`; `getCompetitiveStandings` (`:149-368`); placement ladder `PLACEMENT_POINTS` (`:48`) | Add `wordle` to the allow-list + a standings branch sorting by ascending guess count; placement points then pay automatically. |
| Scoring (daily mode) | `DAILY_CHALLENGE_GAME_TYPES` — `daily-challenge.ts:9-22`; `DAILY_GAME_SLUG_TO_TYPE` (`:30-40`); `stripSolution()` (`:171-250`); `generateDailyPuzzle()` (`daily-challenge-server.ts:13`) | Add a `wordle` entry + cases in both generators + `stripSolution`. |
| Score tally template | `tallyWordGroupingScores()` — `packages/shared/src/word-grouping.ts:40` (closest conceptual analog, `WORD_GROUPING_PERFECT_BONUS = 500`); also `tallyMatchingPairsScore()` — `src/lib/memory-match.ts:262` | Model a pure `tallyWordleScores()` on these: per-guess point ladder + perfect bonus + streak roll-up. |
| Auth / anti-cheat | `assertPlayer()` — `src/lib/game-admin.ts:17` (server-authoritative via resume_token); `src/lib/rate-limit.ts` (DB-backed per-IP flood guard) | Reuse both on the Wordle guess endpoint. |
| Per-category day scoping | `daily_challenges` unique `(game_type, challenge_date)` | Bake category into the seed string (`wordle:naija_slang`) or store `{category → word}` in `puzzle_data`/`config` jsonb (preferred — one row/day covers all categories). |
| SlotMeta state pattern | `SlotMeta` emoji+label+color+class shape — `src/lib/game-types.ts:16-24`, helpers `:3080,3131` | Copy the shape for Wordle tile states (each state = emoji + label + color + CSS classes). |
| `.fr-tile` primitive | `src/app/fate-round-ds.css:1614` | Add state-variant classes (correct/present/absent). |
| High-contrast pills | `DescribeItChrome.tsx` `TEAM_STYLES` solid pills (`:10-45`) | Base technique for colorblind-safe keyboard keys (solid fill + white text). |
| Content banks | `src/data/daily-banks/themed-words.ts`, `crossword-puzzles.ts`, `word-scramble-puzzles.ts`, `codewords-words.ts`, `describe-it-words.ts`, `platform_content`/`puzzle_themes` tables | Reuse the `{word, clue}` shape and candidate pools; filter to 5 letters for the English list; build a Wordle-specific bank. |

---

## 3. Build from scratch

- **Wordle state engine** — per-guess green/yellow/present evaluation + the
  "best-known-state" keyboard merge (once green, stays green). No analog exists.
- **On-screen keyboard component** — no state-capable QWERTY component exists.
- **Wordle board/tile component** — flip/reveal, per-tile state classes
  (`--wordle-correct` / `--wordle-present` / `--wordle-absent` tokens; build on
  `--success` / `--warning` / `--border-strong` from `fate-round-ds.css:59`).
  Variable-length support required (existing grids are fixed `grid-cols-N`).
- **Naija Slang word list** — no slang list exists anywhere. Build
  `naija-slang.ts` (`{word, hint}`, not necessarily 5 letters) + a seed
  migration + `content_collections` tag.
- **Colorblind / alt-symbol mode** — does not exist anywhere (no colorblind
  files, no daltonic code; `src/lib/color.ts` is only `hexToRgba`). Build per
  `Toggle` + distinct-shape-per-state (copy the `game-glyphs.ts:154` tier-icons
  philosophy — shape, not just color) + `sr-only` tile labels + a persistent
  `aria-live` region announcing each guess's result.
- **Per-guess server verification** — no generic "is this a valid word"
  endpoint exists (validation is game-specific). Model on
  `src/app/api/word-search/found/route.ts` or `word-scramble/submit/route.ts`.
  Open decision: one-shot submit + client-side comparison vs hashes, vs. a
  small per-guess verify endpoint.
- **Min-duration anti-cheat** — **no minimum-solve-time check exists anywhere**
  (only max-time session expiry; daily submit only checks `timeSeconds >= 0` at
  `submit/route.ts:475`). A Wordle min-solve-time floor is net-new; the daily
  timer's persisted `startAtMs` (`src/hooks/useDailyChallengeTimer.ts:30-52`) is
  the honest-clock building block.

---

## 4. Bug patterns to avoid

- **Never rebuild state inside a realtime/subscribe handler** — this caused the
  historical Matching Pairs progress-desync (fixed in `5d766f1a`,
  `89209548`, `c7bac65d`). The correct pattern to copy: incremental apply with
  stale-reject (`MatchingPairsPlayerView.tsx:354`, compares `updated_at`), the
  canonical `mergeRealtimeGame()` (`src/lib/realtime-merge.ts:17` — "merge,
  never rebuild"), and a per-player in-process lock for guess writes like
  `src/app/api/matching-pairs/flip/route.ts:38-53`. Wordle is mostly local-state
  so low risk now, but the rule applies to any future live/race mode.
- **Answer leakage** — `codewords_boards` shipped its `key` column to anon, then
  required a column-grant lockdown (`20260803170000_hide_codewords_key.sql`).
  The Wordle solution must stay server-only (`puzzle_data` + `stripSolution`);
  never send the target word to the client.
- **Don't edit shipped migrations** — new `'wordle'` entries go in a new
  forward-only migration (pattern: `20260824000000_daily_ludo_puzzle_type.sql`)
  for the three CHECK constraints (`daily_challenges.game_type`,
  `personal_bests.game_type`, `daily_challenge_content.game_type`). If Wordle
  also ships as a multiplayer room game it additionally needs
  `games_game_type_check` + `game_player_limits` / `community_games` rows
  (pattern `20260806120000_word_grouping.sql:110-116`).
- **Seed derivation drift** — the batch generator seeds differently
  (`batch:` prefix, `daily-batch-generator.ts:63`) from runtime
  `getDailyChallengeSeed`. Use only the runtime seed for the Wordle picker so
  admin pre-fill and live generation agree.

---

## 5. Suggested build shape (summary)

1. **`wordle` as a daily challenge first** — slots cleanly into the existing
   pipeline. Categories (`naija_slang`, `general_english`) stored in
   `puzzle_data`/`config` jsonb; word picked per
   `getDailyChallengeSeed('wordle', date)` + `seed % bank.length` (pattern:
   `daily-word-grouping.ts:505-529`, `daily-codenames.ts:648-671`).
2. **`DailyWordlePlay.tsx`** following the `DailyWordHuntPlay` /
   `DailyWordScramblePlay` template (localStorage progress via `daily-progress.ts`,
   hash-based client validation, server re-verification on submit).
3. **`src/lib/daily-wordle.ts`** engine: seeded picker + pure
   `tallyWordleScores()` (fewer guesses = more points, perfect bonus, streak).
4. **`naija-slang.ts`** word bank (`{word, hint}`) + seed migration +
   collection tag.
5. Registration touch points: `DAILY_CHALLENGE_GAME_TYPES`, `DAILY_GAME_SLUG_TO_TYPE`,
   `stripSolution`, `generateDailyPuzzle`/`generateDailyPuzzleFromContent`,
   `PlaySurface`, SQL CHECK constraints, SEO map
   (`src/app/daily-challenges/[gameType]/page.tsx`), accent map
   (`DailyChallengeSection.tsx:28-41`).

Standalone pieces: multiplayer room mode (room-points + `games` registrations +
per-guess endpoint) and the colorblind/alt-symbol mode.

---

## 6. Key file index

- `src/lib/daily-challenge.ts` — seed, registries, `stripSolution`, launch gate
- `src/lib/daily-challenge-server.ts` — `generateDailyPuzzle` dispatch
- `src/lib/community-dates.ts` — `watToday`, WAT timezone
- `src/lib/daily-progress.ts` — refresh-safe localStorage progress
- `src/lib/daily-word-hash.ts` — `hashWord` answer hashing
- `src/lib/trophies/streak.ts` — `advanceStreak` / `watDate`
- `src/lib/room-points.ts` — room placement points
- `src/lib/game-finish.ts` — `markGameFinished`
- `src/lib/memory-match.ts` — streak-bonus scoring template
- `src/lib/word-rush-dictionary.ts` — server-only word validation set
- `src/lib/game-admin.ts` — `assertPlayer`
- `src/lib/realtime-merge.ts` — "merge, never rebuild" realtime pattern
- `src/lib/game-types.ts` — `SlotMeta` state-shape pattern
- `src/lib/game-glyphs.ts` — distinct-shape-per-state a11y philosophy
- `src/components/daily/DailyCrosswordPlay.tsx:385` — inline QWERTY keyboard
- `src/components/sudoku/SudokuBoard.tsx:214` — per-key-state number pad
- `src/components/matching-pairs/MatchingPairsPlayerView.tsx:1195` — tile flip
- `src/components/daily/DailyChallengeGame.tsx:72` — `PlaySurface` switch
- `src/components/ui/*` — Modal / Toast / ConfirmDialog / Toggle / CustomSelect
- `src/app/globals.css`, `src/app/fate-round-ds.css` — tokens + `.animate-stagger`
- `supabase/migrations/20260820010000_daily_challenges.sql` — core tables
- `supabase/migrations/20260821000000_daily_challenge_content.sql` — admin content
- `supabase/migrations/20260824000000_daily_ludo_puzzle_type.sql` — CHECK-add pattern
- `src/data/daily-banks/themed-words.ts` — `{word, clue}` word-bank shape