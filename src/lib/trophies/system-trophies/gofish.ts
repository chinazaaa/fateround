import type { SystemTrophySpec } from './types'

/**
 * Go Fish — derived at finish from `gofish_sessions.event_log` and
 * `gofish_player_hands.books`. See `../game-facts/gofish.ts`.
 *
 * OMITTED (covered by generic catalog):
 *  - "Winner" / "Champion" → generic `games_won` templates.
 */
export const GOFISH: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_book',
    tier: 'bronze',
    title: 'First book',
    description: 'Complete your first book (all four of a rank).',
    counter: 'gofish_books_completed',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'sharp_shooter',
    tier: 'bronze',
    title: 'Sharp shooter',
    description: 'Land 10 successful asks.',
    counter: 'gofish_successful_asks',
    gte: 10,
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'go_fish',
    tier: 'bronze',
    title: 'Go Fish!',
    description: 'Draw from the ocean at least 10 times.',
    counter: 'gofish_go_fish_draws',
    gte: 10,
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'lucky',
    tier: 'bronze',
    title: 'Lucky draw',
    description: 'Pull the exact rank you asked for from the ocean.',
    counter: 'gofish_lucky_draws',
    points: 15,
    sortOrder: 40,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'four_books',
    tier: 'silver',
    title: 'Full library',
    description: 'Collect 4 or more books in a single game.',
    counter: 'gofish_four_book_games',
    points: 25,
    sortOrder: 50,
  },
  {
    suffix: 'twenty_five_books',
    tier: 'silver',
    title: 'Twenty-five books',
    description: 'Complete 25 books across all your Go Fish games.',
    counter: 'gofish_books_completed',
    gte: 25,
    points: 30,
    sortOrder: 60,
  },
  {
    suffix: 'fifty_asks',
    tier: 'silver',
    title: 'Interrogator',
    description: 'Land 50 successful asks.',
    counter: 'gofish_successful_asks',
    gte: 50,
    points: 30,
    sortOrder: 70,
  },
  {
    suffix: 'big_room_win',
    tier: 'silver',
    title: 'Big-room angler',
    description: 'Win a Go Fish game with 5 or more players at the table.',
    counter: 'gofish_big_room_wins',
    points: 25,
    sortOrder: 80,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'seven_books',
    tier: 'gold',
    title: 'Book hoarder',
    description: 'Collect 7 or more books in a single game.',
    counter: 'gofish_seven_book_games',
    points: 50,
    sortOrder: 90,
  },
  {
    suffix: 'dominant_win',
    tier: 'gold',
    title: 'Dominant hand',
    description: 'Win a game with 7 or more books.',
    counter: 'gofish_dominant_wins',
    points: 50,
    sortOrder: 100,
  },
  {
    suffix: 'clean_sweep',
    tier: 'gold',
    title: 'Clean sweep',
    description: 'Win a game without missing a single ask.',
    counter: 'gofish_no_miss_wins',
    points: 60,
    sortOrder: 110,
  },
]
