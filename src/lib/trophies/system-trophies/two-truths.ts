import type { SystemTrophySpec } from './types'

/**
 * Two Truths and a Lie (`two_truths`) — derived at finish from `ttl_statements` and `ttl_guesses`.
 * See `../game-facts/two-truths.ts`.
 *
 * This game is WINNERLESS BY DESIGN (in NO_WINNER_BY_DESIGN set in outcome.ts), so no win-gated
 * trophies. All trophies are participation/skill based: guessing correctly and fooling others.
 *
 * OMITTED (covered by generic catalog):
 *  - #1 "First Round" → generic `games_played`.
 *
 * 13 of the 15 briefed trophies are built (no Champion track since game has no win).
 */
export const TWO_TRUTHS: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_guess',
    tier: 'bronze',
    title: 'First guess',
    description: "Correctly guess someone's lie.",
    counter: 'ttl_correct_guesses',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'hot_seat',
    tier: 'bronze',
    title: 'In the hot seat',
    description: 'Take your turn as the subject.',
    counter: 'ttl_times_as_subject',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'fooled_someone',
    tier: 'bronze',
    title: 'Fooled someone',
    description: 'Get at least one wrong guess against your lie.',
    counter: 'ttl_fooled_someone_games',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'three_correct',
    tier: 'bronze',
    title: 'Three correct',
    description: 'Guess correctly 3 times in one game.',
    counter: 'ttl_three_correct_games',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'full_table',
    tier: 'bronze',
    title: 'Full table',
    description: 'Play a game with 6 or more players.',
    counter: 'ttl_big_room_6_games',
    points: 10,
    sortOrder: 50,
  },
  {
    suffix: 'sharp_eye',
    tier: 'bronze',
    title: 'Sharp eye',
    description: 'Guess correctly on your first attempt of the game.',
    counter: 'ttl_sharp_eye_games',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'master_deceiver',
    tier: 'silver',
    title: 'Master deceiver',
    description: 'Fool the entire group with your lie (nobody guesses correctly).',
    counter: 'ttl_master_deceiver_games',
    points: 30,
    sortOrder: 70,
  },
  {
    suffix: 'five_correct',
    tier: 'silver',
    title: 'Five correct',
    description: 'Guess correctly 5 times in one game.',
    counter: 'ttl_five_correct_games',
    points: 25,
    sortOrder: 80,
  },
  {
    suffix: 'unreadable',
    tier: 'silver',
    title: 'Unreadable',
    description: 'Fool the group in two separate rounds of the same game.',
    counter: 'ttl_unreadable_games',
    points: 30,
    sortOrder: 90,
  },
  {
    suffix: 'perfect_read',
    tier: 'silver',
    title: 'Perfect read',
    description: 'Guess correctly every single round of a game.',
    counter: 'ttl_perfect_read_games',
    points: 35,
    sortOrder: 100,
  },
  {
    suffix: 'big_group',
    tier: 'silver',
    title: 'Big group',
    description: 'Play a game with 10 or more players.',
    counter: 'ttl_big_room_10_games',
    points: 25,
    sortOrder: 110,
  },
  {
    suffix: 'double_threat',
    tier: 'silver',
    title: 'Double threat',
    description: 'Fool the group with your lie and guess every other round correctly.',
    counter: 'ttl_double_threat_games',
    points: 35,
    sortOrder: 120,
  },
  {
    suffix: 'fifty_guesses',
    tier: 'silver',
    title: 'Fifty guesses',
    description: 'Make 50 correct guesses across all games.',
    counter: 'ttl_correct_guesses',
    gte: 50,
    points: 30,
    sortOrder: 130,
  },
]
