import type { SystemTrophySpec } from './types'

/**
 * Text Charades (`describe_it`) — derived entirely at finish from the word and guess logs. See
 * `../game-facts/describe-it.ts`.
 *
 * Ordered bronze → platinum; thresholds are the brief's. Where the data can't honestly support a
 * trophy it is absent rather than approximated, and each omission is recorded here so the gap is a
 * decision, not an oversight:
 *
 *   - #3  On the Board (finish a game)      → the generic `games_played` track already covers it.
 *   - #11 Winner / #30 Champion track       → the generic `games_won` track already covers it.
 *   - #17 Ten Games (play 10)               → generic `games_played`, threshold 10.
 *   - #6  Quickfire, #13 Speed Describer,
 *         #25 Lightning (all timing)        → per-word start time isn't persisted for past turns;
 *                                              the only speed signal is individual-mode `points`,
 *                                              whose decay window's start can't be recovered, and
 *                                              team mode stores no timing at all. Can't be honest.
 *   - #26 Host (host 10 games)              → a non-playing host has only a spectator row the award
 *                                              pass refuses, so the counter could never fire.
 *   - #28 Both Sides (5 top-describer AND
 *         5 top-guesser wins)               → a conjunction of two lifetime counts; the single
 *                                              `counter >= n` DSL can't express it, and the role
 *                                              leaderboards are individual-mode only besides.
 *
 * 21 of the 30 briefed trophies are built. Team-shaped ones (Team Player, Clean Sweep, Flawless,
 * the describer round counts) simply never fire in individual play, where the data can't reach
 * their thresholds — no explicit mode gate needed.
 */
export const DESCRIBE_IT: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_clue',
    tier: 'bronze',
    title: 'First clue',
    description: 'Take the describer role for the first time.',
    counter: 'describe_it_describer_turns',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'got_it',
    tier: 'bronze',
    title: 'Got it',
    description: 'Guess a word correctly.',
    counter: 'describe_it_words_guessed',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'describer',
    tier: 'bronze',
    title: 'Describer',
    description: 'Take the describer role three times.',
    counter: 'describe_it_describer_turns',
    gte: 3,
    points: 15,
    sortOrder: 30,
  },
  {
    suffix: 'team_player',
    tier: 'bronze',
    title: 'Team player',
    description: 'Play on a team of three or more.',
    counter: 'describe_it_big_team_games',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'custom_words',
    tier: 'bronze',
    title: 'Custom words',
    description: 'Play a game using an uploaded word list.',
    counter: 'describe_it_custom_set_games',
    points: 10,
    sortOrder: 50,
  },
  {
    suffix: 'hat_trick',
    tier: 'bronze',
    title: 'Hat trick',
    description: 'Guess three words in a single round.',
    counter: 'describe_it_round_guess_3',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'five_alive',
    tier: 'silver',
    title: 'Five alive',
    description: 'Get five words guessed as describer in one round.',
    counter: 'describe_it_describer_5_round',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'mind_meld',
    tier: 'silver',
    title: 'Mind meld',
    description: 'Guess three words in a row for the same describer.',
    counter: 'describe_it_guess_run_3',
    points: 25,
    sortOrder: 80,
  },
  {
    suffix: 'wordsmith',
    tier: 'silver',
    title: 'Wordsmith',
    description: 'Guess ten words in a single game.',
    counter: 'describe_it_wordsmith_games',
    points: 30,
    sortOrder: 90,
  },
  {
    suffix: 'marathon',
    tier: 'silver',
    title: 'Marathon',
    description: 'Get eight words guessed as describer in one round.',
    counter: 'describe_it_describer_8_round',
    points: 35,
    sortOrder: 100,
  },
  {
    suffix: 'big_team',
    tier: 'silver',
    title: 'Big team',
    description: 'Play a game with twelve or more players.',
    counter: 'describe_it_big_room_12',
    points: 25,
    sortOrder: 110,
  },
  {
    suffix: 'all_rounder',
    tier: 'silver',
    title: 'All rounder',
    description: 'Describe and guess in the same game.',
    counter: 'describe_it_all_rounder_games',
    points: 25,
    sortOrder: 120,
  },
  {
    suffix: 'comeback',
    tier: 'silver',
    title: 'Comeback',
    description: 'Win from last place at the halfway point.',
    counter: 'describe_it_comeback_wins',
    points: 35,
    sortOrder: 130,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'perfect_round',
    tier: 'gold',
    title: 'Perfect round',
    description: 'Get every word guessed in a describer round (three or more, none skipped).',
    counter: 'describe_it_perfect_round_games',
    points: 60,
    sortOrder: 140,
  },
  {
    suffix: 'telepathy',
    tier: 'gold',
    title: 'Telepathy',
    description: 'Guess five words in a row for the same describer.',
    counter: 'describe_it_guess_run_5',
    points: 60,
    sortOrder: 150,
  },
  {
    suffix: 'century',
    tier: 'gold',
    title: 'Century',
    description: 'Guess 100 words.',
    counter: 'describe_it_words_guessed',
    gte: 100,
    points: 70,
    sortOrder: 160,
  },
  {
    suffix: 'ten_in_a_round',
    tier: 'gold',
    title: 'Ten in a round',
    description: 'Get ten words guessed as describer in one round.',
    counter: 'describe_it_describer_10_round',
    points: 70,
    sortOrder: 170,
  },
  {
    suffix: 'clean_sweep',
    tier: 'gold',
    title: 'Clean sweep',
    description: 'Win a game where your team led every round.',
    counter: 'describe_it_clean_sweep_wins',
    points: 80,
    sortOrder: 180,
  },
  {
    suffix: 'packed_house',
    tier: 'gold',
    title: 'Packed house',
    description: 'Win a game with sixteen or more players.',
    counter: 'describe_it_packed_house_wins',
    points: 70,
    sortOrder: 190,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'flawless',
    tier: 'gold',
    title: 'Flawless',
    description: 'Win with your team never failing a word.',
    counter: 'describe_it_flawless_wins',
    points: 150,
    sortOrder: 200,
  },
  {
    suffix: 'twelve_in_a_round',
    tier: 'gold',
    title: 'Twelve in a round',
    description: 'Get twelve words guessed as describer in one round.',
    counter: 'describe_it_describer_12_round',
    points: 150,
    sortOrder: 210,
    hidden: true,
  },
]
