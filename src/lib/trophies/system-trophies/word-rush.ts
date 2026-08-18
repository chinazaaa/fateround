import type { SystemTrophySpec } from './types'
import { allOf, counterCrit } from './types'

/**
 * Word Rush — derived at finish from `word_rush_players` and `word_rush_answers`. See
 * `../game-facts/word-rush.ts`.
 *
 * Two modes: team (rotating turns, first correct per turn scores) and individual (all answer,
 * speed+length scoring). Two prompt modes: automatic and manual.
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "Winner" → generic `games_won` (once winner resolution is added).
 *  - #15 "Word Rush Champion" → generic `games_won` Champion track.
 *
 * NOTE: word_rush has no winner resolution in outcome.ts.
 *
 * 12 of the 15 briefed trophies are built.
 */
export const WORD_RUSH: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_word',
    tier: 'bronze',
    title: 'First word',
    description: 'Submit your first valid word.',
    counter: 'word_rush_correct_answers',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'team_rush',
    tier: 'bronze',
    title: 'Team rush',
    description: 'Play in team mode.',
    counter: 'word_rush_team_games',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'solo_round',
    tier: 'bronze',
    title: 'Solo round',
    description: 'Play in individual mode.',
    counter: 'word_rush_individual_games',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'five_words',
    tier: 'bronze',
    title: 'Five words',
    description: 'Submit 5 valid words in one game.',
    counter: 'word_rush_five_correct_games',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'manual_mode',
    tier: 'bronze',
    title: 'Manual mode',
    description: 'Play a round with manually-set letters.',
    counter: 'word_rush_manual_games',
    points: 10,
    sortOrder: 50,
  },
  {
    suffix: 'auto_mode',
    tier: 'bronze',
    title: 'Auto mode',
    description: 'Play a round with automatic letter prompts.',
    counter: 'word_rush_auto_games',
    points: 10,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'ten_words',
    tier: 'silver',
    title: 'Ten words',
    description: 'Submit 10 valid words in one game.',
    counter: 'word_rush_ten_correct_games',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'no_misses',
    tier: 'silver',
    title: 'No misses',
    description: 'Finish a game with zero invalid submissions.',
    counter: 'word_rush_no_misses_games',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'long_answer',
    tier: 'silver',
    title: 'Long answer',
    description: 'Submit a valid word of 8 or more letters.',
    counter: 'word_rush_long_word_answers',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'both_modes',
    tier: 'silver',
    title: 'Both modes',
    description: 'Play in both team and individual mode.',
    criteria: allOf(
      counterCrit('word_rush_team_games', 1, 'word_rush'),
      counterCrit('word_rush_individual_games', 1, 'word_rush')
    ),
    points: 25,
    sortOrder: 100,
  },
  {
    suffix: 'fifty_words',
    tier: 'silver',
    title: 'Fifty words',
    description: 'Submit 50 valid words across all games.',
    counter: 'word_rush_correct_answers',
    gte: 50,
    points: 30,
    sortOrder: 110,
  },
  {
    suffix: 'twenty_words',
    tier: 'silver',
    title: 'Twenty words',
    description: 'Submit 20 valid words in one game.',
    counter: 'word_rush_twenty_correct_games',
    points: 35,
    sortOrder: 120,
  },
]
