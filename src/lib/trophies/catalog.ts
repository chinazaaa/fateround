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

export const LAUNCH_CATALOG: readonly CatalogTrophy[] = [
  // ── Getting started ───────────────────────────────────────────────────────────────────
  {
    id: 'first_game',
    game_type: null,
    tier: 'bronze',
    title: 'First round',
    description: 'Finish your first game.',
    criteria: { type: 'counter', counter: 'games_played', gte: 1 },
    points: 10,
    hidden: false,
    sort_order: 10,
  },
  {
    id: 'first_win',
    game_type: null,
    tier: 'bronze',
    title: 'First win',
    description: 'Win a game.',
    criteria: { type: 'counter', counter: 'games_won', gte: 1 },
    points: 25,
    hidden: false,
    sort_order: 20,
  },
  {
    id: 'ten_games',
    game_type: null,
    tier: 'bronze',
    title: 'Regular',
    description: 'Finish 10 games.',
    criteria: { type: 'counter', counter: 'games_played', gte: 10 },
    points: 30,
    hidden: false,
    sort_order: 30,
  },

  // ── Winning ───────────────────────────────────────────────────────────────────────────
  {
    id: 'ten_wins',
    game_type: null,
    tier: 'silver',
    title: 'Winner',
    description: 'Win 10 games.',
    criteria: { type: 'counter', counter: 'games_won', gte: 10 },
    points: 75,
    hidden: false,
    sort_order: 40,
  },
  {
    id: 'fifty_wins',
    game_type: null,
    tier: 'gold',
    title: 'Champion',
    description: 'Win 50 games.',
    criteria: { type: 'counter', counter: 'games_won', gte: 50 },
    points: 200,
    hidden: false,
    sort_order: 50,
  },

  // ── Breadth ───────────────────────────────────────────────────────────────────────────
  {
    id: 'five_modes',
    game_type: null,
    tier: 'bronze',
    title: 'Browser',
    description: 'Play 5 different game modes.',
    criteria: { type: 'distinct', key: 'modes_played', gte: 5 },
    points: 30,
    hidden: false,
    sort_order: 60,
  },
  {
    id: 'fifteen_modes',
    game_type: null,
    tier: 'gold',
    title: 'Completionist',
    description: 'Play 15 different game modes.',
    criteria: { type: 'distinct', key: 'modes_played', gte: 15 },
    points: 150,
    hidden: false,
    sort_order: 70,
  },

  // ── Streaks ───────────────────────────────────────────────────────────────────────────
  {
    id: 'streak_7',
    game_type: null,
    tier: 'silver',
    title: 'Week on',
    description: 'Play on 7 days in a row.',
    criteria: { type: 'counter', counter: 'longest_streak', gte: 7 },
    points: 80,
    hidden: false,
    sort_order: 80,
  },
  {
    id: 'streak_30',
    game_type: null,
    tier: 'platinum',
    title: 'Unbroken',
    description: 'Play on 30 days in a row.',
    criteria: { type: 'counter', counter: 'longest_streak', gte: 30 },
    points: 400,
    hidden: false,
    sort_order: 90,
  },
  {
    id: 'fifty_days',
    game_type: null,
    tier: 'silver',
    title: 'Fixture',
    description: 'Play on 50 different days.',
    criteria: { type: 'counter', counter: 'days_played', gte: 50 },
    points: 120,
    hidden: false,
    sort_order: 100,
  },

  // ── Flavour ───────────────────────────────────────────────────────────────────────────
  {
    id: 'big_room',
    game_type: null,
    tier: 'bronze',
    title: 'Full house',
    description: 'Finish a game with 8 or more players.',
    criteria: { type: 'counter', counter: 'big_room_games', gte: 1 },
    points: 25,
    hidden: false,
    sort_order: 110,
  },
  {
    id: 'night_owl',
    game_type: null,
    tier: 'silver',
    title: 'Night owl',
    description: 'Finish 5 games after midnight.',
    criteria: { type: 'counter', counter: 'late_night_games', gte: 5 },
    points: 60,
    hidden: true,
    sort_order: 120,
  },
  {
    id: 'all_rounder',
    game_type: null,
    tier: 'gold',
    title: 'All-rounder',
    description: 'Win 10 games across at least 5 different modes.',
    criteria: {
      type: 'all',
      of: [
        { type: 'counter', counter: 'games_won', gte: 10 },
        { type: 'distinct', key: 'modes_played', gte: 5 },
      ],
    },
    points: 175,
    hidden: false,
    sort_order: 130,
  },
] as const

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
