import type { SystemTrophySpec } from './types'

/**
 * Rummy — code-authored trophies. Every counter here is emitted by `./game-facts/rummy.ts`
 * and registered in `../counters.ts`; the vocabulary test guards the wiring.
 *
 * Only the winner of a "went out" hand produces counters (a timeout win crowned by
 * "closest to going out" carries no `winning_melds`, so it doesn't earn meld-shape trophies —
 * see the omissions note at the top of the facts builder). The generic `games_played` and
 * `games_won` tracks the shared catalog builds still fire either way, so a timeout winner
 * isn't left with nothing.
 */
export const RUMMY: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_lay_down',
    tier: 'bronze',
    title: 'First lay-down',
    description: 'Win a hand of Rummy — go out with a valid set or run.',
    counter: 'rummy_melds_laid',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'run_it',
    tier: 'bronze',
    title: 'Run it',
    description: 'Go out with a hand that includes at least one run.',
    counter: 'rummy_run_wins',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'set_it',
    tier: 'bronze',
    title: 'Set it',
    description: 'Go out with a hand that includes at least one set.',
    counter: 'rummy_set_wins',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'mixed_bag',
    tier: 'bronze',
    title: 'Mixed bag',
    description: 'Go out with both a set and a run in the same hand.',
    counter: 'rummy_mixed_bag_wins',
    points: 15,
    sortOrder: 40,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'melder',
    tier: 'silver',
    title: 'Melder',
    description: 'Lay down 15 melds across your winning hands.',
    counter: 'rummy_melds_laid',
    gte: 15,
    points: 25,
    sortOrder: 50,
  },
  {
    suffix: 'long_meld',
    tier: 'silver',
    title: 'Long meld',
    description: 'Go out with a five-plus card meld.',
    counter: 'rummy_long_meld_wins',
    points: 25,
    sortOrder: 60,
  },
  {
    suffix: 'one_shot',
    tier: 'silver',
    title: 'One shot',
    description: 'Go out with a single meld covering your whole hand.',
    counter: 'rummy_solo_meld_wins',
    points: 30,
    sortOrder: 70,
  },
  {
    suffix: 'big_table',
    tier: 'silver',
    title: 'Big table',
    description: 'Win a Rummy game with four or more players seated.',
    counter: 'rummy_big_table_wins',
    points: 25,
    sortOrder: 80,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'all_runs',
    tier: 'gold',
    title: 'All runs',
    description: 'Go out with runs only — no sets, at least two melds.',
    counter: 'rummy_pure_run_wins',
    points: 40,
    sortOrder: 90,
  },
  {
    suffix: 'all_sets',
    tier: 'gold',
    title: 'All sets',
    description: 'Go out with sets only — no runs, at least two melds.',
    counter: 'rummy_pure_set_wins',
    points: 40,
    sortOrder: 100,
  },
  {
    suffix: 'meld_master',
    tier: 'gold',
    title: 'Meld master',
    description: 'Lay down 50 melds across your winning hands.',
    counter: 'rummy_melds_laid',
    gte: 50,
    points: 50,
    sortOrder: 110,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'rummy_legend',
    tier: 'platinum',
    title: 'Rummy legend',
    description: 'Lay down 150 melds across your winning hands.',
    counter: 'rummy_melds_laid',
    gte: 150,
    points: 100,
    sortOrder: 120,
  },
]
