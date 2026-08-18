# Fateround Wordle — Game Design Spec

Status: design draft, not yet built. Numbers below are proposed defaults —
flag anything you want changed before this goes to the agent.

---

## 1. Overview

Guess a hidden word within a limited number of attempts. Each guess returns
per-letter feedback (correct position / wrong position / not in word). Word
and attempt count depend on the selected category.

Two modes:
- **Daily Challenge** — one word per category per day, same for everyone, solo.
- **Multiplayer Room** — a host starts a live room, all players race the same word.

---

## 2. Step-by-step flow (Daily Challenge)

1. Player opens Wordle from the daily challenges hub. The category isn't
   player-chosen — the system picks one category at random for the day, same
   for every player. The board header shows which category today's word
   belongs to.
2. App loads today's puzzle for that category. If already attempted today,
   this uses whatever repeat-visit handling the other daily games already
   have in place (`useDailyChallengeSession` / `DailyChallengeGame.tsx`) —
   not a Wordle-specific read-only board.
3. Player types a full-length guess and submits it (Enter, matching existing
   daily-game input pattern).
4. Guess is validated:
   - Wrong length → reject, no attempt consumed.
   - Correct length → graded and attempt consumed **regardless of whether
     it's a real dictionary word**. No dictionary check on submission —
     length is the only gate.
5. Repeat until either:
   - Player guesses correctly → **win**, board locks, result modal shows
     guesses used, points earned, streak.
   - Player exhausts attempts → **loss**, board locks, target word revealed,
     streak resets.
6. Result is submitted to the server (server re-verifies against the hash,
   same pattern as other daily games). Score, streak, and personal best update.
7. Player can share a result grid (emoji-style spoiler-free board) — matches
   the shareable-result pattern already used elsewhere in the app, if one
   exists; otherwise this is a small net-new share-string builder.
8. One category, one word, one attempt per day — there's nothing else to
   play until the category rotates again tomorrow.

---

## 3. Core rules

- Feedback per letter, in priority order:
  - **Correct** (green) — letter is in the word, in this exact position.
  - **Present** (yellow) — letter is in the word, but a different position.
  - **Absent** (gray) — letter is not in the word (or all instances of it are
    already accounted for by correct/present elsewhere — standard duplicate-
    letter handling, e.g. guessing "ARRAY" against a word with one R marks
    only one R present/correct and the other absent).
- Keyboard state is cumulative across the whole game: once a key is marked
  correct, it stays correct even if a later guess would otherwise mark it
  absent in a different position. Present only downgrades to correct, never
  the reverse.
- One attempt is consumed on any correct-length submitted guess, whether or
  not it's a real word. Only wrong-length guesses are rejected without
  costing an attempt.
- No takebacks once a guess is submitted.
- No hints in v1 (see §6 for how a future hint system would be penalized).

---

## 4. Word length & attempts by category

No shared formula — each category has its own rule:

**General English** — fixed classic Wordle shape: **5 letters, 6 attempts.**

**Naija Slang** — length 3–7 letters, attempts scale with length:

```text
attempts = word_length + 1
```

| Word length | Attempts |
|---|---|
| 3 letters | 4 |
| 4 letters | 5 |
| 5 letters | 6 |
| 6 letters | 7 |
| 7 letters | 8 |

This keeps the shortest, most iconic slang (OMO, JAPA, SAPA) playable while
still giving longer words extra headroom to compensate for being harder.

---

## 5. Categories (v1)

**Category selection differs by mode:**
- **Daily Challenge** — no player choice. The system picks one category at
  random each day, same category for everyone. Needs a seeded pick (date-based,
  same pattern as the word seed) so it's consistent across a day rather than
  re-rolling per request.
- **Multiplayer Room** — the host picks the category when creating the room.

**General English**
- Fixed 5 letters (see §4), sourced from the curated static
  `WORDLE_GENERAL_ENGLISH` bank (`data/daily-banks/wordle-general-english.ts`),
  not a runtime filter of the Scrabble dictionary.
- No hint text needed — word itself is the whole puzzle.

