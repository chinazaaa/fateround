import { allOf, counterCrit, type SystemTrophySpec } from './types'

/**
 * Word Grouping — derived at finish from `word_grouping_submissions` + solution.
 *
 * The 30-trophy brief pipes cleanly through the facts builder in
 * `../game-facts/word-grouping.ts`, but a few line items collapse into the generic per-game
 * catalog and one is not expressible with the current DSL.
 *
 * OMITTED (covered by generic catalog):
 *  - #1 "First Connection" → generic `games_played` (`first_game`).
 *  - #21 "Ten Games" → generic `games_played` gte 10 (`ten_games`).
 *  - #30 "Word Grouping Champion" (platinum capstone) → generic `${game}.platinum` fires when
 *    every non-platinum trophy for the game is earned. Its title reads "Master" out of the box;
 *    the admin can rename in place if the "Champion" name matters.
 *
 * DROPPED:
 *  - #10 "Themed In" — Word Grouping has no host-selectable theme (unlike crossword /
 *    word_scramble which carry `puzzle_theme_id`), so there is nothing for the trophy to gate on.
 *  - #24 "Streak" (win 3 in a row) — counters are lifetime sums, so a run of consecutive wins
 *    can't be expressed as one summable integer. Same reason Crazy Eights and UNO explicitly
 *    skip their "clean sweep" / "perfect call" streak trophies.
 *
 * 25 of the 30 briefed trophies are built here; 3 more fire via the generic catalog; 2 are
 * dropped.
 *
 * Difficulty tiers 1–4 map to the yellow / green / blue / purple groups (see GROUP_COLORS in
 * `src/components/word-grouping/WordGroupingPlayerView.tsx`).
 */

const WG = 'word_grouping'

