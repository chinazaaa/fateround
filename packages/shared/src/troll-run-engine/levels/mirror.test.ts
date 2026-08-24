import { describe, expect, it } from 'vitest'
import { ALL_TROLL_RUN_LEVELS } from './catalogue'
import { mirrorTrollRunLevel } from './mirror'
import { checkTrollRunReachable, trollRunDoorIsBuried, trollRunDoorPlacements } from './reach'
import {
  TROLL_RUN_DOOR_HEIGHT,
  TROLL_RUN_DOOR_WIDTH,
  TROLL_RUN_GRID_COLS,
  TROLL_RUN_GRID_ROWS,
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TROLL_RUN_SPAWNED_ENTITY_SIZE,
  TrollRunTileType,
  type TrollRunLevel,
} from '../types'

function countTiles(level: TrollRunLevel, tile: number): number {
  return level.tiles.reduce((total, row) => total + row.filter((cell) => cell === tile).length, 0)
}

describe('mirrorTrollRunLevel', () => {
  it('is its own inverse, so mirroring twice returns the level it started from', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      const roundTrip = mirrorTrollRunLevel(mirrorTrollRunLevel(level, `${level.id}:m`), level.id)
      expect(roundTrip, `${level.id} does not survive a double mirror`).toEqual(level)
    }
  })

  it('leaves the original untouched, since authored levels are shared singletons', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      const before = structuredClone(level)
      mirrorTrollRunLevel(level, `${level.id}:m`)
      expect(level, `${level.id} was mutated by mirroring`).toEqual(before)
    }
  })

  it('keeps every tile, only swapping the spikes that point sideways', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      const mirrored = mirrorTrollRunLevel(level, `${level.id}:m`)

      for (const tile of [
        TrollRunTileType.SOLID,
        TrollRunTileType.FAKE_SOLID,
        TrollRunTileType.SPIKE_UP,
        TrollRunTileType.SPIKE_DOWN,
        TrollRunTileType.ICE,
        TrollRunTileType.BOUNCE,
        TrollRunTileType.COIN,
      ]) {
        expect(countTiles(mirrored, tile), `${level.id}: tile ${tile} count changed`).toBe(countTiles(level, tile))
      }

      expect(countTiles(mirrored, TrollRunTileType.SPIKE_LEFT), `${level.id}: left spikes`).toBe(
        countTiles(level, TrollRunTileType.SPIKE_RIGHT)
      )
      expect(countTiles(mirrored, TrollRunTileType.SPIKE_RIGHT), `${level.id}: right spikes`).toBe(
        countTiles(level, TrollRunTileType.SPIKE_LEFT)
      )
    }
  })

  it('reflects the grid column by column', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      const mirrored = mirrorTrollRunLevel(level, `${level.id}:m`)

      expect(mirrored.tiles).toHaveLength(level.tiles.length)
      for (let row = 0; row < level.tiles.length; row += 1) {
        for (let col = 0; col < TROLL_RUN_GRID_COLS; col += 1) {
          const source = level.tiles[row][TROLL_RUN_GRID_COLS - 1 - col]
          const sideways =
            source === TrollRunTileType.SPIKE_LEFT || source === TrollRunTileType.SPIKE_RIGHT
              ? source === TrollRunTileType.SPIKE_LEFT
                ? TrollRunTileType.SPIKE_RIGHT
                : TrollRunTileType.SPIKE_LEFT
              : source
          expect(mirrored.tiles[row][col], `${level.id}: tile at ${col},${row}`).toBe(sideways)
        }
      }
    }
  })

  it('holds the geometry invariants the authored levels are held to', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      const mirrored = mirrorTrollRunLevel(level, `${level.id}:m`)

      expect(mirrored.spawn.x, `${mirrored.id}: spawn left edge`).toBeGreaterThanOrEqual(0)
      expect(mirrored.spawn.x, `${mirrored.id}: spawn right edge`).toBeLessThan(TROLL_RUN_INTERNAL_WIDTH)

      for (const door of trollRunDoorPlacements(mirrored)) {
        const where = `${mirrored.id} (${door.origin})`
        expect(door.x, `${where}: door left edge`).toBeGreaterThanOrEqual(0)
        expect(door.x + TROLL_RUN_DOOR_WIDTH, `${where}: door right edge`).toBeLessThanOrEqual(TROLL_RUN_INTERNAL_WIDTH)
        expect(door.y, `${where}: door top edge`).toBeGreaterThanOrEqual(0)
        expect(door.y + TROLL_RUN_DOOR_HEIGHT, `${where}: door bottom edge`).toBeLessThanOrEqual(
          TROLL_RUN_INTERNAL_HEIGHT
        )
        expect(trollRunDoorIsBuried(mirrored.tiles, door), `${where}: door is buried`).toBe(false)
      }

      for (const trigger of mirrored.triggers) {
        const where = `${mirrored.id} / ${trigger.id ?? 'trigger'}`
        expect(trigger.zone.x, `${where}: zone left edge`).toBeGreaterThanOrEqual(0)
        expect(trigger.zone.x + trigger.zone.w, `${where}: zone right edge`).toBeLessThanOrEqual(
          TROLL_RUN_INTERNAL_WIDTH
        )

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
          }
        }
      }
    }
  })

  /**
   * A reflection is exact in the continuous plane, but tile arithmetic has a preferred side:
   * `Math.floor(x / 16)` does not commute with `320 - x`, so a level tuned to a sub-pixel window can
   * lose it when reflected. `doors-09` is the one authored level that does — its bounce arc holds the
   * runner level with the sky door for about half a second, and the reflected arc misses. That is why
   * `buildTrollRunRoundDescriptors` validates a mirror before it emits one; this test records the
   * levels that check exists for, so adding a level that cannot be mirrored is visible rather than silent.
   */
  it('preserves reachability everywhere except the level tuned to sub-pixel timing', () => {
    const lostTheirRoute = ALL_TROLL_RUN_LEVELS.filter(
      (level) =>
        checkTrollRunReachable(level).solvable &&
        !checkTrollRunReachable(mirrorTrollRunLevel(level, `${level.id}:m`)).solvable
    ).map((level) => level.id)

    expect(lostTheirRoute).toEqual(['doors-09'])
  })

  // A patrol band that kept its original bounds after reflection would put the machinery somewhere
  // else entirely — a press sweeping the left wall of a level whose corridor is now on the right.
  it('reflects horizontal patrol bounds and leaves vertical ones alone', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      const mirrored = mirrorTrollRunLevel(level, `${level.id}:m`)
      const original = level.movingEntities ?? []
      const reflected = mirrored.movingEntities ?? []

      expect(reflected, `${level.id}: entity count changed`).toHaveLength(original.length)

      original.forEach((entity, entityIndex) => {
        const copy = reflected[entityIndex]
        const where = `${level.id} / ${entity.id}`

        expect(copy.x, `${where}: x`).toBe(TROLL_RUN_INTERNAL_WIDTH - entity.x - entity.w)
        expect(copy.w, `${where}: width`).toBe(entity.w)
        expect(copy.h, `${where}: height`).toBe(entity.h)
        if (entity.vx !== undefined) {
          expect(copy.vx, `${where}: vx flips`).toBe(-entity.vx)
        }
        expect(copy.vy, `${where}: vy is unchanged`).toBe(entity.vy)

        if (!entity.patrol) {
          expect(copy.patrol, `${where}: patrol stays absent`).toBeUndefined()
          return
        }

        if (entity.patrol.minX !== undefined) {
          expect(copy.patrol?.maxX, `${where}: minX becomes maxX`).toBe(
            TROLL_RUN_INTERNAL_WIDTH - entity.patrol.minX - entity.w
          )
        }
        if (entity.patrol.maxX !== undefined) {
          expect(copy.patrol?.minX, `${where}: maxX becomes minX`).toBe(
            TROLL_RUN_INTERNAL_WIDTH - entity.patrol.maxX - entity.w
          )
        }
        expect(copy.patrol?.minY, `${where}: minY is unchanged`).toBe(entity.patrol.minY)
        expect(copy.patrol?.maxY, `${where}: maxY is unchanged`).toBe(entity.patrol.maxY)
      })
    }
  })

  // A pulse has no handedness, so the mirror keeps its values — but it must hand over a copy.
  // `mirrorEntity` spreads the entity, and a shared `pulse` would let a mirrored level write into the
  // authored singleton that every other client is reading.
  it('copies a pulse through the mirror verbatim rather than sharing it', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      const mirrored = mirrorTrollRunLevel(level, `${level.id}:m`)
      const reflected = mirrored.movingEntities ?? []

      ;(level.movingEntities ?? []).forEach((entity, entityIndex) => {
        const copy = reflected[entityIndex]
        const where = `${level.id} / ${entity.id}`

        if (!entity.pulse) {
          expect(copy.pulse, `${where}: pulse stays absent`).toBeUndefined()
          return
        }

        expect(copy.pulse, `${where}: pulse values`).toEqual(entity.pulse)
        expect(copy.pulse, `${where}: pulse is shared with the authored level`).not.toBe(entity.pulse)
      })
    }
  })

  // The mirror reads the spawn box from the action, so a widened spawn keeps its size through a
  // reflection rather than snapping back to the 14px default the engine used before `size` existed.
  it('carries a spawned entity size through the mirror', () => {
    for (const level of ALL_TROLL_RUN_LEVELS) {
      const mirrored = mirrorTrollRunLevel(level, `${level.id}:m`)

      level.triggers.forEach((trigger, triggerIndex) => {
        trigger.actions.forEach((action, actionIndex) => {
          if (action.type !== 'spawn_entity') return
          const copy = mirrored.triggers[triggerIndex].actions[actionIndex]
          expect(copy.type).toBe('spawn_entity')
          if (copy.type !== 'spawn_entity') return

          const where = `${level.id} / trigger #${triggerIndex}`
          expect(copy.size, `${where}: spawn size`).toBe(action.size)
          expect(copy.solid, `${where}: spawn solidity`).toBe(action.solid)
          expect(copy.entityType, `${where}: spawn type`).toBe(action.entityType)

          const spawnWidth = action.size ?? TROLL_RUN_SPAWNED_ENTITY_SIZE
          expect(copy.position.x, `${where}: spawn x`).toBe(TROLL_RUN_INTERNAL_WIDTH - action.position.x - spawnWidth)
          expect(copy.position.y, `${where}: spawn y`).toBe(action.position.y)
          if (action.velocity) {
            expect(copy.velocity?.x, `${where}: spawn vx flips`).toBe(-action.velocity.x)
            expect(copy.velocity?.y, `${where}: spawn vy is unchanged`).toBe(action.velocity.y)
          }
        })
      })
    }
  })
})
