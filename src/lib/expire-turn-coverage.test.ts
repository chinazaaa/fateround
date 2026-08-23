import { describe, it, expect } from 'vitest'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROUND_ADVANCE_SLUG, TURN_EXPIRE_SLUG } from './game-tick'

/**
 * Guard for the "turn clock only moves while a tab is open" bug class.
 *
 * `src/lib/game-tick.ts` is the always-on backstop that pokes each active game's
 * tokenless system/timer route, so a turn still expires when every participant has
 * backgrounded their tab (or suspended the mobile app). A game whose `expire-turn`
 * route exists but is missing from the ticker's maps silently loses that backstop —
 * which is how Ludo, Word Tiles, Match Up, Ayo, Mahjong and the two Checkers variants
 * ended up client-driven only.
 *
 * This test walks the real route directories rather than a hand-kept list, so a new
 * game's `expire-turn` route fails CI until it is either wired into the ticker or
 * explicitly opted out below with a reason.
 */

const API_DIR = join(process.cwd(), 'src', 'app', 'api')

/**
 * Route slugs whose `expire-turn` is deliberately NOT poked directly by the ticker.
 * Each entry needs a reason — "we forgot" is the bug this test exists to catch.
 */
const EXPIRE_TURN_OPT_OUTS: Record<string, string> = {
  // Round-based games: the ticker drives the round via `/advance`, which internally
  // handles a lapsed turn. Poking `expire-turn` as well would be redundant.
  'describe-it': 'driven by /api/describe-it/advance (ROUND_ADVANCE_SLUG)',
  'word-rush': 'driven by /api/word-rush/advance (ROUND_ADVANCE_SLUG)',
}

function routeSlugsWith(subdir: string): string[] {
  return readdirSync(API_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => existsSync(join(API_DIR, slug, subdir, 'route.ts')))
    .sort()
}

describe('game-tick covers every server-driveable timer route', () => {
  const expireTurnSlugs = routeSlugsWith('expire-turn')
  const advanceSlugs = routeSlugsWith('advance')

  it('finds the expire-turn routes on disk (guard is actually looking at something)', () => {
    expect(expireTurnSlugs.length).toBeGreaterThanOrEqual(15)
  })

  it('every /api/<slug>/expire-turn route is in TURN_EXPIRE_SLUG or explicitly opted out', () => {
    const ticked = new Set(Object.values(TURN_EXPIRE_SLUG))
    const unticked = expireTurnSlugs.filter((slug) => !ticked.has(slug) && !(slug in EXPIRE_TURN_OPT_OUTS))
    expect(
      unticked,
      'expire-turn routes with no server-side ticker entry — their turn clock only advances ' +
        'while a browser tab is open. Add them to TURN_EXPIRE_SLUG in src/lib/game-tick.ts, ' +
        'or to EXPIRE_TURN_OPT_OUTS here with a reason.'
    ).toEqual([])
  })

  it('every TURN_EXPIRE_SLUG value points at a route that exists', () => {
    const missing = Object.entries(TURN_EXPIRE_SLUG)
      .filter(([, slug]) => !existsSync(join(API_DIR, slug, 'expire-turn', 'route.ts')))
      .map(([gameType, slug]) => `${gameType} -> /api/${slug}/expire-turn`)
    expect(missing, 'ticker would POST to a route that does not exist').toEqual([])
  })

  it('every ROUND_ADVANCE_SLUG value points at a route that exists', () => {
    const missing = Object.entries(ROUND_ADVANCE_SLUG)
      .filter(([, slug]) => !advanceSlugs.includes(slug))
      .map(([gameType, slug]) => `${gameType} -> /api/${slug}/advance`)
    expect(missing, 'ticker would POST to a route that does not exist').toEqual([])
  })

  it('opt-out entries are real routes (no stale exemptions)', () => {
    const stale = Object.keys(EXPIRE_TURN_OPT_OUTS).filter((slug) => !expireTurnSlugs.includes(slug))
    expect(stale, 'opted-out slug has no expire-turn route — delete the exemption').toEqual([])
  })
})
