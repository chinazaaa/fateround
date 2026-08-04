import type { SystemTrophySpec } from './types'

/**
 * Ultimate Tic-Tac-Toe (`tic_tac_toe`) — derived at finish from `tic_tac_toe_sessions`. See
 * `../game-facts/tic-tac-toe.ts`.
 *
 * The full board (81 cells) and 9 sub-board winners are persisted, so we can derive move counts,
 * sub-boards won/lost, draws, and domination patterns.
 *
 * OMITTED (covered by generic catalog):
 *  - #1 "First Match" → generic `games_played`.
 *  - #7 "Draw" → emitted as a per-game flag but the generic draw track doesn't exist; kept as system.
 *  - #8 "Winner" → generic `games_won`.
 *  - #13 "Ten Games" → generic `games_played` gte 10.
 *  - #15 "Ultimate Champion" → generic `games_won` Champion track.
 *
 * 10 of the 15 briefed trophies are built.
 */
export const TIC_TAC_TOE: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'small_win',
    tier: 'bronze',
    title: 'Small win',
    description: 'Win a mini board.',
    counter: 'ttt_sub_boards_won',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'sent_away',
    tier: 'bronze',
    title: 'Sent away',
    description: 'Force your opponent into an already-won board.',
    counter: 'ttt_sent_to_won_board',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'two_boards',
    tier: 'bronze',
    title: 'Two boards',
    description: 'Win two mini boards in one game.',
    counter: 'ttt_two_boards_games',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'centre_board',
    tier: 'bronze',
    title: 'Centre board',
    description: 'Win the centre mini board.',
    counter: 'ttt_centre_board_games',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'corner_play',
    tier: 'bronze',
    title: 'Corner play',
    description: 'Win two corner mini boards in one game.',
    counter: 'ttt_two_corners_games',
    points: 15,
    sortOrder: 50,
  },
  {
    suffix: 'draw',
    tier: 'bronze',
    title: 'Draw',
    description: 'Reach a draw.',
    counter: 'ttt_draws',
    points: 10,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'clean_sweep',
    tier: 'silver',
    title: 'Clean sweep',
    description: 'Win three mini boards without losing one.',
    counter: 'ttt_clean_sweep_games',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'quick_match',
    tier: 'silver',
    title: 'Quick match',
    description: 'Win in 20 moves or fewer.',
    counter: 'ttt_quick_wins',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'diagonal',
    tier: 'silver',
    title: 'Diagonal',
    description: 'Win the game on a diagonal of mini boards.',
    counter: 'ttt_diagonal_wins',
    points: 30,
    sortOrder: 90,
  },
  {
    suffix: 'untouched',
    tier: 'silver',
    title: 'Untouched',
    description: 'Win without your opponent claiming a single mini board.',
    counter: 'ttt_untouched_wins',
    points: 35,
    sortOrder: 100,
  },
]
