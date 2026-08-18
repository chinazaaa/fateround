import type { SystemTrophySpec } from './types'

/**
 * Multiplayer Wordle — derived at finish from `wordle_room_progress` (words solved, finished,
 * hints purchased) and `wordle_room_guesses` (first-guess solves). See
 * `../game-facts/wordle-room.ts`.
 *
 * OMITTED (covered by generic catalog):
 *  - First game / 10 / 50 finishes → generic `games_played`.
 *  - First win / 10 / 50 / 100 wins → generic `games_won` (Wordle has a resolvable winner
 *    via `getCompetitiveStandings`).
 *  - Platinum capstone → `${game}.platinum` auto-generated.
 */
export const WORDLE_ROOM: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_word',
    tier: 'bronze',
    title: 'First word',
    description: 'Solve your first Wordle word in a race.',
    counter: 'wordle_room_words_solved_total',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'perfect_solve',
    tier: 'bronze',
    title: 'Perfect solve',
    description: 'Solve a word on the very first guess.',
    counter: 'wordle_room_first_guess_solves',
    points: 15,
    sortOrder: 20,
  },
  {
    suffix: 'full_race',
    tier: 'bronze',
    title: 'Full race',
    description: 'Finish an entire Wordle race (every word).',
    counter: 'wordle_room_finished_games',
    points: 15,
    sortOrder: 30,
  },
  {
    suffix: 'naija_slang',
    tier: 'bronze',
    title: 'Naija Slang',
    description: 'Play a Wordle race on the Naija Slang category.',
    counter: 'wordle_room_naija_games',
    points: 10,
    sortOrder: 40,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'wordsmith',
    tier: 'silver',
    title: 'Wordsmith',
    description: 'Solve 100 Wordle words across your games.',
    counter: 'wordle_room_words_solved_total',
    gte: 100,
    points: 40,
    sortOrder: 50,
  },
  {
    suffix: 'clean_race',
    tier: 'silver',
    title: 'Clean race',
    description: 'Finish a full Wordle race without buying any hints.',
    counter: 'wordle_room_no_hint_finished_games',
    points: 30,
    sortOrder: 60,
  },
  {
    suffix: 'big_race',
    tier: 'silver',
    title: 'Big race',
    description: 'Finish a Wordle race in a room of 10+ players.',
    counter: 'wordle_room_big_room_wins',
    points: 35,
    sortOrder: 70,
  },
  {
    suffix: 'perfectionist',
    tier: 'silver',
    title: 'Perfectionist',
    description: 'Solve 5 Wordle words on the first guess across your games.',
    counter: 'wordle_room_first_guess_solves',
    gte: 5,
    points: 40,
    sortOrder: 80,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'marathon',
    tier: 'gold',
    title: 'Marathon',
    description: 'Finish a 20-word Wordle race with zero hints used.',
    counter: 'wordle_room_marathon_wins',
    points: 75,
    sortOrder: 100,
  },
]
