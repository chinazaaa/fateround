import { describe, expect, it } from 'vitest'
import {
  checkTrollRunReachable,
  checkTrollRunSolvable,
  findTrollRunRoute,
  isStandableSpot,
  listStandingSpots,
  trollRunDoorIsBuried,
  trollRunDoorPlacements,
  trollRunFinalDoor,
  trollRunTilesAfterTraps,
} from './reach'
import {
  TROLL_RUN_GRID_COLS,
  TROLL_RUN_GRID_ROWS,
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TROLL_RUN_TILE_SIZE,
  TrollRunTileType,
  type TrollRunLevel,
  type TrollTrigger,
} from '../types'

const FLOOR_ROW = 9
const CEILING_ROW = 0

function emptyGrid(): number[][] {
  return Array.from({ length: TROLL_RUN_GRID_ROWS }, () => new Array(TROLL_RUN_GRID_COLS).fill(TrollRunTileType.EMPTY))
}

function fillRow(tiles: number[][], row: number, fromCol: number, toCol: number, tile: number): void {
  for (let col = fromCol; col <= toCol; col += 1) tiles[row][col] = tile
}

/** A level built for one assertion. Only the fields the solver reads have to be real. */
function testLevel(overrides: {
  tiles: number[][]
  spawn: { x: number; y: number }
  door: { x: number; y: number }
  triggers?: TrollTrigger[]
}): TrollRunLevel {
  return {
    id: 'reach-fixture',
    world: 'pits',
    name: 'Fixture',
    width: TROLL_RUN_INTERNAL_WIDTH,
    height: TROLL_RUN_INTERNAL_HEIGHT,
    spawn: overrides.spawn,
    door: overrides.door,
    tiles: overrides.tiles,
    triggers: overrides.triggers ?? [],
    parTime: 6,
  }
}

/** The door sitting on a platform, hitbox resting on its surface. */
function doorOnRow(col: number, row: number): { x: number; y: number } {
  return { x: col * TROLL_RUN_TILE_SIZE, y: row * TROLL_RUN_TILE_SIZE - 20 }
}

describe('isStandableSpot', () => {
  it('accepts solid and ice, and refuses what will not hold a runner up', () => {
    const tiles = emptyGrid()
    tiles[FLOOR_ROW][2] = TrollRunTileType.SOLID
    tiles[FLOOR_ROW][3] = TrollRunTileType.ICE
    tiles[FLOOR_ROW][4] = TrollRunTileType.BOUNCE
    tiles[FLOOR_ROW][5] = TrollRunTileType.FAKE_SOLID
    tiles[FLOOR_ROW][6] = TrollRunTileType.SPIKE_UP

    expect(isStandableSpot(tiles, 2, FLOOR_ROW)).toBe(true)
    expect(isStandableSpot(tiles, 3, FLOOR_ROW)).toBe(true)
    // A pad launches instead of supporting and a fake tile deletes itself underfoot.
    expect(isStandableSpot(tiles, 4, FLOOR_ROW)).toBe(false)
    expect(isStandableSpot(tiles, 5, FLOOR_ROW)).toBe(false)
    expect(isStandableSpot(tiles, 6, FLOOR_ROW)).toBe(false)
    expect(isStandableSpot(tiles, 7, FLOOR_ROW)).toBe(false)
  })

  it('refuses a spot whose headroom is taken by geometry or spikes', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, 5, TrollRunTileType.SOLID)
    tiles[FLOOR_ROW - 1][3] = TrollRunTileType.SOLID
    tiles[FLOOR_ROW - 1][4] = TrollRunTileType.SPIKE_DOWN

    expect(isStandableSpot(tiles, 2, FLOOR_ROW)).toBe(true)
    expect(isStandableSpot(tiles, 3, FLOOR_ROW)).toBe(false)
    expect(isStandableSpot(tiles, 4, FLOOR_ROW)).toBe(false)
  })

  it('reads the row above the support when gravity is inverted', () => {
    const tiles = emptyGrid()
    fillRow(tiles, CEILING_ROW, 0, 5, TrollRunTileType.SOLID)

    expect(isStandableSpot(tiles, 2, CEILING_ROW, true)).toBe(true)
    expect(isStandableSpot(tiles, 2, CEILING_ROW, false)).toBe(false)
  })

  it('lists exactly the spots a grid offers', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, 3, TrollRunTileType.SOLID)
    fillRow(tiles, 6, 10, 11, TrollRunTileType.SOLID)

    expect(listStandingSpots(tiles)).toEqual([
      { col: 10, supportRow: 6 },
      { col: 11, supportRow: 6 },
      { col: 0, supportRow: FLOOR_ROW },
      { col: 1, supportRow: FLOOR_ROW },
      { col: 2, supportRow: FLOOR_ROW },
      { col: 3, supportRow: FLOOR_ROW },
    ])
  })
})

