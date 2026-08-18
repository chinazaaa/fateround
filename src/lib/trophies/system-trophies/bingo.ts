import type { SystemTrophySpec } from './types'

/**
 * Bingo — derived at finish from `bingo_cards`, `bingo_claims`, and `bingo_called_numbers`. See
 * `../game-facts/bingo.ts`.
 *
 * Bingo is single-winner: the first approved claim wins. Cards persist marked_indices and cells.
 * Called numbers have timestamps. Claims record pattern (line vs full_house).
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "BINGO!" (win a game) → generic `games_won`.
 *  - #15 "Bingo Champion" → generic `games_won` Champion track.
 *
 * DROPPED:
 *  - #6 "Caller" / #10 "Fast Caller" (host games) — host has only spectator row; can't fire.
 *  - #13 "Photo Finish" (win on last number before another player) — need timing precision
 *    that claims don't have; only one claim can be approved.
 *
 * 10 of the 15 briefed trophies are built.
 */
export const BINGO: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_mark',
    tier: 'bronze',
    title: 'First mark',
    description: 'Mark a called number on your card.',
    counter: 'bingo_marks_made',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'free_space',
    tier: 'bronze',
    title: 'Free space',
    description: 'Use the centre free space in a win.',
    counter: 'bingo_free_space_wins',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'four_in_a_row',
    tier: 'bronze',
    title: 'Four in a row',
    description: 'Mark 4 cells in one line (row, column, or diagonal).',
    counter: 'bingo_four_in_row_games',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'full_column',
    tier: 'bronze',
    title: 'Full column',
    description: 'Complete an entire column on your card.',
    counter: 'bingo_full_column_games',
    points: 15,
    sortOrder: 40,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'diagonal',
    tier: 'silver',
    title: 'Diagonal',
    description: 'Win on a diagonal line.',
    counter: 'bingo_diagonal_wins',
    points: 25,
    sortOrder: 50,
  },
  {
    suffix: 'big_room',
    tier: 'silver',
    title: 'Big room',
    description: 'Play in a room with 20 or more players.',
    counter: 'bingo_big_room_games',
    points: 25,
    sortOrder: 60,
  },
  {
    suffix: 'under_twenty',
    tier: 'silver',
    title: 'Under twenty',
    description: 'Win with 20 or fewer numbers called.',
    counter: 'bingo_under_twenty_wins',
    points: 30,
    sortOrder: 70,
  },
  {
    suffix: 'double_line',
    tier: 'silver',
    title: 'Double line',
    description: 'Have two completed lines at the time you win.',
    counter: 'bingo_double_line_wins',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'lucky_fifteen',
    tier: 'silver',
    title: 'Lucky fifteen',
    description: 'Win with 15 or fewer numbers called.',
    counter: 'bingo_under_fifteen_wins',
    points: 35,
    sortOrder: 90,
  },
  {
    suffix: 'full_house',
    tier: 'silver',
    title: 'Full house',
    description: 'Win with a full house (every cell marked).',
    counter: 'bingo_full_house_wins',
    points: 30,
    sortOrder: 100,
  },
]