export const WORD_GROUPING: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'group_found',
    tier: 'bronze',
    title: 'Group found',
    description: 'Solve your first group.',
    counter: 'word_grouping_groups_solved',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'half_way',
    tier: 'bronze',
    title: 'Half way',
    description: 'Solve 2 groups in a single game.',
    counter: 'word_grouping_two_group_games',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'lives_left',
    tier: 'bronze',
    title: 'Lives left',
    description: 'Solve a group with all 4 mistakes still available.',
    counter: 'word_grouping_no_mistakes_solve_games',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'easy_start',
    tier: 'bronze',
    title: 'Easy start',
    description: 'Solve the yellow (tier 1) group.',
    counter: 'word_grouping_tier1_solved_games',
    points: 10,
    sortOrder: 50,
  },
  {
    // Cross-game composite: 4 per-tier "did-it-in-a-game" flags, each gte 1. Each flag increments
    // once per game the player solved that tier, so `gte 1` reads as "ever solved that tier".
    suffix: 'colour_collector',
    tier: 'bronze',
    title: 'Colour collector',
    description: 'Solve one group of each difficulty across your played games.',
    criteria: allOf(
      counterCrit('word_grouping_tier1_solved_games', 1, WG),
      counterCrit('word_grouping_tier2_solved_games', 1, WG),
      counterCrit('word_grouping_tier3_solved_games', 1, WG),
      counterCrit('word_grouping_tier4_solved_games', 1, WG)
    ),
    points: 20,
    sortOrder: 60,
  },
  {
    suffix: 'near_miss',
    tier: 'bronze',
    title: 'Near miss',
    description: 'Get a "one away" result (3 of 4 correct) in a game.',
    counter: 'word_grouping_one_away_games',
    points: 10,
    sortOrder: 70,
  },
  {
    suffix: 'bounce_back',
    tier: 'bronze',
    title: 'Bounce back',
    description: 'Solve a group on the very next guess after a mistake.',
    counter: 'word_grouping_bounce_back_games',
    points: 15,
    sortOrder: 80,
  },
  {
    suffix: 'full_board',
    tier: 'bronze',
    title: 'Full board',
    description: 'Play a game through to the end — win or loss.',
    counter: 'word_grouping_finished_games',
    points: 10,
    sortOrder: 90,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    // Distinct from the generic `first_win`: "Solved" means the player found all 4 groups
    // themselves (a personal win), not "top of the leaderboard" — a multiplayer room can have
    // many solvers.
    suffix: 'solved',
    tier: 'silver',
    title: 'Solved',
    description: 'Find all 4 groups in a game.',
    counter: 'word_grouping_puzzles_solved',
    points: 30,
    sortOrder: 110,
  },
  {
    suffix: 'clean_half',
    tier: 'silver',
    title: 'Clean half',
    description: 'Solve the first 2 groups with zero mistakes.',
    counter: 'word_grouping_clean_half_games',
    points: 25,
    sortOrder: 120,
  },
  {
    suffix: 'hard_first',
    tier: 'silver',
    title: 'Hard first',
    description: 'Solve the purple (tier 4) group before any other group.',
    counter: 'word_grouping_hard_first_games',
    points: 30,
    sortOrder: 130,
  },
  {
    // Brief #14 "One Life" and #15 "Comeback" both describe won with 3 mistakes used — the
    // same condition worded two ways. Kept as separate trophies (the brief lists both), fed
    // by the same counter — they always fire together.
    suffix: 'one_life',
    tier: 'silver',
    title: 'One life',
    description: 'Win a game with only 1 mistake remaining.',
    counter: 'word_grouping_one_life_wins',
    points: 30,
    sortOrder: 140,
  },
  {
    suffix: 'comeback',
    tier: 'silver',
    title: 'Comeback',
    description: 'Win a game after using 3 of your 4 mistakes.',
    counter: 'word_grouping_one_life_wins',
    points: 30,
    sortOrder: 150,
  },
  {
    suffix: 'steady',
    tier: 'silver',
    title: 'Steady',
    description: 'Win 3 games (solve all 4 groups).',
    counter: 'word_grouping_puzzles_solved',
    gte: 3,
    points: 40,
    sortOrder: 160,
  },
  {
    suffix: 'full_marks_group',
    tier: 'silver',
    title: 'Full marks group',
    description: 'Solve a purple (tier 4) group.',
    counter: 'word_grouping_tier4_solved_games',
    points: 25,
    sortOrder: 170,
  },
  {
    suffix: 'no_red_herrings',
    tier: 'silver',
    title: 'No red herrings',
    description: 'Win a game without ever triggering "one away".',
    counter: 'word_grouping_no_red_herrings_wins',
    points: 35,
    sortOrder: 180,
  },
  {
    suffix: 'descending',
    tier: 'silver',
    title: 'Descending',
    description: 'Solve all 4 groups hardest-to-easiest in one game.',
    counter: 'word_grouping_descending_wins',
    points: 35,
    sortOrder: 190,
  },
  {
    // Fired from the daily-challenge submit route (`/api/daily-challenges/[gameType]/submit`),
    // which increments this counter directly + calls `syncEligibleTrophies` — the daily path
    // doesn't otherwise touch `awardForFinishedGame`.
    suffix: 'daily_player',
    tier: 'silver',
    title: 'Daily player',
    description: 'Play the Word Grouping daily challenge.',
    counter: 'word_grouping_daily_played',
    points: 20,
    sortOrder: 200,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'flawless',
    tier: 'gold',
    title: 'Flawless',
    description: 'Win a game with zero mistakes.',
    counter: 'word_grouping_flawless_wins',
    points: 50,
    sortOrder: 220,
  },
  {
    suffix: 'perfect_descent',
    tier: 'gold',
    title: 'Perfect descent',
    description: 'Win with zero mistakes, solving groups hardest-to-easiest.',
    counter: 'word_grouping_perfect_descent_wins',
    points: 60,
    sortOrder: 230,
  },
  {
    suffix: 'sharp_eye',
    tier: 'gold',
    title: 'Sharp eye',
    description: 'Win 5 flawless games.',
    counter: 'word_grouping_flawless_wins',
    gte: 5,
    points: 75,
    sortOrder: 240,
  },
  {
    // Anti-cheese from the brief: "no wrong guesses in under 60s" — enforced in the facts
    // builder by only emitting when mistakes === 0 AND finish < 60s.
    suffix: 'speed_grouper',
    tier: 'gold',
    title: 'Speed grouper',
    description: 'Win a game in under 60 seconds — with no wrong guesses.',
    counter: 'word_grouping_speed_wins',
    points: 60,
    sortOrder: 250,
  },
  {
    suffix: 'purple_hunter',
    tier: 'gold',
    title: 'Purple hunter',
    description: 'Solve the purple (tier 4) group first in 5 different games.',
    counter: 'word_grouping_hard_first_games',
    gte: 5,
    points: 70,
    sortOrder: 260,
  },
  {
    // Anti-cheese from the brief: uses distinct SUBMITTING players, not seat count, so a
    // 10-seat lobby where 3 never guessed doesn't qualify.
    suffix: 'big_room',
    tier: 'gold',
    title: 'Big room',
    description: 'Win a game with 10+ players actually taking a guess.',
    counter: 'word_grouping_big_room_wins',
    points: 60,
    sortOrder: 270,
  },
  {
    suffix: 'word_grouping_master',
    tier: 'gold',
    title: 'Word Grouping master',
    description: 'Win 25 games (solve all 4 groups).',
    counter: 'word_grouping_puzzles_solved',
    gte: 25,
    points: 150,
    sortOrder: 280,
  },
]
