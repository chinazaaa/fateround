/**
 * World 3: GRAVITY INVERSION & CONTROL INVERTERS (10 Levels)
 *
 * Grid is 20 cols x 11 rows (320x176 pixels, tile size = 16).
 * Tile types:
 * 0 = Empty, 1 = Solid, 2 = Fake Solid, 3 = Spike Up, 4 = Spike Down, 7 = Ice, 8 = Bounce, 9 = Coin
 */

import { TrollRunTileType, type TrollRunLevel } from '../types'

function createEmptyGrid(): number[][] {
  const grid: number[][] = []
  for (let r = 0; r < 11; r++) {
    grid.push(new Array(20).fill(TrollRunTileType.EMPTY))
  }
  return grid
}

export const WORLD_3_LEVELS: TrollRunLevel[] = [
  // -------------------------------------------------------------
  // LEVEL 1: "Upside Down"
  // Trap: Mid-corridor trigger flips gravity to the ceiling!
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    // Floor
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Ceiling
    for (let c = 0; c < 20; c++) tiles[1][c] = TrollRunTileType.SOLID
    // Spikes on floor ahead
    for (let c = 12; c <= 17; c++) tiles[8][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'gravity-01',
      world: 'gravity',
      name: 'Upside Down',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 36 },
      tiles,
      triggers: [
        {
          zone: { x: 120, y: 60, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'flip_gravity',
            },
          ],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 2: "Confused Direction"
  // Trap: Control inverter trigger zone right before a jump.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 7; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 12; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 8; c < 12; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'gravity-02',
      world: 'gravity',
      name: 'Confused Direction',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 80, y: 60, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'invert_controls',
              duration: 3.5,
            },
          ],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 3: "Gravity Seesaw"
  // Trap: Flips gravity up, then flips it back down over alternating pits.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    // Floor
    for (let c = 0; c <= 6; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 13; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 7; c < 13; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    // Ceiling
    for (let c = 0; c < 20; c++) tiles[1][c] = TrollRunTileType.SOLID
    // Spikes hanging from ceiling on right
    for (let c = 14; c <= 18; c++) tiles[2][c] = TrollRunTileType.SPIKE_DOWN

    return {
      id: 'gravity-03',
      world: 'gravity',
      name: 'Gravity Seesaw',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 80, y: 60, w: 30, h: 80 },
          condition: 'enter',
          actions: [{ type: 'flip_gravity' }],
        },
        {
          zone: { x: 190, y: 20, w: 30, h: 60 },
          condition: 'enter',
          actions: [{ type: 'flip_gravity' }],
        },
      ],
      parTime: 6,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 4: "Ceiling Runner"
  // Trap: Floor is all spikes, gravity immediately flipped.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    // Floor is spikes
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SPIKE_UP
    // Spawn island
    tiles[9][1] = TrollRunTileType.SOLID
    tiles[9][2] = TrollRunTileType.SOLID

    // Ceiling
    for (let c = 0; c < 20; c++) tiles[1][c] = TrollRunTileType.SOLID
    // Ceiling obstacle
    tiles[2][10] = TrollRunTileType.SPIKE_DOWN
    tiles[2][11] = TrollRunTileType.SPIKE_DOWN

    return {
      id: 'gravity-04',
      world: 'gravity',
      name: 'Ceiling Runner',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 272, y: 36 },
      tiles,
      triggers: [
        {
          zone: { x: 16, y: 60, w: 50, h: 80 },
          condition: 'enter',
          actions: [{ type: 'flip_gravity' }],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 5: "Double Trouble"
  // Trap: Controls invert AND tiles collapse under foot.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 8; c <= 12; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'gravity-05',
      world: 'gravity',
      name: 'Double Trouble',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 90, y: 60, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            { type: 'invert_controls', duration: 4 },
            {
              type: 'collapse_tiles',
              tiles: [
                [8, 9],
                [9, 9],
                [10, 9],
                [11, 9],
                [12, 9],
              ],
            },
          ],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 6: "The Low Jump Test"
  // Trap: Spikes line the ceiling; a max-height jump will impale you!
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Pit in floor
    tiles[9][10] = TrollRunTileType.EMPTY
    tiles[10][10] = TrollRunTileType.SPIKE_UP

    // Low ceiling of spikes
    for (let c = 8; c <= 12; c++) tiles[4][c] = TrollRunTileType.SPIKE_DOWN

    return {
      id: 'gravity-06',
      world: 'gravity',
      name: 'The Low Jump Test',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 7: "Mirror World"
  // Trap: Controls inverted from the moment you spawn.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Tricky jumps
    tiles[9][6] = TrollRunTileType.EMPTY
    tiles[10][6] = TrollRunTileType.SPIKE_UP
    tiles[9][13] = TrollRunTileType.EMPTY
    tiles[10][13] = TrollRunTileType.SPIKE_UP

    return {
      id: 'gravity-07',
      world: 'gravity',
      name: 'Mirror World',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 0, y: 0, w: 100, h: 180 },
          condition: 'enter',
          actions: [{ type: 'invert_controls', duration: 10 }],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 8: "The High Bounce"
  // Trap: Bounce pad sends player into an inverted gravity zone.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 5; c++) tiles[9][c] = TrollRunTileType.SOLID
    tiles[9][6] = TrollRunTileType.BOUNCE
    for (let c = 7; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    // Ceiling
    for (let c = 0; c < 20; c++) tiles[1][c] = TrollRunTileType.SOLID
    for (let c = 12; c <= 16; c++) tiles[8][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'gravity-08',
      world: 'gravity',
      name: 'The High Bounce',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 36 },
      tiles,
      triggers: [
        {
          zone: { x: 96, y: 20, w: 40, h: 80 },
          condition: 'enter',
          actions: [{ type: 'flip_gravity' }],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 9: "Upside Down Pit"
  // Trap: Running on ceiling over hanging spikes.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    // Ceiling with gap
    for (let c = 0; c <= 6; c++) tiles[1][c] = TrollRunTileType.SOLID
    for (let c = 12; c < 20; c++) tiles[1][c] = TrollRunTileType.SOLID
    for (let c = 7; c < 12; c++) tiles[0][c] = TrollRunTileType.SPIKE_DOWN

    // Floor is all spikes
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SPIKE_UP
    tiles[9][1] = TrollRunTileType.SOLID
    tiles[9][2] = TrollRunTileType.SOLID

    return {
      id: 'gravity-09',
      world: 'gravity',
      name: 'Upside Down Pit',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 272, y: 36 },
      tiles,
      triggers: [
        {
          zone: { x: 10, y: 60, w: 50, h: 80 },
          condition: 'enter',
          actions: [{ type: 'flip_gravity' }],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 10: "Orbital Chaos"
  // Trap: Double gravity flips and runaway door on ceiling!
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    // Floor
    for (let c = 0; c <= 5; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 14; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 6; c < 14; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    // Ceiling
    for (let c = 0; c < 20; c++) tiles[1][c] = TrollRunTileType.SOLID

    return {
      id: 'gravity-10',
      world: 'gravity',
      name: 'Orbital Chaos',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 160, y: 36 },
      tiles,
      triggers: [
        {
          zone: { x: 70, y: 60, w: 30, h: 80 },
          condition: 'enter',
          actions: [{ type: 'flip_gravity' }],
        },
        {
          zone: { x: 130, y: 20, w: 40, h: 60 },
          condition: 'enter',
          actions: [
            {
              type: 'door_runs_away',
              direction: 'right',
              distance: 112,
              duration: 0.4,
            },
          ],
        },
      ],
      parTime: 6,
    }
  })(),
]
