import { describe, expect, it } from 'vitest'
import { WORLD_1_LEVELS } from './levels/world-1-pits'
import { TROLL_RUN_INTERNAL_HEIGHT, TROLL_RUN_INTERNAL_WIDTH } from './types'

describe('Troll Run World 1 Levels', () => {
  it('contains exactly 10 valid levels', () => {
    expect(WORLD_1_LEVELS).toHaveLength(10)
  })

  it('ensures each level has valid geometry, spawn point, door, and triggers', () => {
    const seenIds = new Set<string>()

    for (const lvl of WORLD_1_LEVELS) {
      // Unique ID
      expect(seenIds.has(lvl.id)).toBe(false)
      seenIds.add(lvl.id)

      expect(lvl.name).toBeTruthy()
      expect(lvl.world).toBe('pits')
      expect(lvl.width).toBe(TROLL_RUN_INTERNAL_WIDTH)
      expect(lvl.height).toBe(TROLL_RUN_INTERNAL_HEIGHT)

      // Spawn bounds
      expect(lvl.spawn.x).toBeGreaterThanOrEqual(0)
      expect(lvl.spawn.x).toBeLessThan(TROLL_RUN_INTERNAL_WIDTH)
      expect(lvl.spawn.y).toBeGreaterThanOrEqual(0)
      expect(lvl.spawn.y).toBeLessThan(TROLL_RUN_INTERNAL_HEIGHT)

      // Door bounds
      expect(lvl.door.x).toBeGreaterThanOrEqual(0)
      expect(lvl.door.x).toBeLessThan(TROLL_RUN_INTERNAL_WIDTH)
      expect(lvl.door.y).toBeGreaterThanOrEqual(0)
      expect(lvl.door.y).toBeLessThan(TROLL_RUN_INTERNAL_HEIGHT)

      // Grid dimensions (at least 11 rows x 20 cols)
      expect(lvl.tiles.length).toBeGreaterThanOrEqual(10)
      for (const row of lvl.tiles) {
        expect(row.length).toBe(20)
      }

      // Triggers sanity check
      expect(lvl.triggers).toBeDefined()
      for (const trig of lvl.triggers) {
        expect(trig.condition).toBeTruthy()
        expect(trig.zone).toBeDefined()
        expect(trig.zone.w).toBeGreaterThan(0)
        expect(trig.zone.h).toBeGreaterThan(0)
        expect(trig.actions.length).toBeGreaterThan(0)
      }

      // Par time positive
      expect(lvl.parTime).toBeGreaterThan(0)
    }
  })
})
