import type { SystemTrophySpec } from './types'

/**
 * Matching Pairs (`matching_pairs`) — derived at finish from `memory_match_submissions` and
 * `memory_match_progress`. See `../game-facts/matching-pairs.ts`.
 *
 * Rich per-flip data: pair_index, is_match, streak_at_time, points_after, plus progress table
 * with pairs_matched, wrong_attempts, finish_rank, finished_at.
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "First Place" → generic `games_won` (once winner resolution is added).
 *  - #15 "Matching Champion" → generic `games_won` Champion track.
 *
 * NOTE: matching_pairs has no winner resolution in outcome.ts. The generic first_win / games_won
 * track won't fire until one is added. Score-based trophies still work.
 *
 * 13 of the 15 briefed trophies are built.
 */
export const MATCHING_PAIRS: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_pair',
    tier: 'bronze',
    title: 'First pair',
    description: 'Match your first pair.',
    counter: 'matching_pairs_matched',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'five_pairs',
    tier: 'bronze',
    title: 'Five pairs',
    description: 'Match 5 pairs in one game.',
    counter: 'matching_five_pairs_games',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'streak_3',
    tier: 'bronze',
    title: 'Streak',
    description: 'Match 3 pairs in a row without a miss.',
    counter: 'matching_streak_3_games',
    points: 15,
    sortOrder: 30,
  },
  {
    suffix: 'full_board',
    tier: 'bronze',
    title: 'Full board',
    description: 'Complete your entire board.',
    counter: 'matching_full_board_games',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'ten_thousand',
    tier: 'bronze',
    title: 'Ten thousand',
    description: 'Score 10,000 or more points in one game.',
    counter: 'matching_ten_thousand_games',
    points: 15,
    sortOrder: 50,
  },
  {
    suffix: 'quick_six',
    tier: 'bronze',
    title: 'Quick six',
    description: 'Match 6 pairs in 30 seconds.',
    counter: 'matching_quick_six_games',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'streak_6',
    tier: 'silver',
    title: 'Double streak',
    description: 'Match 6 pairs in a row without a miss.',
    counter: 'matching_streak_6_games',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'perfect_game',
    tier: 'silver',
    title: 'Perfect game',
    description: 'Complete a board with zero misses.',
    counter: 'matching_perfect_games',
    points: 35,
    sortOrder: 80,
  },
  {
    suffix: 'big_board',
    tier: 'silver',
    title: 'Big board',
    description: 'Complete a 16-pair (32-card) board.',
    counter: 'matching_big_board_games',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'streak_9',
    tier: 'silver',
    title: 'Triple streak',
    description: 'Match 9 pairs in a row without a miss.',
    counter: 'matching_streak_9_games',
    points: 35,
    sortOrder: 100,
  },
  {
    suffix: 'podium',
    tier: 'silver',
    title: 'Podium',
    description: 'Finish in the top 3.',
    counter: 'matching_podium_finishes',
    points: 25,
    sortOrder: 110,
  },
  {
    suffix: 'twenty_thousand',
    tier: 'silver',
    title: 'Twenty thousand',
    description: 'Score 20,000 or more points in one game.',
    counter: 'matching_twenty_thousand_games',
    points: 30,
    sortOrder: 120,
  },
  {
    suffix: 'fifty_pairs',
    tier: 'silver',
    title: 'Fifty pairs',
    description: 'Match 50 pairs across all games.',
    counter: 'matching_pairs_matched',
    gte: 50,
    points: 30,
    sortOrder: 130,
  },
]
