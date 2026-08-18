import type { SystemTrophySpec } from './types'

/**
 * Sudoku — derived at finish from `sudoku_submissions`. See `../game-facts/sudoku.ts`.
 *
 * Per-cell submissions with `is_correct`, `points_awarded`, and `submitted_at` are persisted.
 * Ranked scoring awards 10/6/4/2 points for 1st/2nd/3rd/4th+ correct per cell, -3 for wrong.
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "Winner" → generic `games_won`.
 *  - #15 "Sudoku Champion" → generic `games_won` Champion track.
 *
 * DROPPED:
 *  - #3 "Note Taker" — pencil marks are client-only, not persisted.
 *  - #12 "Comeback" — no halfway scoring persisted.
 *
 * 11 of the 15 briefed trophies are built.
 */
export const SUDOKU: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_cell',
    tier: 'bronze',
    title: 'First cell',
    description: 'Solve your first correct cell.',
    counter: 'sudoku_correct_cells',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'ten_cells',
    tier: 'bronze',
    title: 'Ten cells',
    description: 'Solve 10 correct cells in one game.',
    counter: 'sudoku_ten_cells_games',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'clean_ten',
    tier: 'bronze',
    title: 'Clean ten',
    description: 'Solve 10 correct cells with no errors.',
    counter: 'sudoku_clean_ten_games',
    points: 15,
    sortOrder: 30,
  },
  {
    suffix: 'row_master',
    tier: 'bronze',
    title: 'Row master',
    description: 'Complete a full row (all 9 cells in one row correct).',
    counter: 'sudoku_row_complete_games',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'box_master',
    tier: 'bronze',
    title: 'Box master',
    description: 'Complete a 3x3 box (all 9 cells in one box correct).',
    counter: 'sudoku_box_complete_games',
    points: 15,
    sortOrder: 50,
  },
  {
    suffix: 'century',
    tier: 'bronze',
    title: 'Century',
    description: 'Score 100 or more points in one game.',
    counter: 'sudoku_century_games',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'flawless',
    tier: 'silver',
    title: 'Flawless',
    description: 'Finish a puzzle with zero wrong submissions.',
    counter: 'sudoku_flawless_games',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'speed_solver',
    tier: 'silver',
    title: 'Speed solver',
    description: 'Claim 5 cells in 30 seconds.',
    counter: 'sudoku_speed_solver_games',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'half_the_grid',
    tier: 'silver',
    title: 'Half the grid',
    description: 'Claim 50% or more of the open cells.',
    counter: 'sudoku_half_grid_games',
    points: 30,
    sortOrder: 90,
  },
  {
    suffix: 'big_race',
    tier: 'silver',
    title: 'Big race',
    description: 'Play with 10 or more players.',
    counter: 'sudoku_big_room_games',
    points: 25,
    sortOrder: 100,
  },
  {
    suffix: 'perfect_race',
    tier: 'silver',
    title: 'Perfect race',
    description: 'Win with 100% accuracy (no wrong submissions).',
    counter: 'sudoku_perfect_race_wins',
    points: 35,
    sortOrder: 110,
  },
]
