/**
 * World 5: THE MACHINE ROOM (10 Levels)
 *
 * The first world built out of moving parts: presses that sweep the walkway, a pallet that slides
 * out from under you, a lift that carries you into the ceiling, and rounds fired in from off-screen.
 *
 * Machinery is threat, never footing. `levels.test.ts` proves every level here with its entities at
 * their start positions, and again with the machinery stripped out entirely — so no route depends on
 * catching a moving part, which is what keeps the solver's static view of entities an honest one.
 *
 * Grid is 20 cols x 11 rows (320x176 pixels, tile size = 16).
 * Tile types:
 * 0 = Empty, 1 = Solid, 2 = Fake Solid, 3 = Spike Up, 4 = Spike Down, 7 = Ice, 8 = Bounce, 9 = Coin
 */

import { TrollRunTileType, type TrollRunLevel } from '../types'

function createEmptyGrid(): number[][] {
  const grid: number[][] = []
  for (let row = 0; row < 11; row += 1) {
    grid.push(new Array(20).fill(TrollRunTileType.EMPTY))
  }
  return grid
}

function fillRow(tiles: number[][], row: number, fromCol: number, toCol: number, tile: number): void {
  for (let col = fromCol; col <= toCol; col += 1) {
    tiles[row][col] = tile
  }
}

