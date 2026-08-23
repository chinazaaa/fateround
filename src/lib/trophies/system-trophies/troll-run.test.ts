import { describe, it, expect } from 'vitest'
import { buildSystemCatalog } from '../system-catalog'
import { TROLL_RUN } from './troll-run'
import { TROLL_RUN_WORLD_IDS } from '@/lib/troll-run-types'

/**
 * Troll Run's own shape rules.
 *
 * Spec ↔ seed-migration parity is NOT checked here — `../system-trophy-seed-parity.test.ts`
 * does that for every game at once. What is left is what is specific to this set: Troll Run
 * rewards three genuinely different kinds of good (fast, careful, and both at once), and a set
 * that leaned entirely on speed would leave the careful player with nothing to chase in a game
 * whose entire premise is dying to unfair traps.
 */
describe('Troll Run system trophies', () => {
  const catalog = buildSystemCatalog().filter((trophy) => trophy.game_type === 'troll_run')
  const counters = TROLL_RUN.map((spec) => spec.counter ?? '')

  it('registers the spec under the troll_run game type', () => {
    expect(catalog).toHaveLength(TROLL_RUN.length)
    expect(TROLL_RUN.length).toBeGreaterThanOrEqual(15)
  })

  it('rewards speed, care, and both — no single track carries the set', () => {
    const speed = counters.filter((c) => /round_wins|par_rounds/.test(c))
    const care = counters.filter((c) => /deathless|first_try|flawless/.test(c))
    const volume = counters.filter((c) => /levels_cleared|rounds_finished|deaths\b/.test(c))
    expect(speed.length, 'nothing for the fast player').toBeGreaterThanOrEqual(4)
    expect(care.length, 'nothing for the careful player').toBeGreaterThanOrEqual(4)
    expect(volume.length, 'nothing that simply accrues').toBeGreaterThanOrEqual(4)
  })

  it('gives the losing player something that still moves', () => {
    // Deaths climb win or lose. In a game about dying repeatedly, that is the one counter a
    // struggling player is guaranteed to advance — losing it would make a bad night blank.
    expect(counters.filter((c) => c === 'troll_run_deaths').length).toBeGreaterThanOrEqual(2)
  })

  it('ties the world tour to the number of worlds that actually ship', () => {
    // A literal 4 here would leave a trophy reading "all four" but meaning "any four" the day
    // a fifth world lands.
    const tour = TROLL_RUN.find((spec) => spec.suffix === 'all_worlds')
    expect(tour?.criteria).toEqual({ type: 'distinct', key: 'troll_run_worlds', gte: TROLL_RUN_WORLD_IDS.length })
  })

  it('never gives both a counter and a criteria', () => {
    for (const spec of TROLL_RUN) {
      expect(Boolean(spec.counter) !== Boolean(spec.criteria), `${spec.suffix} must have exactly one`).toBe(true)
    }
  })

  it('has unique suffixes and sort orders', () => {
    const suffixes = TROLL_RUN.map((spec) => spec.suffix)
    expect(new Set(suffixes).size).toBe(suffixes.length)
    const orders = TROLL_RUN.map((spec) => spec.sortOrder)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('climbs in points with tier', () => {
    const floor = { bronze: 0, silver: 20, gold: 45, platinum: 90 } as const
    for (const spec of TROLL_RUN) {
      expect(spec.points, `${spec.suffix} (${spec.tier})`).toBeGreaterThanOrEqual(floor[spec.tier])
    }
  })
})
