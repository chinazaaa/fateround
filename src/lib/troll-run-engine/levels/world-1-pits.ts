/**
 * World 1: PITS & COLLAPSES (10 Levels)
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

export const WORLD_1_LEVELS: TrollRunLevel[] = [
  // -------------------------------------------------------------
  // LEVEL 1: "Welcome"
  // Trap: 3 tiles right before the door collapse into a pit.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    // Floor on row 9
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Spikes under the floor if it collapses
    for (let c = 12; c <= 15; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'pits-01',
      world: 'pits',
      name: 'Welcome',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 160, y: 80, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [12, 9],
                [13, 9],
                [14, 9],
              ],
            },
          ],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 2: "A Small Gap"
  // Trap: Jumping over the gap causes the landing platform to slide 2 tiles right.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    // Left ledge
    for (let c = 0; c <= 6; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Gap c=7..8 (pit at bottom)
    for (let c = 7; c <= 8; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP
    // Right ledge
    for (let c = 9; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    return {
      id: 'pits-02',
      world: 'pits',
      name: 'A Small Gap',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 96, y: 80, w: 32, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [9, 9],
                [10, 9],
              ],
            },
          ],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 3: "Keep Moving"
  // Trap: Bridge tiles disintegrate one-by-one with short delays.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 3; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 4; c <= 15; c++) tiles[9][c] = TrollRunTileType.SOLID // bridge
    for (let c = 4; c <= 15; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP // pit below
    for (let c = 16; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    return {
      id: 'pits-03',
      world: 'pits',
      name: 'Keep Moving',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 280, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 64, y: 80, w: 32, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [4, 9],
                [5, 9],
              ],
              delay: 0.1,
            },
            {
              type: 'collapse_tiles',
              tiles: [
                [6, 9],
                [7, 9],
              ],
              delay: 0.35,
            },
            {
              type: 'collapse_tiles',
              tiles: [
                [8, 9],
                [9, 9],
              ],
              delay: 0.6,
            },
            {
              type: 'collapse_tiles',
              tiles: [
                [10, 9],
                [11, 9],
              ],
              delay: 0.85,
            },
            {
              type: 'collapse_tiles',
              tiles: [
                [12, 9],
                [13, 9],
              ],
              delay: 1.1,
            },
          ],
        },
      ],
      parTime: 6,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 4: "Runaway Door"
  // Trap: Approaching the door causes it to scoot 120px to the left!
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    return {
      id: 'pits-04',
      world: 'pits',
      name: 'Runaway Door',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 220, y: 80, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'door_runs_away',
              direction: 'left',
              distance: 140,
              duration: 0.3,
            },
          ],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 5: "Spike Surprise"
  // Trap: Walking across flat ground spawns spikes directly ahead.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    return {
      id: 'pits-05',
      world: 'pits',
      name: 'Spike Surprise',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 112, y: 80, w: 32, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_spikes',
              positions: [
                [9, 9],
                [10, 9],
                [11, 9],
              ],
              direction: 'up',
            },
          ],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 6: "Free Coin"
  // Trap: The coin triggers the platform beneath to drop into spikes.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 5; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 6; c <= 12; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 6; c <= 12; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP
    for (let c = 13; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Coin in middle
    tiles[7][9] = TrollRunTileType.COIN

    return {
      id: 'pits-06',
      world: 'pits',
      name: 'Free Coin',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 136, y: 96, w: 24, h: 40 },
          condition: 'collect_coin',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [7, 9],
                [8, 9],
                [9, 9],
                [10, 9],
              ],
            },
          ],
        },
      ],
      parTime: 6,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 7: "The Elevator"
  // Trap: High ledge with door. Stepping on the elevator causes it to sink.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 4; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Elevated door ledge on right
    for (let c = 14; c < 20; c++) tiles[5][c] = TrollRunTileType.SOLID
    // Bottom spike bed
    for (let c = 5; c < 20; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    // Mid platform
    tiles[7][8] = TrollRunTileType.SOLID
    tiles[7][9] = TrollRunTileType.SOLID

    return {
      id: 'pits-07',
      world: 'pits',
      name: 'The Elevator',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 260, y: 60 },
      tiles,
      triggers: [
        {
          zone: { x: 120, y: 80, w: 40, h: 40 },
          condition: 'enter',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [8, 7],
                [9, 7],
              ],
              delay: 0.3,
            },
          ],
        },
      ],
      parTime: 6,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 8: "Confusion"
  // Trap: Inverts left/right controls while jumping across pillars.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    // Start platform
    for (let c = 0; c <= 3; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Pillars
    tiles[9][6] = TrollRunTileType.SOLID
    tiles[9][10] = TrollRunTileType.SOLID
    tiles[9][14] = TrollRunTileType.SOLID
    // End platform
    for (let c = 17; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Bottom spikes
    for (let c = 4; c < 17; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'pits-08',
      world: 'pits',
      name: 'Confusion',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 288, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 88, y: 80, w: 32, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'invert_controls',
              duration: 5,
            },
          ],
        },
      ],
      parTime: 8,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 9: "Double Drop"
  // Trap: Door drops down 2 floors when you approach it.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    // Top floor
    for (let c = 0; c < 15; c++) tiles[5][c] = TrollRunTileType.SOLID
    // Bottom floor
    for (let c = 12; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    return {
      id: 'pits-09',
      world: 'pits',
      name: 'Double Drop',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 56 },
      door: { x: 200, y: 60 },
      tiles,
      triggers: [
        {
          zone: { x: 160, y: 40, w: 32, h: 60 },
          condition: 'enter',
          actions: [
            {
              type: 'move_door',
              to: { x: 270, y: 124 },
              duration: 0.25,
            },
            {
              type: 'collapse_tiles',
              tiles: [
                [12, 5],
                [13, 5],
                [14, 5],
              ],
            },
          ],
        },
      ],
      parTime: 7,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 10: "Pits Finale"
  // Trap: Combines bridge collapse + spike ambush + runaway door!
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 4; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 5; c <= 15; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 5; c <= 15; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP
    for (let c = 16; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    return {
      id: 'pits-10',
      world: 'pits',
      name: 'Pits Finale',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 280, y: 124 },
      tiles,
      triggers: [
        // Bridge starts collapsing
        {
          zone: { x: 64, y: 80, w: 32, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [5, 9],
                [6, 9],
                [7, 9],
              ],
              delay: 0.2,
            },
          ],
        },
        // Mid spike ambush
        {
          zone: { x: 140, y: 80, w: 24, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_spikes',
              positions: [
                [11, 9],
                [12, 9],
              ],
              direction: 'up',
            },
          ],
        },
        // Door hops over player
        {
          zone: { x: 230, y: 80, w: 32, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'door_runs_away',
              direction: 'left',
              distance: 120,
              duration: 0.35,
            },
          ],
        },
      ],
      parTime: 10,
    }
  })(),
]
