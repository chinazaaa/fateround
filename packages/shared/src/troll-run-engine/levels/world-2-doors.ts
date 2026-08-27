/**
 * World 2: RUNAWAY DOORS & MOVING WALLS (10 Levels)
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

export const WORLD_2_LEVELS: TrollRunLevel[] = [
  // -------------------------------------------------------------
  // LEVEL 1: "The Shy Door"
  // Trap: Door starts at x:220, scoots right when player gets close.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    return {
      id: 'doors-01',
      world: 'doors',
      name: 'The Shy Door',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 220, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 170, y: 80, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'door_runs_away',
              direction: 'right',
              distance: 60,
              duration: 0.3,
            },
          ],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 2: "Crushing Ceiling"
  // Trap: Spikes drop down halfway through the jump.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Small pit in the middle
    tiles[9][9] = TrollRunTileType.EMPTY
    tiles[9][10] = TrollRunTileType.EMPTY
    tiles[10][9] = TrollRunTileType.SPIKE_UP
    tiles[10][10] = TrollRunTileType.SPIKE_UP

    return {
      id: 'doors-02',
      world: 'doors',
      name: 'Crushing Ceiling',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 120, y: 60, w: 30, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_spikes',
              positions: [
                [9, 5],
                [10, 5],
              ],
              direction: 'down',
            },
          ],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 3: "Fake Door"
  // Trap: The door ahead vanishes into spikes; real door drops behind spawn!
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    return {
      id: 'doors-03',
      world: 'doors',
      name: 'Fake Door',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 260, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 220, y: 80, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'move_door',
              to: { x: 20, y: 124 },
              duration: 0.2,
            },
            {
              type: 'spawn_spikes',
              positions: [
                [16, 9],
                [17, 9],
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
  // LEVEL 4: "Elevator Pitch"
  // Trap: High platform over spikes that collapses if stood on.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 4; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 15; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    // Elevator platform
    for (let c = 8; c <= 11; c++) tiles[6][c] = TrollRunTileType.SOLID
    for (let c = 5; c < 15; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'doors-04',
      world: 'doors',
      name: 'Elevator Pitch',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      // `land_on`, not `enter`: the zone spans the jump as well as the platform, so entering it
      // collapsed the landing while the runner was still in the air. Firing on the touchdown instead
      // leaves the beat it was always meant to be — the floor goes a moment after you reach it.
      triggers: [
        {
          zone: { x: 128, y: 80, w: 64, h: 30 },
          condition: 'land_on',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [8, 6],
                [9, 6],
                [10, 6],
                [11, 6],
              ],
              delay: 0.45,
            },
          ],
        },
      ],
      parTime: 7,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 5: "Door Runner II"
  // Trap: Door races all the way back left past the player.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    return {
      id: 'doors-05',
      world: 'doors',
      name: 'Door Runner II',
      width: 320,
      height: 180,
      spawn: { x: 40, y: 120 },
      door: { x: 260, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 180, y: 80, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'door_runs_away',
              direction: 'left',
              distance: 240,
              duration: 0.6,
            },
          ],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 6: "The Rising Wall"
  // Trap: A solid spike wall rises in front of the door.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID

    // Upper platform
    for (let c = 7; c <= 12; c++) tiles[5][c] = TrollRunTileType.SOLID

    return {
      id: 'doors-06',
      world: 'doors',
      name: 'The Rising Wall',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 180, y: 100, w: 30, h: 60 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_spikes',
              positions: [
                [14, 8],
                [14, 7],
                [14, 6],
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
  // LEVEL 7: "Leap of Faith"
  // Trap: High jump triggers spikes above; lower jump passes cleanly.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 6; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 13; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 7; c < 13; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'doors-07',
      world: 'doors',
      name: 'Leap of Faith',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 272, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 130, y: 20, w: 60, h: 50 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_spikes',
              positions: [
                [9, 4],
                [10, 4],
              ],
              direction: 'down',
            },
          ],
        },
      ],
      parTime: 4,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 8: "Trapdoor"
  // Trap: Platform directly under the door is fake!
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 16; c++) tiles[9][c] = TrollRunTileType.SOLID
    tiles[9][16] = TrollRunTileType.FAKE_SOLID
    tiles[9][17] = TrollRunTileType.FAKE_SOLID
    for (let c = 18; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    tiles[10][16] = TrollRunTileType.SPIKE_UP
    tiles[10][17] = TrollRunTileType.SPIKE_UP

    return {
      id: 'doors-08',
      world: 'doors',
      name: 'Trapdoor',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 288, y: 124 },
      tiles,
      triggers: [],
      parTime: 3,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 9: "The Sky Door"
  // Trap: Spikes spawn on floor, hidden bounce pad launches you up.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c < 20; c++) tiles[9][c] = TrollRunTileType.SOLID
    // Hidden bounce pad. Col 12 is where the launch arc actually crosses the sky door: the pad throws
    // the runner up at 450px/s, which peaks 103px high and holds them level with the door for ~0.49s.
    // At 160px/s that covers the ~90px from here with room to spare, but not the ~130px it would be
    // from further left — from col 8 the door was only touchable for three frames, if at all.
    tiles[9][12] = TrollRunTileType.BOUNCE

    return {
      id: 'doors-09',
      world: 'doors',
      name: 'The Sky Door',
      width: 320,
      height: 180,
      spawn: { x: 32, y: 120 },
      door: { x: 260, y: 44 },
      tiles,
      triggers: [
        {
          zone: { x: 100, y: 80, w: 40, h: 80 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_spikes',
              positions: [
                [13, 8],
                [14, 8],
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
  // LEVEL 10: "The Grand Chase"
  // Trap: the door flees the middle island for the high ledge on the far right, so the runner has
  // to cross the spike gap to follow it. The destination is absolute rather than a plain sideways
  // run because the ledge it lands on is two rows higher than where the door starts.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    for (let c = 0; c <= 3; c++) tiles[9][c] = TrollRunTileType.SOLID
    for (let c = 7; c <= 10; c++) tiles[7][c] = TrollRunTileType.SOLID
    for (let c = 14; c <= 19; c++) tiles[5][c] = TrollRunTileType.SOLID

    for (let c = 4; c < 7; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP
    for (let c = 11; c < 14; c++) tiles[10][c] = TrollRunTileType.SPIKE_UP

    return {
      id: 'doors-10',
      world: 'doors',
      name: 'The Grand Chase',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 130, y: 92 },
      tiles,
      triggers: [
        {
          zone: { x: 100, y: 60, w: 40, h: 60 },
          condition: 'enter',
          actions: [
            {
              type: 'move_door',
              // Row 5 spans cols 14–19 with its surface at y=80, so a 20px-tall door sits at y=60.
              to: { x: 272, y: 60 },
              duration: 0.5,
            },
          ],
        },
      ],
      parTime: 6,
    }
  })(),
]
