import type { SystemTrophySpec } from './types'

/**
 * I Call On / NPAT (`i_call_on`) — derived at finish from `npat_answers` and `npat_marks`. See
 * `../game-facts/i-call-on.ts`.
 *
 * 5 categories (Name, Animal, Place, Thing, Food) per round. Duplicate answers get 5 points,
 * unique valid answers get 10 points. Peer marking validates answers.
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "Winner" → generic `games_won` (once winner resolution is added).
 *  - #15 "I Call On Champion" → generic `games_won` Champion track.
 *
 * NOTE: i_call_on has no winner resolution in outcome.ts.
 *
 * 12 of the 15 briefed trophies are built.
 */
export const I_CALL_ON: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_round',
    tier: 'bronze',
    title: 'First round',
    description: 'Complete your first letter round.',
    counter: 'npat_rounds_played',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'caller',
    tier: 'bronze',
    title: 'Caller',
    description: 'Call a letter as the picker.',
    counter: 'npat_times_as_caller',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'five_categories',
    tier: 'bronze',
    title: 'Five categories',
    description: 'Fill all 5 categories in one round.',
    counter: 'npat_five_filled_rounds',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'unique_answer',
    tier: 'bronze',
    title: 'Unique',
    description: 'Score a 10-point unique answer.',
    counter: 'npat_unique_answers',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'reviewer',
    tier: 'bronze',
    title: 'Reviewer',
    description: "Mark another player's sheet.",
    counter: 'npat_marks_given',
    points: 10,
    sortOrder: 50,
  },
  {
    suffix: 'three_rounds',
    tier: 'bronze',
    title: 'Three rounds',
    description: 'Complete 3 letter rounds in one game.',
    counter: 'npat_three_rounds_games',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'clean_sweep',
    tier: 'silver',
    title: 'Clean sweep',
    description: 'Score unique (10 points) in all 5 categories in one round.',
    counter: 'npat_clean_sweep_rounds',
    points: 30,
    sortOrder: 70,
  },
  {
    suffix: 'five_rounds',
    tier: 'silver',
    title: 'Five rounds',
    description: 'Complete 5 letter rounds in one game.',
    counter: 'npat_five_rounds_games',
    points: 25,
    sortOrder: 80,
  },
  {
    suffix: 'no_voids',
    tier: 'silver',
    title: 'No voids',
    description: 'Finish a game with zero answers marked invalid.',
    counter: 'npat_no_voids_games',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'original_thinker',
    tier: 'silver',
    title: 'Original thinker',
    description: 'Score unique answers in 3 rounds in a row.',
    counter: 'npat_original_streak_3_games',
    points: 30,
    sortOrder: 100,
  },
  {
    suffix: 'big_table',
    tier: 'silver',
    title: 'Big table',
    description: 'Play with 8 or more players.',
    counter: 'npat_big_room_games',
    points: 25,
    sortOrder: 110,
  },
  {
    suffix: 'perfect_fifty',
    tier: 'silver',
    title: 'Perfect fifty',
    description: 'Score the maximum 50 points in a single round.',
    counter: 'npat_perfect_fifty_rounds',
    points: 35,
    sortOrder: 120,
  },
]
