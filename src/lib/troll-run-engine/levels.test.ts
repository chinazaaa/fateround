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
import { checkTrollRunReachable, trollRunDoorIsBuried, trollRunDoorPlacements } from './levels/reach'
import {
  TROLL_RUN_DOOR_HEIGHT,
  TROLL_RUN_DOOR_WIDTH,
  TROLL_RUN_GRID_COLS,
  TROLL_RUN_GRID_ROWS,
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
} from './types'

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

  it('leaves every door — including the ones traps move — inside the level and clear of geometry', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      for (const door of trollRunDoorPlacements(level)) {
        const where = `${level.id} (${door.origin})`

        expect(door.x, `${where}: door left edge`).toBeGreaterThanOrEqual(0)
        expect(door.x + TROLL_RUN_DOOR_WIDTH, `${where}: door right edge`).toBeLessThanOrEqual(TROLL_RUN_INTERNAL_WIDTH)
        expect(door.y, `${where}: door top edge`).toBeGreaterThanOrEqual(0)
        expect(door.y + TROLL_RUN_DOOR_HEIGHT, `${where}: door bottom edge`).toBeLessThanOrEqual(
          TROLL_RUN_INTERNAL_HEIGHT
        )

        expect(trollRunDoorIsBuried(level.tiles, door), `${where}: door is buried in solid tiles`).toBe(false)
      }
    }
  })

  // Reachability, not the harsher all-traps-sprung bar: several authored levels are deliberately
  // cleverer than that, and `checkTrollRunSolvable`'s own comment says so. What no authored level may
  // be is a dead end on its own layout — the fault "The Grand Chase" shipped with.
  it('gives every authored level a route from spawn to its final door position', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      const verdict = checkTrollRunReachable(level)
      expect(verdict.solvable, `${level.id} (${level.name}) has no route to its door`).toBe(true)
      expect(verdict.seconds, `${level.id}: route is instant, so the door sits on the spawn`).toBeGreaterThan(0)
    }
  })

  it('keeps trigger zones and the tiles their actions address inside the grid', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      level.triggers.forEach((trigger, triggerIndex) => {
        const where = `${level.id} / ${trigger.id ?? `trigger #${triggerIndex}`}`

        expect(trigger.zone.w, `${where}: zone width`).toBeGreaterThan(0)
        expect(trigger.zone.h, `${where}: zone height`).toBeGreaterThan(0)
        expect(trigger.zone.x, `${where}: zone left edge`).toBeGreaterThanOrEqual(0)
        expect(trigger.zone.x + trigger.zone.w, `${where}: zone right edge`).toBeLessThanOrEqual(
          TROLL_RUN_INTERNAL_WIDTH
        )
        expect(trigger.zone.y, `${where}: zone top edge`).toBeGreaterThanOrEqual(0)
        expect(trigger.zone.y + trigger.zone.h, `${where}: zone bottom edge`).toBeLessThanOrEqual(
          TROLL_RUN_INTERNAL_HEIGHT
        )

        // A trap that names a tile outside the grid silently does nothing, which reads in play as a
        // trap that never fires rather than as a level-authoring mistake.
        for (const action of trigger.actions) {
          const addressedTiles =
            action.type === 'collapse_tiles'
              ? action.tiles
              : action.type === 'spawn_spikes'
                ? action.positions
                : action.type === 'ice_floor'
                  ? action.tiles
                  : []

          for (const [col, row] of addressedTiles) {
            expect(col, `${where}: ${action.type} column`).toBeGreaterThanOrEqual(0)
            expect(col, `${where}: ${action.type} column`).toBeLessThan(TROLL_RUN_GRID_COLS)
            expect(row, `${where}: ${action.type} row`).toBeGreaterThanOrEqual(0)
            expect(row, `${where}: ${action.type} row`).toBeLessThan(TROLL_RUN_GRID_ROWS)
            expect(level.tiles[row]?.[col], `${where}: ${action.type} targets a tile that exists`).not.toBeUndefined()
          }
        }
      })
    }
  })
})
