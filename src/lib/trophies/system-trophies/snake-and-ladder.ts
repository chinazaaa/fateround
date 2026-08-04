import type { SystemTrophySpec } from './types'

/**
 * Snakes and Ladders — derived at finish from `snake_ladder_player_state.game_counters`
 * (accumulated in-play by `processSnakeAndLadderRoll`) and session-level data. See
 * `../game-facts/snake-and-ladder.ts`.
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "Winner" → generic `games_won`.
 *  - #15 "Snakes and Ladders Champion" → generic `games_won` Champion track.
 *  - #14 "Straight Run" (win in ≤20 turns) — needs per-player roll count which we now
 *    track, but the brief says "turns" and extra rolls from 6s complicate the definition.
 *    Implemented as rolls ≤ 20.
 *
 * 12 of the 15 briefed trophies are built.
 */
export const SNAKE_AND_LADDER: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_climb',
    tier: 'bronze',
    title: 'First climb',
    description: 'Take a ladder.',
    counter: 'snl_ladders_taken',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'bitten',
    tier: 'bronze',
    title: 'Bitten',
    description: 'Hit a snake.',
    counter: 'snl_snakes_hit',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'lucky_six',
    tier: 'bronze',
    title: 'Lucky six',
    description: 'Roll a six.',
    counter: 'snl_sixes_rolled',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'halfway',
    tier: 'bronze',
    title: 'Halfway',
    description: 'Reach square 50.',
    counter: 'snl_reached_50_games',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'double_six',
    tier: 'bronze',
    title: 'Double six',
    description: 'Roll two sixes in a row.',
    counter: 'snl_double_six_games',
    points: 15,
    sortOrder: 50,
  },
  {
    suffix: 'long_climb',
    tier: 'bronze',
    title: 'Long climb',
    description: 'Take the longest ladder on the board (28 → 84).',
    counter: 'snl_long_climb_games',
    points: 15,
    sortOrder: 60,
  },
  {
    suffix: 'overshoot',
    tier: 'bronze',
    title: 'Overshoot',
    description: 'Roll past 100 and stay put.',
    counter: 'snl_overshoots',
    points: 10,
    sortOrder: 70,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'snake_free',
    tier: 'silver',
    title: 'Snake free',
    description: 'Win without hitting a single snake.',
    counter: 'snl_snake_free_wins',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'ladder_master',
    tier: 'silver',
    title: 'Ladder master',
    description: 'Take 4 or more ladders in one game.',
    counter: 'snl_four_ladder_games',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'triple_six',
    tier: 'silver',
    title: 'Triple six',
    description: 'Forfeit a turn by rolling three sixes in a row.',
    counter: 'snl_bust_games',
    points: 25,
    sortOrder: 100,
  },
  {
    suffix: 'full_table',
    tier: 'silver',
    title: 'Full table',
    description: 'Win with 6 players.',
    counter: 'snl_full_table_wins',
    points: 30,
    sortOrder: 110,
  },
  {
    suffix: 'straight_run',
    tier: 'silver',
    title: 'Straight run',
    description: 'Win in 20 rolls or fewer.',
    counter: 'snl_straight_run_wins',
    points: 35,
    sortOrder: 120,
  },
]
