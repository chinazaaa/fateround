import type { SystemTrophySpec } from './types'

/**
 * Quiplash — derived at finish from `quiplash_answers`, `quiplash_battles`, and `quiplash_votes`.
 * See `../game-facts/quiplash.ts`.
 *
 * Rich battle data: each battle has two answers, vote counts, a winner, and points. We can
 * derive battle wins, unanimous wins (quiplash), total points, and answer streaks.
 *
 * OMITTED (covered by generic catalog):
 *  - #5 "Full Game" (play a game) → generic `games_played`.
 *  - #14 "Ten Games" → generic `games_played` gte 10.
 *
 * NOTE: quiplash has no winner resolution in outcome.ts. The generic first_win / games_won
 * track won't fire until one is added. Battle-based trophies still work.
 *
 * 12 of the 15 briefed trophies are built.
 */
export const QUIPLASH: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_answer',
    tier: 'bronze',
    title: 'First answer',
    description: 'Submit your first answer.',
    counter: 'quiplash_answers_submitted',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'won_a_battle',
    tier: 'bronze',
    title: 'Won a battle',
    description: 'Win your first battle.',
    counter: 'quiplash_battle_wins',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'three_battles',
    tier: 'bronze',
    title: 'Three battles',
    description: 'Win 3 battles in one game.',
    counter: 'quiplash_three_battle_games',
    points: 15,
    sortOrder: 30,
  },
  {
    suffix: 'voted_every_round',
    tier: 'bronze',
    title: 'Voted every round',
    description: 'Vote in every battle of a game.',
    counter: 'quiplash_full_voter_games',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'beat_the_clock',
    tier: 'bronze',
    title: 'Beat the clock',
    description: 'Submit all your answers before time runs out.',
    counter: 'quiplash_all_answers_submitted_games',
    points: 10,
    sortOrder: 50,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'quiplash',
    tier: 'silver',
    title: 'Landslide',
    description: 'Win a battle unanimously (every voter picks your answer).',
    counter: 'quiplash_unanimous_wins',
    points: 30,
    sortOrder: 60,
  },
  {
    suffix: 'undefeated',
    tier: 'silver',
    title: 'Undefeated',
    description: 'Win every battle you fought in a game.',
    counter: 'quiplash_undefeated_games',
    points: 35,
    sortOrder: 70,
  },
  {
    suffix: 'full_lobby',
    tier: 'silver',
    title: 'Full lobby',
    description: 'Play in a game with 6 players.',
    counter: 'quiplash_full_lobby_games',
    points: 25,
    sortOrder: 80,
  },
  {
    suffix: 'double_quiplash',
    tier: 'silver',
    title: 'Double quiplash',
    description: 'Win two battles unanimously in one game.',
    counter: 'quiplash_double_unanimous_games',
    points: 35,
    sortOrder: 90,
  },
  {
    suffix: 'crowd_pleaser',
    tier: 'silver',
    title: 'Crowd pleaser',
    description: 'Receive 10 or more total votes across all your battles in one game.',
    counter: 'quiplash_ten_votes_games',
    points: 25,
    sortOrder: 100,
  },
  {
    suffix: 'comeback',
    tier: 'silver',
    title: 'Comeback',
    description: 'Win a battle after losing your previous one.',
    counter: 'quiplash_comeback_games',
    points: 25,
    sortOrder: 110,
  },
  {
    suffix: 'fifty_battles',
    tier: 'silver',
    title: 'Fifty battles',
    description: 'Win 50 battles across all games.',
    counter: 'quiplash_battle_wins',
    gte: 50,
    points: 30,
    sortOrder: 120,
  },
]
