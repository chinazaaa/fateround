import type { SystemTrophySpec } from './types'

/**
 * Quick Draw — derived at finish from the rows each variant already writes.
 * See `../game-facts/quick-draw.ts` for where every counter comes from.
 *
 * ONE GAME TYPE, TWO RULE SETS. `lie` (draw a prompt, everyone writes decoy titles, the room
 * votes for the real one) and `guess` (one drawer, the rest race to type the word) share no
 * tables. Trophies are therefore split into a lie track and a guess track: a player who only
 * ever plays one variant simply never earns the other's, exactly as the counters behave. The
 * two are balanced against each other so neither track is the cheap one.
 *
 * OMITTED (covered by the generic catalog):
 *  - "Play a game" / "Play ten games" → generic `games_played`.
 *  - First win / games won → generic outcome track.
 *
 * OMITTED (data cannot honestly support it — see the facts builder):
 *  - Any speed trophy. No variant persists when a turn's clock started.
 *  - Any stroke-count / colour-use trophy. Walking every drawing's stroke JSON at finish
 *    would multiply the award pass's cost for a cosmetic award.
 */
export const QUICK_DRAW: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_drawing',
    tier: 'bronze',
    title: 'Pencils down',
    description: 'Submit your first drawing.',
    counter: 'quick_draw_drawings_submitted',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'first_fool',
    tier: 'bronze',
    title: 'Gotcha',
    description: 'Fool someone into voting for your fake title.',
    counter: 'quick_draw_fools',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'first_read',
    tier: 'bronze',
    title: 'Good eye',
    description: 'Pick the real title for a drawing.',
    counter: 'quick_draw_correct_reads',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'first_word_guessed',
    tier: 'bronze',
    title: 'Got it',
    description: 'Be the first to guess a word in guess mode.',
    counter: 'quick_draw_words_guessed',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'took_the_pen',
    tier: 'bronze',
    title: 'Took the pen',
    description: 'Take a drawing turn in guess mode.',
    counter: 'quick_draw_drawer_turns',
    points: 10,
    sortOrder: 50,
  },
  {
    suffix: 'full_lobby',
    tier: 'bronze',
    title: 'Full table',
    description: 'Play a game with 6 or more players.',
    counter: 'quick_draw_full_lobby_games',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'triple_fool',
    tier: 'silver',
    title: 'Master forger',
    description: 'Fool 3 people across one game with your fake titles.',
    counter: 'quick_draw_triple_fool_games',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'mass_fool',
    tier: 'silver',
    title: 'Whole room fooled',
    description: 'Catch 3 voters with a single fake title.',
    counter: 'quick_draw_mass_fool_games',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'unmistakable',
    tier: 'silver',
    title: 'Unmistakable',
    description: 'Draw something so clear that every voter found the real title.',
    counter: 'quick_draw_unmistakable_games',
    points: 30,
    sortOrder: 90,
  },
  {
    suffix: 'perfect_voter',
    tier: 'silver',
    title: 'Never fooled',
    description: 'Vote on 3 or more drawings in a game and get every one right.',
    counter: 'quick_draw_perfect_voter_games',
    points: 30,
    sortOrder: 100,
  },
  {
    suffix: 'five_guesses',
    tier: 'silver',
    title: 'On a roll',
    description: 'Guess 5 words in one game.',
    counter: 'quick_draw_five_guess_games',
    points: 25,
    sortOrder: 110,
  },
  {
    suffix: 'flawless_turn',
    tier: 'silver',
    title: 'Flawless turn',
    description: 'Draw a turn of 3 or more words and have every one of them guessed.',
    counter: 'quick_draw_flawless_turn_games',
    points: 35,
    sortOrder: 120,
  },
  {
    suffix: 'trigger_happy',
    tier: 'silver',
    title: 'Trigger happy',
    description: 'Type 20 guesses in a single game.',
    counter: 'quick_draw_twenty_guess_games',
    points: 20,
    sortOrder: 130,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'fifty_fools',
    tier: 'gold',
    title: 'Career con artist',
    description: 'Fool 50 people with fake titles across all your games.',
    counter: 'quick_draw_fools',
    gte: 50,
    points: 50,
    sortOrder: 140,
  },
  {
    suffix: 'fifty_reads',
    tier: 'gold',
    title: 'Lie detector',
    description: 'Pick the real title 50 times across all your games.',
    counter: 'quick_draw_correct_reads',
    gte: 50,
    points: 50,
    sortOrder: 150,
  },
  {
    suffix: 'hundred_words_guessed',
    tier: 'gold',
    title: 'Mind reader',
    description: 'Guess 100 words across all your games.',
    counter: 'quick_draw_words_guessed',
    gte: 100,
    points: 50,
    sortOrder: 160,
  },
  {
    suffix: 'hundred_words_landed',
    tier: 'gold',
    title: 'Worth a thousand words',
    description: 'Have 100 of the words you drew guessed across all your games.',
    counter: 'quick_draw_words_landed',
    gte: 100,
    points: 50,
    sortOrder: 170,
  },
]