**Naija Slang**
- 3–7 letters (widened from the earlier 5–7 to fit the most iconic short
  terms — see §4). Sourced across Pidgin, Yoruba, Igbo, and Hausa — not just
  one language — pulling from a spread of published slang glossaries
  (Zikoko, Awajis/Slangloom, British Council's Pidgin guide, MonoEd) rather
  than one list, so no single language dominates the bank. Example spread:

  | Word | Length | Origin | Meaning |
  |---|---|---|---|
  | OMO | 3 | Yoruba/Pidgin | Wow / expression of surprise |
  | JAPA | 4 | Yoruba/Pidgin | To leave Nigeria for abroad |
  | SAPA | 4 | Pidgin | Broke, financial hardship |
  | GBEGE | 5 | Pidgin | Trouble, drama |
  | SHEGE | 5 | Hausa | Trouble, a hard time |
  | AMEBO | 5 | Yoruba/Pidgin | Gossip, a gossiper |
  | AJEBO | 5 | Yoruba/Pidgin | Privileged, sheltered upbringing |
  | ABOKI | 5 | Hausa | Friend (flag — see content policy below) |
  | WAHALA | 6 | Pidgin | Trouble, problem |
  | KOROPE | 6 | Yoruba | (slang, street usage) |
  | ODOGWU | 6 | Igbo | A big man, a legend |

  - Each entry needs a **hint field** shown after a loss, since slang
    familiarity varies by player. Content shape: `{ word, hint }`, matching
    the existing `themed-words.ts` bank shape.
  - **Content policy still needs a decision:** some terms shift meaning
    toward mildly derogatory or vulgar depending on context (e.g. ABOKI can
    read as dismissive rather than "friend" depending on tone; NYASH is
    common enough to have entered the Oxford Dictionary in 2026 but is
    body-part slang). Decide clean-only vs. widely-known-even-if-edgy before
    the full list is drafted.

**Future categories (not v1, just noting the framework supports it)**
- Tech/Dev terms, Pidgin proverbs, Football/Naija sports slang, etc. — same
  `{word, hint}` shape, same scaling formula, just a new bank + category tag.

---

## 6. Daily Challenge scoring

**Base points** (scales with attempts used relative to that category's max):

```text
base_points = round(1000 - (guesses_used - 1) * (600 / (max_attempts - 1)))
```

This always pays 1000 for a first-guess win and 400 for a last-guess win,
scaled evenly in between regardless of category's attempt count. A loss pays
**0 base points**.

Example for General English (fixed 6 attempts):

| Guesses used | Base points |
|---|---|
| 1 | 1000 |
| 2 | 880 |
| 3 | 760 |
| 4 | 640 |
| 5 | 520 |
| 6 | 400 |
| Loss | 0 |

Naija Slang words use the same formula against whatever `max_attempts` that
word's length gives it (e.g. a 6-letter word has 7 attempts, so its last-guess
win still pays 400, evenly stepped in between).

**Bonuses**
- **Perfect bonus** — solved on guess 1: **+200** flat (mirrors the
  `WORD_GROUPING_PERFECT_BONUS` pattern already in the codebase).
- **Streak bonus** — this is **not a Wordle-specific streak.** The platform
  already tracks one daily-participation streak per account, counted by how
  many consecutive days a player engages with *any* daily challenge, not
  whether they won that day's game. Wordle just plugs into that existing
  streak like every other daily game does, and the existing bonus tiers
  (via `computeStreakBonus`) apply as-is. No new streak logic to design here.

**Penalties**
- **Loss** — 0 points for that day's Wordle. Losing does **not** touch the
  account streak — the streak only cares whether the player showed up to a
  daily challenge that day, not whether they won it. Playing (win or lose)
  is what counts toward it, same as every other daily game.
- **Hint used** (if/when hints ship) — proposed **-150 points** per hint,
  applied before bonuses. v1 ships with no hints, so this only matters once
  a hint feature is scoped.
- No penalty for individual wrong guesses beyond the attempt cost already
  baked into the base-points formula.

Final score = `base_points + perfect_bonus + streak_bonus - hint_penalties`,
floored at 0.

Since the system picks one random category per day rather than the player
choosing, there's only ever one Wordle score per day to track — no
combined-vs-separate leaderboard question to resolve. A single `wordle`
game_type with the day's chosen category stored in `puzzle_data` covers it.

---

## 7. Multiplayer room system

No streaks in multiplayer — streaks are a Daily Challenge concept only.

**Reuse-first, across the board**
- Scoreboard/standings display, lobby settings screen, and every host
  control needed when creating a room (category picker, word count picker,
  timer picker, player limit, start/lock room, kick/leave handling, etc.)
  should all pull from whatever existing multiplayer room components
  Fateround already has, not get rebuilt for Wordle specifically. This
  spec calls out the timer picker by name because it's the one the audit
  flagged as unlocated, but the same rule applies to anything else in the
  room-creation and in-room UI: check for an existing shared component
  first, and only build new where Wordle's mechanics genuinely need
  something none of the other games have (the state engine, keyboard, and
  tile board from the audit's "build from scratch" list — those are the
  real net-new pieces, everything around them shouldn't be).

**Setup**
- Host creates a Wordle room and picks the category (General English or
  Naija Slang). Word length and attempt count per word follow §4 based on
  that category.
- Host also picks **how many words** the game covers: **5, 10, 15, or 20**
  (multiples of 5), default 5.
- Host also sets a **time limit for the whole game** (not per word) — reuse
  whatever timer-selection UI the other multiplayer games in the codebase
  already use for this rather than building a new one (the audit didn't
  pin down the exact component, so this is a lookup task for the agent
  before writing new UI). The host can also leave it **untimed**, in which
  case the game simply runs until every player finishes the full sequence.
- The server generates a fixed sequence of that many words for the room
  (seeded per room, independent of the daily word — a multiplayer round
  never spoils or reuses that day's Daily Challenge word). Every player in
  the room gets the exact same sequence, in the same order.

**Sequential progression (the race format)**
- All players start on word 1 at the same time.
- The moment a player solves their current word, they immediately move on to
  word 2, then word 3, and so on — they don't wait for other players. Players
  progress through the sequence at their own pace, so at any moment different
  players can be on different words.
- If a player exhausts their attempts on a word without solving it, that word
  is scored as a loss (0 base points for that word — see scoring below) and
  they move on to the next word in the sequence regardless, so nobody gets
  permanently stuck.
- The game ends one of two ways:
  - **Timed** (host set a limit): when the clock runs out, the game
    auto-submits for everyone still playing. Each player is graded on
    cumulative score for whatever they'd completed at that moment — solved
    words keep their earned points, the word they were mid-guess on (if
    unsolved) scores as a loss for that word, and any words not yet reached
    in the sequence simply don't contribute points. Nobody gets stuck
    waiting on a slow player.
  - **Untimed** (host left no limit): the game runs until every player has
    finished the full sequence (solved or lost every word).

**Live state**
- Each player's own board shows full letter feedback as normal for whichever
  word they're currently on.
- Opponents are shown as progress only — which word number they're on (e.g.
  "word 3 of 5") and how many total words solved so far, not their letters
  or guesses. Keeps it competitive without letting anyone read an opponent's
  discovered letters.
- This needs the "merge, never rebuild" realtime pattern (`realtime-merge.ts`)
  for state updates — the historical desync bug came from rebuilding board
  state inside a subscribe handler in Matching Pairs, and a sequential
  multi-word race has more moving state than a single-word round did.

**Standings / ranking**
1. Most words solved (out of the full sequence) ranks higher.
2. Tie on words solved → fewer total guesses summed across all solved words
   ranks higher.
3. Still tied → faster total completion time wins (only meaningful for
   players who fully finished before a timed cutoff — for a timed game where
   the clock ran out before everyone finished, ranking effectively stops at
   rule 1 and 2 for whoever didn't complete the full sequence).

**Scoring**
- Per word: same base-points formula as §6, using that word's own
  `max_attempts` from §4. No streak bonus (multiplayer has none), but the
  perfect-guess bonus (+200 for solving a word on the first guess) still
  applies per word.
- A player's game score is the sum of their per-word scores across the whole
  sequence.
- Placement points on top of that: reuse the existing `PLACEMENT_POINTS`
  ladder and `getCompetitiveStandings` pattern from `room-points.ts` —
  Wordle gets added to the `isCompetitiveRoomGame` allow-list with a
  standings branch sorted by the ranking order above.

**Anti-cheat**
- Server-authoritative guesses via `assertPlayer()`, same as other room games.
- Distinct-participant validation (existing Supabase function) to stop one
  person joining a room twice under two sessions.
- Min-duration floor per guess submission (e.g. reject a guess submitted
  faster than physically plausible) — this doesn't exist anywhere yet per
  the audit, so it's net-new regardless of daily or multiplayer mode, but
  matters more here since it's directly competitive against other players.

---

## 8. Open questions to settle before build

1. Content policy for borderline Naija Slang terms (see §5) — clean-only vs.
   widely-known-even-if-edgy.
2. Colorblind/alt-symbol mode — **confirmed v2, not launch scope.**
3. Locate the existing multiplayer timer-selection component to reuse for
   the whole-game host timer (see §7) — agent discovery task, not a design
   decision, but flagging so it doesn't get skipped in favor of building a
   new one from scratch.
