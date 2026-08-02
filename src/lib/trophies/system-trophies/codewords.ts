import type { SystemTrophySpec } from './types'

/**
 * Codewords — derived at finish from the guess log, the roles and the board. See
 * `./game-facts/codewords.ts`.
 *
 * Ordered bronze → platinum, and the thresholds are the brief's. Where the brief asked for
 * something the data cannot support it is simply absent rather than approximated:
 *
 *   - "Recruited", "Winner", "Ten Missions", "Big Team" and the "Codewords Champion" track are
 *     not here because they are the generic catalog's job — `games_played`, `games_won` and
 *     `big_room_games` are emitted for every game type, and duplicating them as system trophies
 *     would print two rows for one achievement.
 *   - "First Clue" is absent: `codewords_guesses` names the guesser, never the clue-giver, so a
 *     clue being GIVEN leaves no row attributable to the spymaster.
 *   - "Red Team", "Blue Team" and "Both Sides" are absent: the builder emits no team flag and no
 *     role flag for merely playing — the roles only ever reach a counter through a win.
 *   - "Both Chairs" (five wins as spymaster AND five as operative) is absent: the rule DSL is a
 *     single `counter >= n`, so a conjunction of two counters cannot be expressed.
 *
 * WINS HERE ARE TEAM WINS. `resolveWinners` returns the whole winning team, so a win counter is
 * credited to every member — including an operative who never guessed. The descriptions below say
 * "your team" wherever that is what happened, and reserve "you" for the four guess tallies and the
 * two single-clue run counters, which are the only genuinely personal measurements.
 */
export const CODEWORDS: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_word',
    tier: 'bronze',
    title: 'Good guess',
    description: 'Uncover one of your own team’s words.',
    counter: 'codewords_own_word_guesses',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'near_miss',
    tier: 'bronze',
    title: 'Near miss',
    description: 'Turn over a bystander word.',
    counter: 'codewords_neutral_guesses',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'double_agent',
    tier: 'bronze',
    title: 'Double agent',
    description: 'Hand the other team one of their words.',
    counter: 'codewords_opponent_guesses',
    points: 10,
    sortOrder: 30,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'clue_for_two',
    tier: 'silver',
    title: 'Clue for two',
    description: 'Your team lands a clue for two with both words found.',
    counter: 'codewords_clue2_full',
    points: 25,
    sortOrder: 40,
  },
  {
    suffix: 'clue_for_three',
    tier: 'silver',
    title: 'Clue for three',
    description: 'Your team lands a clue for three with all three found.',
    counter: 'codewords_clue3_full',
    points: 30,
    sortOrder: 50,
  },
  {
    suffix: 'assassin_dodged',
    tier: 'silver',
    title: 'Assassin dodged',
    description: 'Be on the winning team in a game where nobody turned the assassin over.',
    counter: 'codewords_assassin_dodged_wins',
    points: 30,
    sortOrder: 60,
  },
  {
    suffix: 'mind_reader',
    tier: 'silver',
    title: 'Mind reader',
    description: 'Find four of your team’s words yourself on a single clue.',
    counter: 'codewords_run4_guesses',
    points: 30,
    sortOrder: 70,
  },
  {
    suffix: 'spymaster_win',
    tier: 'silver',
    title: 'Spymaster',
    description: 'Be the spymaster when your team wins.',
    counter: 'codewords_spymaster_wins',
    points: 25,
    sortOrder: 80,
  },
  {
    suffix: 'operative_win',
    tier: 'silver',
    title: 'Operative',
    description: 'Be an operative when your team wins.',
    counter: 'codewords_operative_wins',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'clean_round',
    tier: 'silver',
    title: 'Clean round',
    description: 'Your team completes a turn hitting nothing but its own words.',
    counter: 'codewords_clean_turns',
    points: 25,
    sortOrder: 100,
  },
  {
    suffix: 'comeback',
    tier: 'silver',
    title: 'Comeback',
    description: 'Win on a team that was three or more words behind at some point.',
    counter: 'codewords_comeback_wins',
    points: 35,
    sortOrder: 110,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'clue_for_four',
    tier: 'gold',
    title: 'Clue for four',
    description: 'Your team lands a clue for four with all four found.',
    counter: 'codewords_clue4_full',
    points: 60,
    sortOrder: 120,
  },
  {
    suffix: 'perfect_game',
    tier: 'gold',
    title: 'Perfect game',
    description: 'Win on a team that never guessed a wrong word.',
    counter: 'codewords_perfect_wins',
    points: 70,
    sortOrder: 130,
  },
  {
    suffix: 'assassin_hit',
    tier: 'gold',
    title: 'Assassin',
    description: 'Turn over the assassin and end the game on the spot.',
    counter: 'codewords_assassin_guesses',
    points: 60,
    sortOrder: 140,
  },
  {
    suffix: 'sweep',
    tier: 'gold',
    title: 'Sweep',
    description: 'Win a game your team took in four clue runs or fewer.',
    counter: 'codewords_sweep_wins',
    points: 70,
    sortOrder: 150,
  },
  {
    suffix: 'master_spy',
    tier: 'gold',
    title: 'Master spy',
    description: 'Be the spymaster on five winning teams.',
    counter: 'codewords_spymaster_wins',
    gte: 5,
    points: 80,
    sortOrder: 160,
  },
  {
    suffix: 'telepathy',
    tier: 'gold',
    title: 'Telepathy',
    description: 'Find five of your team’s words yourself on a single clue.',
    counter: 'codewords_run5_guesses',
    points: 70,
    sortOrder: 170,
  },
  {
    suffix: 'clutch',
    tier: 'gold',
    title: 'Clutch',
    description: 'Win with the other team one word from taking it.',
    counter: 'codewords_clutch_wins',
    points: 80,
    sortOrder: 180,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'clue_for_five',
    tier: 'platinum',
    title: 'Clue for five',
    description: 'Your team lands a clue for five with all five found.',
    counter: 'codewords_clue5_full',
    points: 150,
    sortOrder: 190,
  },
  {
    suffix: 'flawless_sweep',
    tier: 'platinum',
    title: 'Flawless sweep',
    description: 'Win in three clue runs or fewer with your team never hitting a wrong word.',
    counter: 'codewords_flawless_sweep_wins',
    points: 150,
    sortOrder: 200,
    hidden: true,
  },
]
