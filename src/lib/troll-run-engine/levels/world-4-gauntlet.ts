/**
 * World 4: THE FINAL GAUNTLET (10 Levels)
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

export const WORLD_4_LEVELS: TrollRunLevel[] = [
  // -------------------------------------------------------------
  // LEVEL 1: "Vanishing Steps"
  // Trap: Every island collapses right after you land on it.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    tiles[9][1] = TrollRunTileType.SOLID
    tiles[9][2] = TrollRunTileType.SOLID

    tiles[8][6] = TrollRunTileType.SOLID
    tiles[8][7] = TrollRunTileType.SOLID

    tiles[7][11] = TrollRunTileType.SOLID
    tiles[7][12] = TrollRunTileType.SOLID

    tiles[6][16] = TrollRunTileType.SOLID
    tiles[6][17] = TrollRunTileType.SOLID
    tiles[6][18] = TrollRunTileType.SOLID

    for (let c = 0; c < 20; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'gauntlet-01',
      world: 'gauntlet',
      name: 'Vanishing Steps',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 280, y: 76 },
      tiles,
      triggers: [
        {
          zone: { x: 96, y: 100, w: 32, h: 40 },
          condition: 'enter',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [6, 8],
                [7, 8],
              ],
            },
          ],
        },
        {
          zone: { x: 176, y: 80, w: 32, h: 40 },
          condition: 'enter',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [11, 7],
                [12, 7],
              ],
            },
          ],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 2: "Ice Slide Panic"
  // Trap: Pure ice floor with spikes appearing ahead during the slide.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.ICE

    return {
      id: 'gauntlet-02',
      world: 'gauntlet',
      name: 'Ice Slide Panic',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 280, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 120, y: 80, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_spikes',
              positions: [
                [12, 9],
                [13, 9],
              ],
              direction: 'up',
            },
          ],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 3: "Laser Wall"
  // Trap: Spikes erupt into a vertical wall directly in front of door.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    // Overhead ledge
    for (let c = 8; c <= 14; c++) tiles[5][c] = TrollRunTileType.SOLID

    return {
      id: 'gauntlet-03',
      world: 'gauntlet',
      name: 'Laser Wall',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 180, y: 90, w: 40, h: 60 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_spikes',
              positions: [
                [15, 9],
                [15, 8],
                [15, 7],
                [15, 6],
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
  // LEVEL 4: "Elevator Trap"
  // Trap: High ledge with collapsing platform.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 4; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 14; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    // Elevator platform
    tiles[7][8] = TrollRunTileType.SOLID
    tiles[7][9] = TrollRunTileType.SOLID
    tiles[7][10] = TrollRunTileType.SOLID

    // Ceiling spikes
    for (let c = 7; c <= 11; c++) tiles[2][c] = TrollRunTileType.SPIKE_DOWN

    return {
      id: 'gauntlet-04',
      world: 'gauntlet',
      name: 'Elevator Trap',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 128, y: 80, w: 48, h: 40 },
          condition: 'enter',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [8, 7],
                [9, 7],
                [10, 7],
              ],
            },
          ],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 5: "The Bait Coin"
  // Trap: Coin on row 8 triggers pit collapse; jump over coin to live!
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    tiles[8][10] = TrollRunTileType.COIN
    for (let c = 8; c <= 12; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'gauntlet-05',
      world: 'gauntlet',
      name: 'The Bait Coin',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 155, y: 110, w: 20, h: 30 },
          condition: 'enter',
          actions: [
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
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 6: "The False Horizon"
  // Trap: Huge 10-tile cascading collapse across middle floor.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 6; c <= 15; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'gauntlet-06',
      world: 'gauntlet',
      name: 'The False Horizon',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 280, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 80, y: 60, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [6, 9],
                [7, 9],
                [8, 9],
                [9, 9],
                [10, 9],
                [11, 9],
                [12, 9],
                [13, 9],
                [14, 9],
                [15, 9],
              ],
            },
          ],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 7: "Inverted Gauntlet"
  // Trap: Inverted controls + spike ceiling.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Spikes hanging
    for (let c = 6; c <= 14; c++) tiles[3][c] = TrollRunTileType.SPIKE_DOWN

    return {
      id: 'gauntlet-07',
      world: 'gauntlet',
      name: 'Inverted Gauntlet',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 0, y: 0, w: 320, h: 180 },
          condition: 'enter',
          actions: [{ type: 'invert_controls', duration: 12 }],
        },
      ],
      parTime: 5,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 8: "The Squeeze II"
  // Trap: Pop-up spikes right where the jump lands.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 6; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 12; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 7; c < 12; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'gauntlet-08',
      world: 'gauntlet',
      name: 'The Squeeze II',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 180, y: 60, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_spikes',
              positions: [
                [13, 9],
                [14, 9],
              ],
              direction: 'up',
            },
          ],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 9: "Speed Runner"
  // Trap: Bounce pad onto an ice strip with instant door evasion.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 4; c++) tiles[9][c] = TrollRunTileType.SOLID
    tiles[9][5] = TrollRunTileType.BOUNCE
    for (let c = 6; c < 20; c++) tiles[9][c] = TrollRunTileType.ICE

    return {
      id: 'gauntlet-09',
      world: 'gauntlet',
      name: 'Speed Runner',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 200, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 160, y: 60, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'door_runs_away',
              direction: 'right',
              distance: 80,
              duration: 0.3,
            },
          ],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 10: "Troll King's Finale"
  // Trap: 3-phase epic gauntlet! Runaway door + collapsing floor + gravity flip!
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    // Floor
    for (let c = 0; c <= 4; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 15; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 5; c < 15; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    // Ceiling
    for (let c = 0; c < 20; c++) tiles[1][c] = TrollRunTileType.SOLID

    return {
      id: 'gauntlet-10',
      world: 'gauntlet',
      name: "Troll King's Finale",
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 120, y: 124 },
      tiles,
      triggers: [
        // Phase 1: Door flees up to ceiling
        {
          zone: { x: 60, y: 80, w: 40, h: 60 },
          condition: 'enter',
          actions: [
            {
              type: 'door_runs_away',
              direction: 'right',
              distance: 152,
              duration: 0.5,
            },
          ],
        },
        // Phase 2: Gravity flips to ceiling
        {
          zone: { x: 80, y: 60, w: 40, h: 80 },
          condition: 'enter',
          actions: [{ type: 'flip_gravity' }],
        },
      ],
      parTime: 6,
    }
  })(),
]