describe('findTrollRunRoute', () => {
  it('walks an unbroken floor to the door', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    const level = testLevel({ tiles, spawn: { x: 32, y: 120 }, door: doorOnRow(17, FLOOR_ROW) })

    const route = findTrollRunRoute(level)
    expect(route).not.toBeNull()
    // 240px of walking at 160px/s cannot be done in under a second, and the solver may not pretend it can.
    expect(route?.seconds ?? 0).toBeGreaterThan(1)
  })

  it('clears a gap it has the airtime for, and refuses one it does not', () => {
    const jumpable = emptyGrid()
    fillRow(jumpable, FLOOR_ROW, 0, 8, TrollRunTileType.SOLID)
    fillRow(jumpable, FLOOR_ROW, 12, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    expect(
      findTrollRunRoute(testLevel({ tiles: jumpable, spawn: { x: 32, y: 120 }, door: doorOnRow(17, FLOOR_ROW) }))
    ).not.toBeNull()

    // Eleven empty columns is 176px of gap against a 104px flat jump, and the pit below is fatal.
    const impossible = emptyGrid()
    fillRow(impossible, FLOOR_ROW, 0, 3, TrollRunTileType.SOLID)
    fillRow(impossible, FLOOR_ROW, 15, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    expect(
      findTrollRunRoute(testLevel({ tiles: impossible, spawn: { x: 32, y: 120 }, door: doorOnRow(17, FLOOR_ROW) }))
    ).toBeNull()
  })

  it('refuses a door walled off by geometry taller than a jump', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    for (let row = 4; row <= FLOOR_ROW - 1; row += 1) tiles[row][10] = TrollRunTileType.SOLID

    const level = testLevel({ tiles, spawn: { x: 32, y: 120 }, door: doorOnRow(17, FLOOR_ROW) })
    expect(findTrollRunRoute(level)).toBeNull()
  })

  it('refuses a landing paved with spikes', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, 8, TrollRunTileType.SOLID)
    fillRow(tiles, FLOOR_ROW, 12, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    fillRow(tiles, FLOOR_ROW - 1, 12, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SPIKE_UP)

    const level = testLevel({ tiles, spawn: { x: 32, y: 120 }, door: doorOnRow(17, FLOOR_ROW - 1) })
    expect(findTrollRunRoute(level)).toBeNull()
  })

  it('reaches a trigger zone when asked for one instead of the door', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    const level = testLevel({ tiles, spawn: { x: 32, y: 120 }, door: doorOnRow(17, FLOOR_ROW) })

    const route = findTrollRunRoute(level, { target: { x: 160, y: 112, w: 32, h: 32 } })
    expect(route).not.toBeNull()
    expect(route?.arrival.x ?? 0).toBeGreaterThan(140)
  })

  it('searches the ceiling when gravity is inverted', () => {
    const tiles = emptyGrid()
    fillRow(tiles, CEILING_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    const door = { x: 272, y: 16 }
    const level = testLevel({ tiles, spawn: { x: 32, y: 32 }, door })

    expect(findTrollRunRoute(level, { gravityUp: true })).not.toBeNull()
    // The same room the normal way up has nothing to stand on at all.
    expect(findTrollRunRoute(level)).toBeNull()
  })
})

