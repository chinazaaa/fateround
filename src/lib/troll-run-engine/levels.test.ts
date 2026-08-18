import { describe, expect, it } from 'vitest'
import {
  ALL_TROLL_RUN_LEVELS,
  TROLL_RUN_WORLDS,
  WORLD_1_LEVELS,
  WORLD_2_LEVELS,
  WORLD_3_LEVELS,
  WORLD_4_LEVELS,
  getWorldLevels,
} from './levels'
import { TROLL_RUN_INTERNAL_HEIGHT, TROLL_RUN_INTERNAL_WIDTH } from './types'

describe('Troll Run Level Registry & Worlds', () => {
  it('contains exactly 4 worlds and 40 total levels', () => {
    expect(TROLL_RUN_WORLDS).toHaveLength(4)
    expect(WORLD_1_LEVELS).toHaveLength(10)
    expect(WORLD_2_LEVELS).toHaveLength(10)
    expect(WORLD_3_LEVELS).toHaveLength(10)
    expect(WORLD_4_LEVELS).toHaveLength(10)
    expect(ALL_TROLL_RUN_LEVELS).toHaveLength(40)
  })

  it('correctly routes world levels via getWorldLevels', () => {
    expect(getWorldLevels('pits')).toBe(WORLD_1_LEVELS)
    expect(getWorldLevels('doors')).toBe(WORLD_2_LEVELS)
    expect(getWorldLevels('gravity')).toBe(WORLD_3_LEVELS)
    expect(getWorldLevels('gauntlet')).toBe(WORLD_4_LEVELS)
    expect(getWorldLevels(null)).toBe(WORLD_1_LEVELS)
  })

  it('ensures each of the 40 levels has valid geometry, spawn point, door, and par times', () => {
    const seenIds = new Set<string>()

    for (const lvl of ALL_TROLL_RUN_LEVELS) {
      // Unique ID
      expect(seenIds.has(lvl.id)).toBe(false)
      seenIds.add(lvl.id)

      expect(lvl.name).toBeTruthy()
      expect(lvl.world).toBeTruthy()
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

      // Par time configured
      expect(lvl.parTime).toBeGreaterThan(0)
    }
  })
})
