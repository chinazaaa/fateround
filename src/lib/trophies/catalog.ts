/**
 * The launch trophy catalog — the seed for the `trophies` table.
 *
 * THIS IS A STARTING POINT, NOT THE SOURCE OF TRUTH. Once seeded, the table is the truth and
 * admin edits it (`/admin/trophies`). Re-seeding only inserts rows that are missing, so it can
 * never silently overwrite a title someone reworded or a threshold someone tuned.
 *
 * EVERY TROPHY HERE USES A COUNTER THAT ACTUALLY FIRES. A rule referencing a `planned` measure
 * would parse, save, and never be earned by anyone — with no error, because an unknown counter
 * reads as zero. `catalog.test.ts` asserts this, so a trophy written against a measure we
 * haven't built yet fails in CI rather than in silence six months later.
 *
 * Points feed `profiles.trophy_points` and therefore the level curve in `award.ts`. Tier is
 * cosmetic; points are the currency.
 */
import { isKnownCounter, isKnownDistinctSet, liveCounters, liveDistinctSets } from './counters'

export type CatalogTrophy = {
  id: string
  /** null = cross-game. Otherwise the rule only counts that game type. */
  game_type: string | null
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  title: string
  description: string
  criteria: unknown
  points: number
  hidden: boolean
  sort_order: number
}

/**
 * The per-game trophy templates.
 *
 * EVERY TROPHY BELONGS TO A GAME. There is no cross-game trophy, deliberately — a trophy list
 * is browsed one game at a time, so a "FateRound" bucket sitting above the games is a category
 * that belongs to nothing and can never be opened from a game you're playing. Cross-game
 * progress is real, but it is a *profile stat* (level, points, streak) shown at the top of the
 * list, not a trophy.
 *
 * Templates are instantiated for each game type, which is how ~47 games each get a real trophy
 * list from a handful of definitions. `requiresWins` templates are skipped for games whose
 * outcome the server can't resolve — a "win 10" trophy for a poll game would parse, save, and
 * never be earned by anyone.
 */
type TrophyTemplate = {
  suffix: string
  tier: CatalogTrophy['tier']
  title: string
  /** `{game}` is replaced with the game's label. */
  description: string
  counter: string
  gte: number
  points: number
  sortOrder: number
  /** Skipped for game types with no server-resolvable winner. */
  requiresWins?: boolean
  hidden?: boolean
}

export const TROPHY_TEMPLATES: readonly TrophyTemplate[] = [
  {
    suffix: 'first_game',
    tier: 'bronze',
    title: 'First round',
    description: 'Finish your first game of {game}.',
    counter: 'games_played',
    gte: 1,
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'first_win',
    tier: 'bronze',
    title: 'First win',
    description: 'Win a game of {game}.',
    counter: 'games_won',
    gte: 1,
    points: 25,
    sortOrder: 20,
    requiresWins: true,
  },
  {
    suffix: 'ten_games',
    tier: 'bronze',
    title: 'Regular',
    description: 'Finish 10 games of {game}.',
    counter: 'games_played',
    gte: 10,
    points: 30,
    sortOrder: 30,
  },
  {
    suffix: 'ten_wins',
    tier: 'silver',
    title: 'Winner',
    description: 'Win 10 games of {game}.',
    counter: 'games_won',
    gte: 10,
    points: 75,
    sortOrder: 40,
    requiresWins: true,
  },
  {
    suffix: 'fifty_games',
    tier: 'silver',
    title: 'Devoted',
    description: 'Finish 50 games of {game}.',
    counter: 'games_played',
    gte: 50,
    points: 100,
    sortOrder: 50,
  },
  {
    suffix: 'fifty_wins',
    tier: 'gold',
    title: 'Champion',
    description: 'Win 50 games of {game}.',
    counter: 'games_won',
    gte: 50,
    points: 200,
    sortOrder: 60,
    requiresWins: true,
  },
  {
    suffix: 'hundred_wins',
    tier: 'gold',
    title: 'Legend',
    description: 'Win 100 games of {game}.',
    counter: 'games_won',
    gte: 100,
    points: 400,
    sortOrder: 70,
    requiresWins: true,
  },
  {
    suffix: 'night_owl',
    tier: 'silver',
    title: 'Night owl',
    description: 'Finish 5 games of {game} after midnight.',
    counter: 'late_night_games',
    gte: 5,
    points: 60,
    sortOrder: 80,
    hidden: true,
  },
]

