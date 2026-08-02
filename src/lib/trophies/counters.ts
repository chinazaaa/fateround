/**
 * The counter vocabulary — what a trophy rule is allowed to talk about.
 *
 * THIS FILE IS THE PRODUCT SURFACE, not the trophy list. A trophy is a row in `trophies`
 * that an admin can write; a *counter* is a measurement the server emits, and only code can
 * add one. So the breadth here decides how much can be built without a deploy:
 *
 *   - "Win 25 games"            → composable today, because `games_won` exists
 *   - "Win without drawing"     → needs a `wins_no_draw` counter emitted by the card games
 *
 * The registry is exported so `/admin/trophies` can *show* the vocabulary while someone is
 * writing a rule. Without that, "admin-editable" quietly means "editable if you remember the
 * counter names", and the first typo produces a trophy that is simply never earned — with no
 * error, because an unknown counter reads as zero by design.
 *
 * Adding a counter here does NOT make it real. It has to be emitted by the award pass too.
 * `availability` records how far along each one is, so the admin UI can grey out the ones that
 * would never fire rather than offering a rule that silently can't be satisfied.
 */

export type CounterScope =
  /** Tracked per game type, and also aggregated globally. */
  | 'per-game'
  /** Only meaningful across all games. */
  | 'global'

export type CounterAvailability =
  /** Emitted for every game type today. */
  | 'universal'
  /**
   * Emitted only where the server can actually determine it. `games_won` is the live example:
   * there is no universal winner on this stack, so a "win" rule silently never fires for a
   * game whose outcome the server can't resolve. `./outcome.ts` maps the 16 game types where
   * it can — call `gameTypesWithWinners()` for the current list rather than hardcoding it, and
   * warn in the admin UI when a rule targets a game type outside it.
   */
  | 'partial'
  /** Declared for the catalog's benefit, not yet emitted anywhere. */
  | 'planned'

export type CounterDef = {
  key: string
  label: string
  description: string
  scope: CounterScope
  availability: CounterAvailability
  /**
   * How this measure reads in a sentence, with `{n}` for the threshold and `{s}` for a plural
   * "s". Exists so the admin editor can say "won at least 25 games" instead of "games won of at
   * least 25" — the whole point of the sentence is that someone can check the rule without
   * knowing the format, and that only works if it reads like English.
   */
  phrase: string
}

export type DistinctDef = {
  key: string
  label: string
  description: string
  availability: CounterAvailability
  /** See `CounterDef.phrase`. */
  phrase: string
}

/**
 * Scalar counters, addressable by `{ type: 'counter', counter: <key> }`.
 *
 * Deliberately broader than the launch catalog needs. Emitting a counter nobody uses yet costs
 * one key in a jsonb blob; discovering later that you need it costs a deploy and a backfill,
 * and the backfill is impossible because the games it would have measured are already over.
 */
export const COUNTERS: readonly CounterDef[] = [
  {
    key: 'games_played',
    label: 'Games played',
    description: 'Finished games this profile took part in as a seated player.',
    scope: 'per-game',
    availability: 'universal',
    phrase: 'finished at least {n} game{s}',
  },
  {
    key: 'games_won',
    label: 'Games won',
    description: 'Finished games this profile won outright.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'won at least {n} game{s}',
  },
  {
    key: 'podium_finishes',
    label: 'Podium finishes',
    description: 'Finished in the top three of a ranked game.',
    scope: 'per-game',
    availability: 'partial',
    phrase: 'finished in the top three at least {n} time{s}',
  },
  {
    key: 'days_played',
    label: 'Days played',
    description: 'Distinct calendar days (WAT) with at least one finished game.',
    scope: 'global',
    availability: 'universal',
    phrase: 'played on at least {n} different day{s}',
  },
  {
    key: 'longest_streak',
    label: 'Longest streak',
    description: 'Best run of consecutive days played.',
    scope: 'global',
    availability: 'universal',
    phrase: 'reached a streak of at least {n} day{s} in a row',
  },
  {
    key: 'big_room_games',
    label: 'Big-room games',
    description: 'Finished games with eight or more seated players.',
    scope: 'per-game',
    availability: 'universal',
    phrase: 'finished at least {n} game{s} with 8 or more players',
  },
  {
    key: 'late_night_games',
    label: 'Late-night games',
    description: 'Games finished between midnight and 5am, local to the room.',
    scope: 'global',
    availability: 'universal',
    phrase: 'finished at least {n} game{s} after midnight',
  },
  {
    key: 'host_games',
    label: 'Games hosted',
    description: 'Finished games this profile hosted.',
    scope: 'per-game',
    availability: 'planned',
    phrase: 'hosted at least {n} game{s}',
  },
  {
    key: 'comeback_wins',
    label: 'Comeback wins',
    description: 'Won after being last at any scored checkpoint.',
    scope: 'per-game',
    availability: 'planned',
    phrase: 'won at least {n} game{s} after being last',
  },
  {
    key: 'perfect_games',
    label: 'Perfect games',
    description: 'Finished with a flawless score by that game’s own definition.',
    scope: 'per-game',
    availability: 'planned',
    phrase: 'finished at least {n} perfect game{s}',
  },
] as const

/**
 * Set-valued measures, addressable by `{ type: 'distinct', key: <key> }`. Backed by
 * `player_distinct`, where the primary key does the deduping and `count(*)` is the value.
 */
export const DISTINCT_SETS: readonly DistinctDef[] = [
  {
    key: 'modes_played',
    label: 'Game modes played',
    description: 'How many different game types this profile has finished.',
    availability: 'universal',
    phrase: 'played at least {n} different game mode{s}',
  },
  {
    key: 'opponents',
    label: 'Opponents faced',
    description: 'Distinct other profiles seated in the same finished game.',
    availability: 'partial',
    phrase: 'faced at least {n} different opponent{s}',
  },
  {
    key: 'rooms',
    label: 'Rooms played in',
    description: 'Distinct game rooms this profile has finished a game in.',
    availability: 'planned',
    phrase: 'played in at least {n} different room{s}',
  },
] as const

const COUNTER_KEYS = new Set(COUNTERS.map((c) => c.key))
const DISTINCT_KEYS = new Set(DISTINCT_SETS.map((d) => d.key))

/** True when a counter key is one the engine knows how to emit or plans to. */
export function isKnownCounter(key: string): boolean {
  return COUNTER_KEYS.has(key)
}

export function isKnownDistinctSet(key: string): boolean {
  return DISTINCT_KEYS.has(key)
}

/**
 * Counters and sets that will actually fire today.
 *
 * The admin UI should offer these first and mark the rest, because a rule referencing a
 * `planned` measure is indistinguishable at runtime from a typo: both read as zero, both
 * produce a trophy nobody can ever earn, and neither raises an error anywhere.
 */
export function liveCounters(): CounterDef[] {
  return COUNTERS.filter((c) => c.availability !== 'planned')
}

export function liveDistinctSets(): DistinctDef[] {
  return DISTINCT_SETS.filter((d) => d.availability !== 'planned')
}