export const WORLD_5_LEVELS: TrollRunLevel[] = [
  // -------------------------------------------------------------
  // LEVEL 1: "Clock In"
  // Trap: two ceiling presses sweep the only corridor, on different clocks.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    fillRow(tiles, 0, 0, 19, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 0, 19, TrollRunTileType.SOLID)

    return {
      id: 'machines-01',
      world: 'machines',
      name: 'Clock In',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 288, y: 124 },
      tiles,
      triggers: [],
      movingEntities: [
        // Parked at the ceiling, so the corridor is clear the moment the level starts and the runner
        // gets one free look at the rhythm before they are inside it.
        {
          id: 'press-near',
          x: 112,
          y: 16,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 90,
          patrol: { minY: 16, maxY: 128 },
        },
        {
          id: 'press-far',
          x: 208,
          y: 64,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 130,
          patrol: { minY: 16, maxY: 128 },
        },
      ],
      parTime: 8,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 2: "Conveyor"
  // Trap: an ice belt that will not let you stop, and the solid landing at the end of it freezes too.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    fillRow(tiles, 0, 0, 19, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 0, 4, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 5, 14, TrollRunTileType.ICE)
    fillRow(tiles, 9, 15, 19, TrollRunTileType.SOLID)

    return {
      id: 'machines-02',
      world: 'machines',
      name: 'Conveyor',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 288, y: 124 },
      tiles,
      triggers: [
        {
          // Fires as the belt is stepped onto, early enough that the runner watches the grip they were
          // aiming for turn to ice while they are still sliding towards it.
          zone: { x: 80, y: 112, w: 32, h: 48 },
          condition: 'enter',
          actions: [
            {
              type: 'ice_floor',
              tiles: [
                [15, 9],
                [16, 9],
              ],
            },
          ],
        },
      ],
      movingEntities: [
        {
          id: 'press-belt',
          x: 144,
          y: 80,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 95,
          patrol: { minY: 16, maxY: 128 },
        },
        {
          id: 'press-end',
          x: 224,
          y: 16,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 120,
          patrol: { minY: 16, maxY: 128 },
        },
      ],
      parTime: 9,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 3: "Pallet Line"
  // Trap: the pallet crossing the spike pit is one tile short of the far side, and it is leaving.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    fillRow(tiles, 9, 0, 7, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 12, 19, TrollRunTileType.SOLID)
    fillRow(tiles, 10, 8, 11, TrollRunTileType.SPIKE_UP)

    return {
      id: 'machines-03',
      world: 'machines',
      name: 'Pallet Line',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 288, y: 124 },
      tiles,
      triggers: [],
      movingEntities: [
        // Flush with the floor, so it reads as a moving stretch of walkway rather than a platform, and
        // it covers three of the four missing tiles — which is the lie. The pit itself is a jump.
        {
          id: 'pallet',
          x: 128,
          y: 144,
          w: 48,
          h: 16,
          type: 'platform',
          solid: true,
          vx: -60,
          patrol: { minX: 16, maxX: 176 },
        },
        {
          id: 'press-landing',
          x: 208,
          y: 16,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 140,
          patrol: { minY: 16, maxY: 128 },
        },
      ],
      parTime: 10,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 4: "Punch Press"
  // Trap: a press guards the top step, and the coin above it takes the run-up away as payment.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    fillRow(tiles, 9, 0, 4, TrollRunTileType.SOLID)
    fillRow(tiles, 10, 5, 19, TrollRunTileType.SPIKE_UP)
    fillRow(tiles, 7, 6, 9, TrollRunTileType.SOLID)
    fillRow(tiles, 5, 11, 14, TrollRunTileType.SOLID)
    tiles[3][12] = TrollRunTileType.COIN

    return {
      id: 'machines-04',
      world: 'machines',
      name: 'Punch Press',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 224, y: 60 },
      tiles,
      triggers: [
        {
          zone: { x: 184, y: 32, w: 32, h: 32 },
          condition: 'collect_coin',
          actions: [
            {
              // The two tiles the runner arrived on, not the two the door stands on: greed costs the
              // way back, never the way out.
              type: 'collapse_tiles',
              tiles: [
                [11, 5],
                [12, 5],
              ],
              delay: 0.3,
            },
          ],
        },
      ],
      movingEntities: [
        {
          id: 'punch',
          x: 176,
          y: 16,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 110,
          patrol: { minY: 16, maxY: 64 },
        },
      ],
      parTime: 11,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 5: "Cross Fire"
  // Trap: rounds come in at chest height down a corridor too low to jump in. The dips are the cover.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    fillRow(tiles, 6, 0, 19, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 0, 6, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 8, 12, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 14, 19, TrollRunTileType.SOLID)
    tiles[10][7] = TrollRunTileType.SOLID
    tiles[10][13] = TrollRunTileType.SOLID

    return {
      id: 'machines-05',
      world: 'machines',
      name: 'Cross Fire',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 288, y: 124 },
      tiles,
      triggers: [
        {
          // Fired from the far wall, so a round is visible for its whole flight and the dip ahead is
          // always reachable before it arrives.
          zone: { x: 64, y: 112, w: 16, h: 48 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_entity',
              entityType: 'bullet',
              position: { x: 304, y: 130 },
              velocity: { x: -150, y: 0 },
              size: 8,
            },
          ],
        },
        {
          zone: { x: 160, y: 112, w: 16, h: 48 },
          condition: 'enter',
          actions: [
            {
              type: 'spawn_entity',
              entityType: 'bullet',
              position: { x: 304, y: 130 },
              velocity: { x: -140, y: 0 },
              size: 8,
            },
          ],
        },
        {
          // Climbing out of the second dip is what fires the last one, so the cover has to be given up
          // before the runner learns they needed it.
          zone: { x: 208, y: 144, w: 16, h: 32 },
          condition: 'exit',
          actions: [
            {
              type: 'spawn_entity',
              entityType: 'bullet',
              position: { x: 304, y: 130 },
              velocity: { x: -130, y: 0 },
              size: 8,
            },
          ],
        },
      ],
      parTime: 12,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 6: "The Lift"
  // Trap: the two tiles of missing floor are a lift, and it is already on its way up to the spikes.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    fillRow(tiles, 9, 0, 6, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 9, 19, TrollRunTileType.SOLID)
    fillRow(tiles, 10, 7, 8, TrollRunTileType.SPIKE_UP)
    fillRow(tiles, 2, 7, 8, TrollRunTileType.SPIKE_DOWN)
    fillRow(tiles, 7, 12, 15, TrollRunTileType.SOLID)

    return {
      id: 'machines-06',
      world: 'machines',
      name: 'The Lift',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 240, y: 92 },
      tiles,
      triggers: [],
      movingEntities: [
        // Starts level with the floor and rises from the first frame, so riding it is a decision the
        // runner makes by standing still. The gap it leaves behind is a two-tile jump.
        {
          id: 'lift',
          x: 112,
          y: 144,
          w: 32,
          h: 16,
          type: 'platform',
          solid: true,
          vy: -45,
          patrol: { minY: 48, maxY: 144 },
        },
        {
          id: 'saw-ledge',
          x: 224,
          y: 32,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 100,
          patrol: { minY: 32, maxY: 96 },
        },
      ],
      parTime: 11,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 7: "Toothed Exit"
  // Trap: the door grows teeth as you come into range, and the approach is ice, so stopping is work.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    fillRow(tiles, 0, 0, 19, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 0, 11, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 12, 16, TrollRunTileType.ICE)
    fillRow(tiles, 9, 17, 19, TrollRunTileType.SOLID)

    return {
      id: 'machines-07',
      world: 'machines',
      name: 'Toothed Exit',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 288, y: 124 },
      tiles,
      triggers: [
        {
          // The bite counts itself down, so the exit is only ever shut for as long as it takes to stop
          // sliding and wait beside it.
          zone: { x: 208, y: 112, w: 32, h: 48 },
          condition: 'enter',
          actions: [{ type: 'fake_door', duration: 1.6 }],
        },
      ],
      movingEntities: [
        {
          id: 'press-approach',
          x: 160,
          y: 48,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 90,
          patrol: { minY: 16, maxY: 128 },
        },
        {
          // Sweeps the tile a runner slides to a halt on, which is why waiting out the bite is done one
          // tile further along, against the doorframe.
          id: 'press-wait',
          x: 256,
          y: 16,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 120,
          patrol: { minY: 16, maxY: 128 },
        },
      ],
      parTime: 12,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 8: "Gear Room"
  // Trap: three presses on three clocks, and a coin that puts spikes where the floor was.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    fillRow(tiles, 0, 0, 19, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 0, 19, TrollRunTileType.SOLID)
    tiles[7][12] = TrollRunTileType.COIN

    return {
      id: 'machines-08',
      world: 'machines',
      name: 'Gear Room',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 288, y: 124 },
      tiles,
      triggers: [
        {
          zone: { x: 184, y: 96, w: 32, h: 32 },
          condition: 'collect_coin',
          actions: [
            {
              type: 'spawn_spikes',
              positions: [
                [12, 9],
                [13, 9],
              ],
              direction: 'up',
              delay: 0.2,
            },
          ],
        },
      ],
      movingEntities: [
        {
          id: 'gear-near',
          x: 80,
          y: 16,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 140,
          patrol: { minY: 16, maxY: 128 },
        },
        {
          id: 'gear-mid',
          x: 160,
          y: 56,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 170,
          patrol: { minY: 16, maxY: 128 },
        },
        {
          id: 'gear-far',
          x: 240,
          y: 96,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 115,
          patrol: { minY: 16, maxY: 128 },
        },
      ],
      parTime: 13,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 9: "Scrap Chute"
  // Trap: every stretch of floor drops into the chute the moment you step off it. No retreat.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    fillRow(tiles, 0, 0, 19, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 0, 19, TrollRunTileType.SOLID)
    fillRow(tiles, 10, 0, 19, TrollRunTileType.SPIKE_UP)

    return {
      id: 'machines-09',
      world: 'machines',
      name: 'Scrap Chute',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 288, y: 124 },
      tiles,
      triggers: [
        {
          // `exit` fires whichever way the zone is left, so backing off costs the same floor that going
          // forward would have — which is the whole point of the chute.
          zone: { x: 48, y: 112, w: 48, h: 48 },
          condition: 'exit',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [3, 9],
                [4, 9],
                [5, 9],
              ],
              delay: 0.1,
            },
          ],
        },
        {
          zone: { x: 144, y: 112, w: 48, h: 48 },
          condition: 'exit',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [9, 9],
                [10, 9],
                [11, 9],
              ],
              delay: 0.1,
            },
          ],
        },
        {
          zone: { x: 224, y: 112, w: 32, h: 48 },
          condition: 'exit',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [14, 9],
                [15, 9],
              ],
              delay: 0.1,
            },
          ],
        },
      ],
      movingEntities: [
        // Two tiles wide and quick, parked at the ceiling just past the middle stretch: the run that
        // commits to leaving that floor behind is the run that has to read this first.
        {
          id: 'crusher',
          x: 192,
          y: 16,
          w: 32,
          h: 16,
          type: 'spike_wall',
          killsOnTouch: true,
          vy: 150,
          patrol: { minY: 16, maxY: 128 },
        },
      ],
      parTime: 12,
    }
  })(),

  // -------------------------------------------------------------
  // LEVEL 10: "Night Shift"
  // Trap: belt, pit, a trampoline under a spike bank, floor that leaves, and an exit with teeth.
  // -------------------------------------------------------------
  (() => {
    const tiles = createEmptyGrid()
    fillRow(tiles, 9, 0, 3, TrollRunTileType.SOLID)
    fillRow(tiles, 9, 4, 7, TrollRunTileType.ICE)
    fillRow(tiles, 10, 8, 10, TrollRunTileType.SPIKE_UP)
    tiles[9][11] = TrollRunTileType.SOLID
    tiles[9][12] = TrollRunTileType.BOUNCE
    tiles[9][13] = TrollRunTileType.SOLID
    fillRow(tiles, 9, 14, 16, TrollRunTileType.ICE)
    fillRow(tiles, 9, 17, 19, TrollRunTileType.SOLID)
    // High enough that a jump over the pad passes under them, low enough that the pad's own launch
    // does not: the bank is what makes stepping on it a mistake rather than a shortcut.
    fillRow(tiles, 3, 12, 14, TrollRunTileType.SPIKE_DOWN)

    return {
      id: 'machines-10',
      world: 'machines',
      name: 'Night Shift',
      width: 320,
      height: 180,
      spawn: { x: 24, y: 120 },
      door: { x: 288, y: 124 },
      tiles,
      triggers: [
        {
          // Clears the solid tile either side of the pad once they have been crossed, so the pad is all
          // that is left of the middle and there is no second attempt from this side.
          zone: { x: 176, y: 112, w: 48, h: 48 },
          condition: 'exit',
          actions: [
            {
              type: 'collapse_tiles',
              tiles: [
                [11, 9],
                [13, 9],
              ],
              delay: 0.2,
            },
          ],
        },
        {
          zone: { x: 224, y: 112, w: 32, h: 48 },
          condition: 'enter',
          actions: [{ type: 'fake_door', duration: 1.4 }],
        },
      ],
      movingEntities: [
        {
          id: 'press-belt',
          x: 64,
          y: 16,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 125,
          patrol: { minY: 16, maxY: 128 },
        },
        {
          // Hangs over the pit and drops through the line a jump takes, so the crossing becomes a
          // question of when rather than whether.
          id: 'chopper',
          x: 144,
          y: 32,
          w: 16,
          h: 16,
          type: 'buzzsaw',
          killsOnTouch: true,
          vy: 105,
          patrol: { minY: 32, maxY: 128 },
        },
      ],
      parTime: 14,
    }
  })(),
]
