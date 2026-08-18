import type { SystemTrophySpec } from './types'

/**
 * Crossword — derived at finish from `crossword_submissions`. See `../game-facts/crossword.ts`.
 *
 * Per-cell submissions with `is_correct` and `via_hint` are persisted. We can derive correct
 * cells, wrong guesses, hints used, accuracy, and grid completion.
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "Winner" → generic `games_won`.
 *  - #15 "Crossword Champion" → generic `games_won` Champion track.
 *
 * DROPPED (data not derivable):
 *  - #2 "Across" / #3 "Down" — submissions are per-cell, not per-word; direction requires
 *    puzzle metadata reconstruction that the facts builder can't reliably do.
 *  - #4 "Crosser" — same cell-vs-word problem.
 *  - #11 "Long Word" — word boundaries not derivable from cells alone.
 *  - #13 "Comeback" — no halfway-point scoring persisted.
 *
 * 9 of the 15 briefed trophies are built.
 */
export const CROSSWORD: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_clue',
    tier: 'bronze',
    title: 'First clue',
    description: 'Solve your first correct cell.',
    counter: 'crossword_correct_cells',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'ten_cells',
    tier: 'bronze',
    title: 'Ten cells',
    description: 'Solve 10 correct cells in one game.',
    counter: 'crossword_ten_cells_games',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'themed',
    tier: 'bronze',
    title: 'Themed',
    description: 'Play a themed crossword puzzle.',
    counter: 'crossword_themed_games',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'quick_fill',
    tier: 'bronze',
    title: 'Quick fill',
    description: 'Solve 3 correct cells in the first 30 seconds.',
    counter: 'crossword_quick_fill_games',
    points: 15,
    sortOrder: 40,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'full_grid',
    tier: 'silver',
    title: 'Full grid',
    description: 'Solve every cell in a puzzle.',
    counter: 'crossword_full_grid_games',
    points: 25,
    sortOrder: 50,
  },
  {
    suffix: 'no_hints',
    tier: 'silver',
    title: 'No hints',
    description: 'Complete a puzzle without using any hints.',
    counter: 'crossword_no_hint_completions',
    points: 25,
    sortOrder: 60,
  },
  {
    suffix: 'clean_sweep',
    tier: 'silver',
    title: 'Clean sweep',
    description: 'Solve every cell without a single wrong entry.',
    counter: 'crossword_clean_sweep_games',
    points: 30,
    sortOrder: 70,
  },
  {
    suffix: 'big_race',
    tier: 'silver',
    title: 'Big race',
    description: 'Play with 10 or more players.',
    counter: 'crossword_big_room_games',
    points: 25,
    sortOrder: 80,
  },
  {
    suffix: 'twenty_cells',
    tier: 'silver',
    title: 'Twenty cells',
    description: 'Solve 20 correct cells in one game.',
    counter: 'crossword_twenty_cells_games',
    points: 30,
    sortOrder: 90,
  },
]
