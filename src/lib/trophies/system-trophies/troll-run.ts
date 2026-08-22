import type { SystemTrophySpec } from './types'
import { distinctCrit } from './types'
import { TROLL_RUN_WORLD_IDS } from '@/lib/troll-run-types'

/**
 * Troll Run — derived at finish from the rows every race already writes.
 * See `../game-facts/troll-run.ts` for where each counter comes from.
 *
 * THE SHAPE OF THE GAME. Rounds of ten randomly-ordered levels against a shared clock. You can
 * win a round by being fastest, survive one by never dying, or scrape points out of a round the
 * clock beat you to. The track below deliberately rewards all three, because they are different
 * kinds of good: `troll_run_round_wins` is for the fast, `troll_run_deathless_rounds` and
 * `troll_run_first_try_clears` are for the careful, and `troll_run_par_rounds` needs both.
 *
 * DEATHS ARE A TROPHY, NOT A PENALTY. `troll_run_deaths` climbs whether you win or lose, so the
 * player having the worst possible night still has something moving. In a game whose whole
 * premise is dying repeatedly to unfair traps, that is the correct joke — and it is the only
 * counter here a struggling player is guaranteed to advance.
 *
 * OMITTED (covered by the generic catalog):
 *  - "Play a game" / "Play ten games" → generic `games_played`.
 *  - First win / games won → generic outcome track.
 *
 * OMITTED (data cannot honestly support it — see the facts builder):
 *  - Any PER-LEVEL par trophy. Par lives on a descriptor rebuilt from a per-round seed that is
 *    overwritten each round, so it is unresolvable for every round but the last.
 */
export const TROLL_RUN: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_level',
    tier: 'bronze',
    title: 'Off the mark',
    description: 'Clear your first level.',
    counter: 'troll_run_levels_cleared',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'first_death',
    tier: 'bronze',
    title: 'The troll wins',
    description: 'Die for the first time. It will not be the last.',
    counter: 'troll_run_deaths',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'first_round',
    tier: 'bronze',
    title: 'Made it out',
    description: 'Clear every level in a round before the clock runs out.',
    counter: 'troll_run_rounds_finished',
    points: 15,
    sortOrder: 30,
  },
  {
    suffix: 'first_round_win',
    tier: 'bronze',
    title: 'Fastest feet',
    description: 'Win a round.',
    counter: 'troll_run_round_wins',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'first_try',
    tier: 'bronze',
    title: 'Read the room',
    description: 'Clear a level without dying on it once.',
    counter: 'troll_run_first_try_clears',
    points: 10,
    sortOrder: 50,
  },
  {
    suffix: 'full_lobby',
    tier: 'bronze',
    title: 'Six runners',
    description: 'Finish a race in a full six-player lobby.',
    counter: 'troll_run_full_lobby_games',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'fifty_levels',
    tier: 'silver',
    title: 'Trail blazer',
    description: 'Clear 50 levels.',
    counter: 'troll_run_levels_cleared',
    gte: 50,
    points: 25,
    sortOrder: 110,
  },
  {
    suffix: 'hundred_deaths',
    tier: 'silver',
    title: 'Pain tolerance',
    description: 'Die 100 times. Worn with pride.',
    counter: 'troll_run_deaths',
    gte: 100,
    points: 25,
    sortOrder: 120,
  },
  {
    suffix: 'deathless_round',
    tier: 'silver',
    title: 'Untouchable',
    description: 'Finish a round without dying once.',
    counter: 'troll_run_deathless_rounds',
    points: 30,
    sortOrder: 130,
  },
  {
    suffix: 'under_par',
    tier: 'silver',
    title: 'Beat the clock',
    description: 'Finish a round inside par time and take the speed bonus.',
    counter: 'troll_run_par_rounds',
    points: 30,
    sortOrder: 140,
  },
  {
    suffix: 'five_round_wins',
    tier: 'silver',
    title: 'Front runner',
    description: 'Win 5 rounds.',
    counter: 'troll_run_round_wins',
    gte: 5,
    points: 30,
    sortOrder: 150,
  },
  {
    suffix: 'twenty_first_try',
    tier: 'silver',
    title: 'Trap sense',
    description: 'Clear 20 levels first try.',
    counter: 'troll_run_first_try_clears',
    gte: 20,
    points: 25,
    sortOrder: 160,
  },
  {
    suffix: 'ten_rounds',
    tier: 'silver',
    title: 'Regular runner',
    description: 'Finish 10 rounds.',
    counter: 'troll_run_rounds_finished',
    gte: 10,
    points: 25,
    sortOrder: 170,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'flawless_game',
    tier: 'gold',
    title: 'Not a scratch',
    description: 'Finish every round of a game without dying once.',
    counter: 'troll_run_flawless_games',
    points: 50,
    sortOrder: 210,
  },
  {
    suffix: 'clean_sweep',
    tier: 'gold',
    title: 'Clean sweep',
    description: 'Win every round in a game.',
    counter: 'troll_run_clean_sweep_games',
    points: 50,
    sortOrder: 220,
  },
  {
    suffix: 'five_hundred_levels',
    tier: 'gold',
    title: 'Level eater',
    description: 'Clear 500 levels.',
    counter: 'troll_run_levels_cleared',
    gte: 500,
    points: 50,
    sortOrder: 230,
  },
  {
    suffix: 'five_under_par',
    tier: 'gold',
    title: 'Speedrunner',
    description: 'Finish 5 rounds under par.',
    counter: 'troll_run_par_rounds',
    gte: 5,
    points: 50,
    sortOrder: 240,
  },
  {
    suffix: 'all_worlds',
    tier: 'gold',
    title: 'World tour',
    description: 'Finish a race in all four worlds.',
    // A SET, not a sum: four different worlds, in any order, across any number of games.
    // `TROLL_RUN_WORLD_IDS.length` rather than a literal 4, so shipping a fifth world raises
    // the bar with it instead of leaving a trophy that reads "all four" and means "any four".
    criteria: distinctCrit('troll_run_worlds', TROLL_RUN_WORLD_IDS.length),
    points: 60,
    sortOrder: 250,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'twenty_five_round_wins',
    tier: 'platinum',
    title: 'Track record',
    description: 'Win 25 rounds.',
    counter: 'troll_run_round_wins',
    gte: 25,
    points: 100,
    sortOrder: 310,
  },
  {
    suffix: 'thousand_deaths',
    tier: 'platinum',
    title: 'Thousand deaths',
    description: 'Die 1,000 times and come back anyway.',
    counter: 'troll_run_deaths',
    gte: 1000,
    points: 100,
    sortOrder: 320,
  },
  {
    suffix: 'three_flawless',
    tier: 'platinum',
    title: 'Ghost runner',
    description: 'Finish 3 whole games without dying once.',
    counter: 'troll_run_flawless_games',
    gte: 3,
    points: 120,
    sortOrder: 330,
  },
]
