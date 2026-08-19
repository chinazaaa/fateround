import type { SystemTrophySpec } from './types'

/**
 * Landmine — derived at finish from `landmine_answers` and `landmine_marks`. See
 * `../game-facts/landmine.ts`.
 *
 * Per-round answers with outcome (valid/original/void/mine/empty), mine_hit, is_original,
 * and points. Marks record peer validation.
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "Winner" → generic `games_won` (once winner resolution is added).
 *  - #14 "Ten Games" → generic `games_played` gte 10.
 *  - #15 "Landmine Champion" → generic `games_won` Champion track.
 *
 * NOTE: landmine has no winner resolution in outcome.ts. Win-based generics won't fire until
 * one is added.
 *
 * 11 of the 15 briefed trophies are built.
 */
export const LANDMINE: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_answer',
    tier: 'bronze',
    title: 'First answer',
    description: 'Submit your first answer.',
    counter: 'landmine_answers_total',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'survived',
    tier: 'bronze',
    title: 'Survived',
    description: 'Survive a round without hitting the mine.',
    counter: 'landmine_safe_rounds',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'marked',
    tier: 'bronze',
    title: 'Marked',
    description: "Mark another player's answer.",
    counter: 'landmine_marks_given',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'unique',
    tier: 'bronze',
    title: 'Unique',
    description: 'Score an original (unique) answer.',
    counter: 'landmine_original_answers',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'blown_up',
    tier: 'bronze',
    title: 'Blown up',
    description: 'Hit the mine (badge of shame).',
    counter: 'landmine_mine_hits',
    points: 10,
    sortOrder: 50,
  },
  {
    suffix: 'three_clean',
    tier: 'bronze',
    title: 'Three clean',
    description: 'Survive three rounds without hitting the mine.',
    counter: 'landmine_three_clean_games',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'minesweeper',
    tier: 'silver',
    title: 'Minesweeper',
    description: 'Complete an entire game without hitting the mine.',
    counter: 'landmine_minesweeper_games',
    points: 30,
    sortOrder: 70,
  },
  {
    suffix: 'original_thinker',
    tier: 'silver',
    title: 'Original thinker',
    description: 'Score an original answer in 5 or more rounds of one game.',
    counter: 'landmine_original_thinker_games',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'big_room',
    tier: 'silver',
    title: 'Big room',
    description: 'Play in a room with 8 or more players.',
    counter: 'landmine_big_room_games',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'perfect_game',
    tier: 'silver',
    title: 'Perfect game',
    description: 'Finish a game with every answer valid and at least one original.',
    counter: 'landmine_perfect_games',
    points: 35,
    sortOrder: 100,
  },
  {
    suffix: 'voided',
    tier: 'silver',
    title: 'Voided',
    description: 'Have an answer marked void.',
    counter: 'landmine_voided_answers',
    points: 10,
    sortOrder: 110,
  },
]