/**
 * Build one game's trophies.
 *
 * `canScoreWins` comes from `outcome.ts` rather than being assumed: for a game whose winner the
 * server never learns, a win trophy is not a hard trophy, it is an impossible one.
 */
export function buildCatalogForGame(gameType: string, gameLabel: string, canScoreWins: boolean): CatalogTrophy[] {
  const trophies = TROPHY_TEMPLATES.filter((t) => !t.requiresWins || canScoreWins).map((t) => ({
    id: `${gameType}.${t.suffix}`,
    game_type: gameType,
    tier: t.tier as CatalogTrophy['tier'],
    title: t.title,
    description: t.description.replace('{game}', gameLabel),
    // Scoped at build time so the counter only ever reads this game's total.
    criteria: { type: 'counter', counter: t.counter, gte: t.gte, gameType } as unknown,
    points: t.points,
    hidden: t.hidden ?? false,
    sort_order: t.sortOrder,
  }))

  trophies.push({
    id: `${gameType}.platinum`,
    game_type: gameType,
    tier: 'platinum',
    title: 'Master',
    description: `Earn every other ${gameLabel} trophy.`,
    criteria: { type: 'platinum', game_type: gameType } as unknown,
    points: 500,
    hidden: false,
    sort_order: 999,
  })

  return trophies
}

/**
 * Counter and set keys referenced by a rule. Used by the catalog test and by the admin API to
 * reject a rule aimed at a measure that will never fire.
 */
export function referencedKeys(criteria: unknown): { counters: string[]; distinct: string[] } {
  const counters: string[] = []
  const distinct: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const rule = node as Record<string, unknown>
    if (rule.type === 'counter' && typeof rule.counter === 'string') counters.push(rule.counter)
    if (rule.type === 'distinct' && typeof rule.key === 'string') distinct.push(rule.key)
    if (Array.isArray(rule.of)) rule.of.forEach(walk)
  }
  walk(criteria)
  return { counters, distinct }
}

/**
 * Whether every measure a rule references exists AND is emitted today.
 *
 * The admin API calls this so a rule aimed at a `planned` measure — or a typo — is refused at
 * save time. Both are indistinguishable at runtime: an unknown counter reads as zero, so the
 * trophy simply never fires and nothing anywhere reports a problem.
 */
export function criteriaUsesLiveMeasures(criteria: unknown): { ok: boolean; unknown: string[] } {
  const live = new Set([...liveCounters().map((c) => c.key), ...liveDistinctSets().map((d) => d.key)])
  const { counters, distinct } = referencedKeys(criteria)
  const bad = [
    ...counters.filter((key) => !isKnownCounter(key) || !live.has(key)),
    ...distinct.filter((key) => !isKnownDistinctSet(key) || !live.has(key)),
  ]
  return { ok: bad.length === 0, unknown: [...new Set(bad)] }
}

/**
 * Scope every unscoped counter in a rule to one game type.
 *
 * A trophy filed under Whot almost always means "…in Whot", but the rule and the filing are
 * two separate fields, and setting one without the other is the easy mistake: a trophy that
 * *looks* Whot-specific in the admin list while counting every game. This applies the intent
 * to both, and deliberately leaves an explicitly-scoped counter alone so a deliberate
 * cross-game clause inside a game-specific trophy still works.
 */
export function scopeCriteriaToGame(criteria: unknown, gameType: string | null): unknown {
  if (!gameType) return criteria
  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node
    const rule = node as Record<string, unknown>
    if (rule.type === 'counter') {
      return rule.gameType ? rule : { ...rule, gameType }
    }
    if (Array.isArray(rule.of)) return { ...rule, of: rule.of.map(walk) }
    return rule
  }
  return walk(criteria)
}
