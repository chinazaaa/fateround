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
})