describe('door bookkeeping', () => {
  it('reports the layout position plus everywhere a trap sends the door', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    const level = testLevel({
      tiles,
      spawn: { x: 32, y: 120 },
      door: { x: 100, y: 124 },
      triggers: [
        {
          id: 'relocate',
          zone: { x: 80, y: 100, w: 32, h: 44 },
          condition: 'enter',
          actions: [{ type: 'move_door', to: { x: 260, y: 124 }, duration: 0.4 }],
        },
        {
          id: 'flee',
          zone: { x: 200, y: 100, w: 32, h: 44 },
          condition: 'enter',
          actions: [{ type: 'door_runs_away', direction: 'left', distance: 40, duration: 0.4 }],
        },
      ],
    })

    expect(trollRunDoorPlacements(level)).toEqual([
      { x: 100, y: 124, origin: 'layout' },
      { x: 260, y: 124, origin: 'move_door from relocate' },
      { x: 60, y: 124, origin: 'door_runs_away left from flee' },
    ])
    // The last placement is where the level actually ends, so that is what has to be reachable.
    expect(trollRunFinalDoor(level)).toEqual({ x: 60, y: 124 })
  })

  it('knows a door buried in geometry from one in open air', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    fillRow(tiles, 5, 8, 10, TrollRunTileType.SOLID)

    expect(trollRunDoorIsBuried(tiles, doorOnRow(2, FLOOR_ROW))).toBe(false)
    // Straddling row 5 at col 9 puts the hitbox inside the platform.
    expect(trollRunDoorIsBuried(tiles, { x: 144, y: 72 })).toBe(true)
  })

  it('applies every tile-editing trap at once', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    const level = testLevel({
      tiles,
      spawn: { x: 32, y: 120 },
      door: doorOnRow(17, FLOOR_ROW),
      triggers: [
        {
          zone: { x: 80, y: 100, w: 32, h: 44 },
          condition: 'enter',
          actions: [
            { type: 'collapse_tiles', tiles: [[6, FLOOR_ROW]], delay: 0.2 },
            { type: 'spawn_spikes', positions: [[7, FLOOR_ROW]], direction: 'up' },
            { type: 'ice_floor', tiles: [[8, FLOOR_ROW]] },
            // Out of the grid entirely: a trap that addresses nothing must not throw.
            { type: 'collapse_tiles', tiles: [[99, 99]], delay: 0.2 },
          ],
        },
      ],
    })

    const sprung = trollRunTilesAfterTraps(level)
    expect(sprung[FLOOR_ROW][6]).toBe(TrollRunTileType.EMPTY)
    expect(sprung[FLOOR_ROW][7]).toBe(TrollRunTileType.SPIKE_UP)
    expect(sprung[FLOOR_ROW][8]).toBe(TrollRunTileType.ICE)
    // The level's own grid is left alone — it is a shared singleton in production.
    expect(level.tiles[FLOOR_ROW][6]).toBe(TrollRunTileType.SOLID)
  })
})

describe('checkTrollRunReachable / checkTrollRunSolvable', () => {
  it('follows a door that a trap moves rather than the one on the layout', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    // The layout door is right beside the spawn, so only the destination can make this level fail.
    const level = testLevel({
      tiles,
      spawn: { x: 32, y: 120 },
      door: doorOnRow(3, FLOOR_ROW),
      triggers: [
        {
          zone: { x: 80, y: 100, w: 32, h: 44 },
          condition: 'enter',
          // Row 9 is the floor, so a door pushed down into row 10 is inside the ground.
          actions: [{ type: 'move_door', to: { x: 260, y: 160 }, duration: 0.4 }],
        },
      ],
    })

    expect(checkTrollRunReachable(level).solvable).toBe(false)
  })

  it('takes the two legs a gravity flip needs when the floor is fatal', () => {
    const tiles = emptyGrid()
    fillRow(tiles, CEILING_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    fillRow(tiles, FLOOR_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)

    const level = testLevel({
      tiles,
      spawn: { x: 32, y: 120 },
      // Mounted under the ceiling, out of reach of any jump from the floor 128px below.
      door: { x: 272, y: 16 },
      triggers: [
        {
          id: 'gate',
          zone: { x: 64, y: 96, w: 32, h: 48 },
          condition: 'enter',
          actions: [{ type: 'flip_gravity' }],
        },
      ],
    })

    const verdict = checkTrollRunReachable(level)
    expect(verdict.solvable).toBe(true)
    expect(verdict.via).toBe('gravity-flip')
    expect(verdict.seconds).toBeGreaterThan(1)
  })

  it('fails a level that only the untouched layout can be cleared on', () => {
    const tiles = emptyGrid()
    fillRow(tiles, FLOOR_ROW, 0, TROLL_RUN_GRID_COLS - 1, TrollRunTileType.SOLID)
    fillRow(tiles, FLOOR_ROW + 1, 6, 13, TrollRunTileType.SPIKE_UP)

    const collapsing: [number, number][] = []
    for (let col = 6; col <= 13; col += 1) collapsing.push([col, FLOOR_ROW])

    const level = testLevel({
      tiles,
      spawn: { x: 32, y: 120 },
      door: doorOnRow(17, FLOOR_ROW),
      triggers: [
        {
          id: 'the-long-drop',
          zone: { x: 80, y: 100, w: 32, h: 44 },
          condition: 'enter',
          actions: [{ type: 'collapse_tiles', tiles: collapsing, delay: 0.2 }],
        },
      ],
    })

    // Walkable as laid out, but eight collapsed columns over spikes is not a gap anyone can jump.
    expect(checkTrollRunReachable(level).solvable).toBe(true)
    expect(checkTrollRunSolvable(level).solvable).toBe(false)
  })
})
