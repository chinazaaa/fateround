/**
 * Seeded level generation.
 *
 * Shuffling ten level ids was never going to stop a repeat player coasting: a world holds exactly
 * ten levels and a round *is* ten levels, so every round already contained all of them and only the
 * order moved. What gets memorised is the content — which tile is fake, where the spikes erupt,
 * where the door bolts to — so that is what this module rebuilds from a seed each round.
 *
 * A level is assembled in two passes. First a skeleton: walkways of platform segments running left
 * to right, whose every gap is inside the jump budget below. Then traps, drawn from the world's own
 * palette, each one reading the finished layout to pick its own coordinates rather than being handed
 * them.
 *
 * Nobody playtests a generated level, so `findFairTrollRunAttempt` plays each candidate with the
 * solver in `reach.ts` and returns the first attempt that can be finished with every trap already
 * sprung. The round descriptor carries that attempt number, which is what lets a client rebuild the
 * exact same level without running the solver again.
 */

import {
  TROLL_RUN_DOOR_HEIGHT,
  TROLL_RUN_GRID_COLS,
  TROLL_RUN_GRID_ROWS,
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TROLL_RUN_PHYSICS,
  TROLL_RUN_TILE_SIZE,
  TrollRunTileType,
  type TrollRunLevel,
  type TrollRunWorldId,
  type TrollTrigger,
} from '../types'
import { checkTrollRunSolvable, isStandableSpot, trollRunDoorIsBuried, trollRunFinalDoor } from './reach'
import { createSeededRng, hashSeedText, pickOne, randomInt } from './seeded-rng'

// ---------------------------------------------------------------------------
// Difficulty ramp
// ---------------------------------------------------------------------------

/** Traps per level across the ten slots: one to find your feet, three by the finale. */
const TRAP_COUNT_BY_SLOT = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3] as const

/** Widest gap the skeleton is allowed to open, in columns. */
const GAP_WIDTH_BY_SLOT = [2, 2, 3, 3, 3, 4, 4, 4, 4, 4] as const

/** Par seconds per slot, the same curve the authored levels climb across a world. */
const PAR_SECONDS_BY_SLOT = [4, 4, 5, 5, 6, 6, 7, 8, 8, 9] as const

const SLOT_COUNT = TRAP_COUNT_BY_SLOT.length

/** Slack between the solver's route and par, so par rewards a clean run rather than demanding one. */
const PAR_HEADROOM_SECONDS = 1.5

/**
 * Shortest route a level may ask for. A door the runner falls into on the way down from the spawn is
 * not a level, and a trap that relocates the exit next to the start would produce exactly that.
 */
const MIN_ROUTE_SECONDS = 0.9

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const LAST_COL = TROLL_RUN_GRID_COLS - 1
/** Row the main walkway starts on, leaving the bottom row free for a spike bed. */
const FLOOR_ROW = TROLL_RUN_GRID_ROWS - 2
const SPIKE_BED_ROW = TROLL_RUN_GRID_ROWS - 1
const CEILING_ROW = 1
/** Highest a platform may climb, keeping headroom for a door and a jump above it. */
const HIGHEST_PLATFORM_ROW = 5
/** No trap may move the exit left of here: the way out belongs at the far end of the room. */
const MIN_DOOR_COL = 10

/**
 * The widest gap the runner clears for a given rise, in columns.
 *
 * A flat jump covers 104px — 6.5 columns — from `JUMP_VELOCITY -320` against `GRAVITY 980` at
 * `MOVE_SPEED 160`, and climbing eats into that because the arc has to be above the landing ledge
 * before it arrives. Every figure here is a column or two short of what the physics allows, so no
 * generated jump is ever pixel-perfect.
 */
function maxGapForRise(rise: number): number {
  if (rise <= 0) return 4
  if (rise === 1) return 3
  if (rise === 2) return 2
  return 0
}

type SkeletonShape = 'flat' | 'pits' | 'steps' | 'islands' | 'corridor'

const SHAPES_BY_WORLD: Record<TrollRunWorldId, readonly SkeletonShape[]> = {
  pits: ['flat', 'pits', 'steps', 'islands'],
  doors: ['flat', 'pits', 'steps', 'islands'],
  gravity: ['corridor'],
  gauntlet: ['flat', 'pits', 'steps', 'islands', 'corridor'],
  machines: ['flat', 'pits', 'steps', 'islands'],
}

/** A run of solid tiles on one row. `fromCol` and `toCol` are both inclusive. */
interface WalkwaySegment {
  row: number
  fromCol: number
  toCol: number
}

function segmentLength(segment: WalkwaySegment): number {
  return segment.toCol - segment.fromCol + 1
}

interface WalkwayPlan {
  /** The platform the runner starts on. Later ones are laid to its right. */
  start: WalkwaySegment
  gapWidth: number
  /** Row the walkway may not climb above, which differs between a floor and a ceiling. */
  highestRow: number
  riseFor: () => number
  lengthFor: () => number
}

/**
 * Lays platforms left to right from `plan.start`, gapping and climbing as the shape asks, and always
 * running the last one out to the right wall — the door needs a landing, and an exit stranded a
 * column short of the edge reads as a mistake rather than as a challenge.
 */
function extendWalkway(plan: WalkwayPlan): WalkwaySegment[] {
  const segments: WalkwaySegment[] = [plan.start]

  for (;;) {
    const previous = segments[segments.length - 1]
    const row = Math.max(plan.highestRow, previous.row - plan.riseFor())
    const gap = Math.max(1, Math.min(plan.gapWidth, maxGapForRise(previous.row - row)))
    const fromCol = previous.toCol + 1 + gap
    if (fromCol > LAST_COL) break
    segments.push({ row, fromCol, toCol: Math.min(fromCol + plan.lengthFor() - 1, LAST_COL) })
  }

  const last = segments[segments.length - 1]
  if (last.toCol < LAST_COL) last.toCol = LAST_COL
  return segments
}

interface Skeleton {
  shape: SkeletonShape
  tiles: number[][]
  /** Platforms the runner walks the normal way up. */
  floor: WalkwaySegment[]
  /** Platforms an inverted runner walks. Empty unless the layout has a ceiling. */
  ceiling: WalkwaySegment[]
  /** Column of the gravity gate, or null when the layout has none. */
  gateCol: number | null
}

function createEmptyGrid(): number[][] {
  const grid: number[][] = []
  for (let row = 0; row < TROLL_RUN_GRID_ROWS; row += 1) {
    grid.push(new Array<number>(TROLL_RUN_GRID_COLS).fill(TrollRunTileType.EMPTY))
  }
  return grid
}

function buildFloorSegments(rng: () => number, shape: SkeletonShape, gapWidth: number): WalkwaySegment[] {
  if (shape === 'flat' || shape === 'corridor') {
    return [{ row: FLOOR_ROW, fromCol: 0, toCol: LAST_COL }]
  }

  return extendWalkway({
    start: { row: FLOOR_ROW, fromCol: 0, toCol: randomInt(rng, 3, 4) },
    gapWidth,
    highestRow: HIGHEST_PLATFORM_ROW,
    riseFor: () => (shape === 'steps' ? 1 : shape === 'islands' ? randomInt(rng, 0, 2) : 0),
    lengthFor: () => (shape === 'islands' ? randomInt(rng, 2, 3) : randomInt(rng, 3, 5)),
  })
}

/**
 * The ceiling an inverted runner crosses. It stays solid well past the gate because a runner who
 * flips while still moving drifts a good four columns sideways on the way up, and the ceiling has to
 * be there to catch them. The gaps come after that, where they can be seen and jumped.
 */
function buildCeilingSegments(rng: () => number, gateCol: number, gapWidth: number): WalkwaySegment[] {
  return extendWalkway({
    start: { row: CEILING_ROW, fromCol: 0, toCol: gateCol + 5 },
    gapWidth,
    // A ceiling never climbs — it is the ceiling — so it stays on its own row the whole way across.
    highestRow: CEILING_ROW,
    riseFor: () => 0,
    lengthFor: () => randomInt(rng, 3, 5),
  })
}

function buildSkeleton(rng: () => number, shape: SkeletonShape, gapWidth: number): Skeleton {
  const tiles = createEmptyGrid()
  const floor = buildFloorSegments(rng, shape, gapWidth)
  const gateCol = shape === 'corridor' ? randomInt(rng, 3, 5) : null
  const ceiling = gateCol === null ? [] : buildCeilingSegments(rng, gateCol, gapWidth)

  for (const segment of [...floor, ...ceiling]) {
    for (let col = segment.fromCol; col <= segment.toCol; col += 1) {
      tiles[segment.row][col] = TrollRunTileType.SOLID
    }
  }

  // A pit reads as a pit when there is something waiting at the bottom of it. The other shapes drop
  // into open air, which the engine kills on out-of-bounds just the same.
  if (shape === 'pits') {
    const covered = new Set<number>()
    for (const segment of floor) {
      for (let col = segment.fromCol; col <= segment.toCol; col += 1) covered.add(col)
    }
    for (let col = 0; col < TROLL_RUN_GRID_COLS; col += 1) {
      if (!covered.has(col)) tiles[SPIKE_BED_ROW][col] = TrollRunTileType.SPIKE_UP
    }
  }

  return { shape, tiles, floor, ceiling, gateCol }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function spawnOn(segment: WalkwaySegment): { x: number; y: number } {
  const inset = (TROLL_RUN_TILE_SIZE - TROLL_RUN_PHYSICS.PLAYER_WIDTH) / 2
  // A short drop onto the first platform, the same opening the authored levels use.
  return { x: segment.fromCol * TROLL_RUN_TILE_SIZE + inset, y: segment.row * TROLL_RUN_TILE_SIZE - 24 }
}

/** A door standing on the platform at `row`, its base level with the tile tops. */
function doorOnPlatform(col: number, row: number): { x: number; y: number } {
  return { x: col * TROLL_RUN_TILE_SIZE + 1, y: row * TROLL_RUN_TILE_SIZE - TROLL_RUN_DOOR_HEIGHT }
}

/** A door hung under the ceiling, where only an inverted runner reaches it. */
function doorUnderCeiling(col: number, row: number): { x: number; y: number } {
  return { x: col * TROLL_RUN_TILE_SIZE + 1, y: (row + 1) * TROLL_RUN_TILE_SIZE + 4 }
}

/** Every column of a walkway a door could stand on without being buried in geometry. */
function doorSpots(tiles: number[][], segments: readonly WalkwaySegment[]): { col: number; row: number }[] {
  const spots: { col: number; row: number }[] = []
  for (const segment of segments) {
    for (let col = segment.fromCol; col <= segment.toCol; col += 1) {
      if (!isStandableSpot(tiles, col, segment.row)) continue
      if (trollRunDoorIsBuried(tiles, doorOnPlatform(col, segment.row))) continue
      spots.push({ col, row: segment.row })
    }
  }
  return spots
}

/** A full-height column band, so a trap keyed to it fires however the runner passes through. */
function columnBand(col: number, widthInCols = 1): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.max(0, col) * TROLL_RUN_TILE_SIZE,
    y: 0,
    w: widthInCols * TROLL_RUN_TILE_SIZE,
    h: TROLL_RUN_INTERNAL_HEIGHT,
  }
}

// ---------------------------------------------------------------------------
// Traps
// ---------------------------------------------------------------------------

interface TrapContext {
  skeleton: Skeleton
  /** Mutable, because a bait door starts somewhere dishonest. */
  door: { x: number; y: number }
  triggers: TrollTrigger[]
  rng: () => number
}

interface TrapRecipe {
  name: string
  /** Words this trap lends the level's name. */
  words: readonly string[]
  /**
   * This trap owns the exit — it moves it, or it reads where it stands to arm itself there. Only one
   * per level: two of them would make the door's final spot a coin toss, or aim one at the old one.
   */
  claimsDoor?: boolean
  /** Applies the trap, or returns false when this layout has no room for it. */
  apply(context: TrapContext): boolean
}

const COLLAPSE_UNDERFOOT: TrapRecipe = {
  name: 'collapse_underfoot',
  words: ['Sinking', 'Treacherous', 'Rotten'],
  apply({ skeleton, triggers, rng }) {
    const roomy = skeleton.floor.filter((segment) => segmentLength(segment) >= 5)
    if (roomy.length === 0) return false

    const segment = pickOne(rng, roomy)
    const col = randomInt(rng, segment.fromCol + 2, segment.toCol - 2)
    triggers.push({
      zone: {
        x: col * TROLL_RUN_TILE_SIZE,
        y: (segment.row - 1) * TROLL_RUN_TILE_SIZE,
        w: TROLL_RUN_TILE_SIZE,
        h: TROLL_RUN_TILE_SIZE,
      },
      condition: 'land_on',
      actions: [{ type: 'collapse_tiles', tiles: [[col, segment.row]], delay: 0.25 }],
    })
    return true
  },
}

const COLLAPSE_CHAIN: TrapRecipe = {
  name: 'collapse_chain',
  words: ['Crumbling', 'Unravelling', 'Falling'],
  apply({ skeleton, triggers, rng }) {
    const chainLength = randomInt(rng, 2, 3)
    // Three tiles of runway before the chain and two of landing after it.
    const roomy = skeleton.floor.filter((segment) => segmentLength(segment) >= chainLength + 5)
    if (roomy.length === 0) return false

    const segment = pickOne(rng, roomy)
    const startCol = randomInt(rng, segment.fromCol + 3, segment.toCol - chainLength - 1)
    const cells: [number, number][] = []
    for (let offset = 0; offset < chainLength; offset += 1) cells.push([startCol + offset, segment.row])

    triggers.push({
      zone: columnBand(startCol - 2, 2),
      condition: 'enter',
      // One action per tile, so the floor peels away left to right instead of vanishing all at once.
      actions: cells.map((cell, index) => ({
        type: 'collapse_tiles' as const,
        tiles: [cell],
        delay: 0.2 + index * 0.15,
      })),
    })
    return true
  },
}

const SPIKE_AMBUSH: TrapRecipe = {
  name: 'spike_ambush',
  words: ['Bristling', 'Sudden', 'Hostile'],
  apply({ skeleton, triggers, rng }) {
    const width = randomInt(rng, 1, 2)
    const roomy = skeleton.floor.filter((segment) => segmentLength(segment) >= width + 5)
    if (roomy.length === 0) return false

    const segment = pickOne(rng, roomy)
    const startCol = randomInt(rng, segment.fromCol + 3, segment.toCol - width - 1)
    const positions: [number, number][] = []
    for (let offset = 0; offset < width; offset += 1) positions.push([startCol + offset, segment.row - 1])

    triggers.push({
      // Two columns back, so the spikes erupt ahead of the runner rather than under them.
      zone: columnBand(startCol - 2, 2),
      condition: 'enter',
      actions: [{ type: 'spawn_spikes', positions, direction: 'up', delay: 0.15 }],
    })
    return true
  },
}

const SPIKE_WALL: TrapRecipe = {
  name: 'spike_wall',
  words: ['Barbed', 'Thorned', 'Fenced'],
  apply({ skeleton, triggers, rng }) {
    const roomy = skeleton.floor.filter((segment) => segmentLength(segment) >= 6)
    if (roomy.length === 0) return false

    const segment = pickOne(rng, roomy)
    const col = randomInt(rng, segment.fromCol + 3, segment.toCol - 2)
    triggers.push({
      zone: columnBand(col - 3, 2),
      condition: 'enter',
      // Two tiles tall and no taller: clearing it spends 32px of the 52px a jump gives, where a
      // three-tile wall would need 48px and turn the level into a pixel-perfect test.
      actions: [
        {
          type: 'spawn_spikes',
          positions: [
            [col, segment.row - 1],
            [col, segment.row - 2],
          ],
          direction: 'up',
          delay: 0.15,
        },
      ],
    })
    return true
  },
}

const CEILING_DROP: TrapRecipe = {
  name: 'ceiling_drop',
  words: ['Low', 'Overhung', 'Pressing'],
  apply({ skeleton, triggers, rng }) {
    // Only over a narrow gap: ducking under the spikes means a clipped jump, and a clipped jump does
    // not carry far enough to cross a wide one.
    const crossings: { gapFrom: number; gapTo: number; row: number }[] = []
    for (let index = 0; index + 1 < skeleton.floor.length; index += 1) {
      const before = skeleton.floor[index]
      const after = skeleton.floor[index + 1]
      const gapWidth = after.fromCol - before.toCol - 1
      if (gapWidth < 1 || gapWidth > 2) continue
      if (after.row !== before.row || before.row - 4 < 0) continue
      crossings.push({ gapFrom: before.toCol + 1, gapTo: after.fromCol - 1, row: before.row })
    }
    if (crossings.length === 0) return false

    const crossing = pickOne(rng, crossings)
    const positions: [number, number][] = []
    for (let col = crossing.gapFrom; col <= crossing.gapTo; col += 1) positions.push([col, crossing.row - 4])

    triggers.push({
      zone: columnBand(crossing.gapFrom - 2, 2),
      condition: 'enter',
      actions: [{ type: 'spawn_spikes', positions, direction: 'down', delay: 0.15 }],
    })
    return true
  },
}

const FAKE_FLOOR: TrapRecipe = {
  name: 'fake_floor',
  words: ['Hollow', 'Painted', 'Lying'],
  apply({ skeleton, rng }) {
    const width = randomInt(rng, 1, 2)
    const roomy = skeleton.floor.filter((segment) => segmentLength(segment) >= width + 4)
    if (roomy.length === 0) return false

    // No trigger: a fake tile is a lie told by the layout, and it gives itself away only under
    // weight — which physics.ts reports as `steppedOnFake`.
    const segment = pickOne(rng, roomy)
    const startCol = randomInt(rng, segment.fromCol + 2, segment.toCol - width - 1)
    for (let offset = 0; offset < width; offset += 1) {
      skeleton.tiles[segment.row][startCol + offset] = TrollRunTileType.FAKE_SOLID
    }
    return true
  },
}

/** Places a door somewhere real in the right-hand half of the room, or nothing if there is nowhere. */
function relocationTarget(context: TrapContext): { col: number; row: number } | null {
  const walkways = context.skeleton.ceiling.length > 0 ? context.skeleton.ceiling : context.skeleton.floor
  const doorCol = Math.floor(context.door.x / TROLL_RUN_TILE_SIZE)
  const candidates = doorSpots(context.skeleton.tiles, walkways).filter(
    (spot) => spot.col >= MIN_DOOR_COL && Math.abs(spot.col - doorCol) >= 3
  )
  return candidates.length > 0 ? pickOne(context.rng, candidates) : null
}

function doorPositionFor(skeleton: Skeleton, spot: { col: number; row: number }): { x: number; y: number } {
  return skeleton.ceiling.length > 0 ? doorUnderCeiling(spot.col, spot.row) : doorOnPlatform(spot.col, spot.row)
}

const DOOR_RELOCATES: TrapRecipe = {
  name: 'door_relocates',
  words: ['Runaway', 'Restless', 'Fleeing'],
  claimsDoor: true,
  apply(context) {
    const destination = relocationTarget(context)
    if (!destination) return false

    const doorCol = Math.floor(context.door.x / TROLL_RUN_TILE_SIZE)
    context.triggers.push({
      zone: columnBand(Math.min(doorCol, destination.col) - 3, 2),
      condition: 'enter',
      actions: [{ type: 'move_door', to: doorPositionFor(context.skeleton, destination), duration: 0.4 }],
    })
    return true
  },
}

const BAIT_DOOR: TrapRecipe = {
  name: 'bait_door',
  words: ['Phantom', 'Mirage', 'Baited'],
  claimsDoor: true,
  apply(context) {
    const { skeleton, rng } = context
    const gaps: { col: number; row: number }[] = []
    for (let index = 0; index + 1 < skeleton.floor.length; index += 1) {
      const before = skeleton.floor[index]
      const after = skeleton.floor[index + 1]
      if (after.fromCol - before.toCol - 1 < 1) continue
      gaps.push({ col: Math.floor((before.toCol + after.fromCol) / 2), row: before.row })
    }
    if (gaps.length === 0) return false

    const destination = relocationTarget(context)
    if (!destination) return false

    // The door hangs over the drop until the runner commits to it, then thinks better of the whole
    // arrangement and leaves for solid ground.
    const bait = pickOne(rng, gaps)
    const baitPosition = doorOnPlatform(bait.col, bait.row)
    context.door.x = baitPosition.x
    context.door.y = baitPosition.y

    context.triggers.push({
      zone: columnBand(bait.col - 3, 2),
      condition: 'enter',
      actions: [{ type: 'move_door', to: doorPositionFor(skeleton, destination), duration: 0.45 }],
    })
    return true
  },
}

const CEILING_SPIKES: TrapRecipe = {
  name: 'ceiling_spikes',
  words: ['Inverted', 'Upended', 'Hanging'],
  apply({ skeleton, triggers, rng }) {
    if (skeleton.gateCol === null) return false

    const width = randomInt(rng, 1, 2)
    // Past the stretch the runner drifts across on the way up, and short of the door's landing.
    const roomy = skeleton.ceiling.filter(
      (segment) => segment.fromCol > (skeleton.gateCol ?? 0) + 5 && segmentLength(segment) >= width + 3
    )
    if (roomy.length === 0) return false

    const segment = pickOne(rng, roomy)
    const latest = Math.min(segment.toCol - width - 1, LAST_COL - 3)
    if (segment.fromCol + 1 > latest) return false

    const startCol = randomInt(rng, segment.fromCol + 1, latest)
    const positions: [number, number][] = []
    // One row below the ceiling is exactly where an inverted runner's head goes.
    for (let offset = 0; offset < width; offset += 1) positions.push([startCol + offset, segment.row + 1])

    triggers.push({
      zone: columnBand(startCol - 2, 2),
      condition: 'enter',
      actions: [{ type: 'spawn_spikes', positions, direction: 'down', delay: 0.15 }],
    })
    return true
  },
}

const INVERT_CONTROLS: TrapRecipe = {
  name: 'invert_controls',
  words: ['Backwards', 'Muddled', 'Contrary'],
  apply({ skeleton, triggers, rng }) {
    const roomy = skeleton.floor.filter((segment) => segmentLength(segment) >= 3)
    if (roomy.length === 0) return false

    // Nothing in the geometry changes here — the runner's own hands stop cooperating.
    const segment = pickOne(rng, roomy)
    triggers.push({
      zone: columnBand(segment.fromCol + 1, 2),
      condition: 'enter',
      actions: [{ type: 'invert_controls', duration: 2.5 }],
    })
    return true
  },
}

/** Whether every cell of `col` from `fromRow` to `toRow` inclusive is open air. */
function columnIsClear(tiles: number[][], col: number, fromRow: number, toRow: number): boolean {
  for (let row = fromRow; row <= toRow; row += 1) {
    if (tiles[row]?.[col] !== TrollRunTileType.EMPTY) return false
  }
  return true
}

const ICE_PATCH: TrapRecipe = {
  name: 'ice_patch',
  words: ['Slick', 'Frozen', 'Greased'],
  apply({ skeleton, triggers, rng }) {
    // The landing is what ices over, so the slide starts with the runner's arrival speed still on
    // them. The first platform is spared — there is nothing to arrive from — and on a ceiling layout
    // it is the ceiling that freezes, because that is the surface an inverted runner walks.
    const walkway = skeleton.ceiling.length > 0 ? skeleton.ceiling : skeleton.floor
    const landings = walkway.slice(1).filter((segment) => segmentLength(segment) >= 4)
    if (landings.length === 0) return false

    const segment = pickOne(rng, landings)
    const cells: [number, number][] = [
      [segment.fromCol, segment.row],
      [segment.fromCol + 1, segment.row],
    ]

    triggers.push({
      zone: columnBand(segment.fromCol - 2, 2),
      condition: 'enter',
      actions: [{ type: 'ice_floor', tiles: cells }],
    })
    return true
  },
}

const BOUNCE_TRAP: TrapRecipe = {
  name: 'bounce_trap',
  words: ['Springy', 'Helpful', 'Eager'],
  apply({ skeleton, door, rng }) {
    // No trigger: the pad and the spikes over it are both in plain sight, and the lie is that a
    // trampoline is a gift. It launches 103px where the spikes hang 64px up, so trusting it is fatal
    // and clipping a jump over it is the answer.
    const doorCol = Math.floor(door.x / TROLL_RUN_TILE_SIZE)
    const roomy = skeleton.floor.filter((segment) => segmentLength(segment) >= 5 && segment.row >= 4)
    if (roomy.length === 0) return false

    const segment = pickOne(rng, roomy)
    const candidates: number[] = []
    for (let col = segment.fromCol + 2; col <= segment.toCol - 2; col += 1) {
      if (Math.abs(col - doorCol) < 2) continue
      if (columnIsClear(skeleton.tiles, col, segment.row - 4, segment.row - 1)) candidates.push(col)
    }
    if (candidates.length === 0) return false

    const col = pickOne(rng, candidates)
    skeleton.tiles[segment.row][col] = TrollRunTileType.BOUNCE
    skeleton.tiles[segment.row - 4][col] = TrollRunTileType.SPIKE_DOWN
    return true
  },
}

const COIN_BAIT: TrapRecipe = {
  name: 'coin_bait',
  words: ['Golden', 'Tempting', 'Costly'],
  apply({ skeleton, triggers, rng }) {
    const roomy = skeleton.floor.filter((segment) => segmentLength(segment) >= 6 && segment.row >= 2)
    if (roomy.length === 0) return false

    const segment = pickOne(rng, roomy)
    const candidates: number[] = []
    for (let col = segment.fromCol + 2; col <= segment.toCol - 3; col += 1) {
      if (columnIsClear(skeleton.tiles, col, segment.row - 2, segment.row - 1)) candidates.push(col)
    }
    if (candidates.length === 0) return false

    // Hung two rows up: out of reach of a walk, inside reach of any jump, so taking it is a choice.
    const col = pickOne(rng, candidates)
    skeleton.tiles[segment.row - 2][col] = TrollRunTileType.COIN

    triggers.push({
      // `collect_coin` fires wherever the coin is taken, so the zone is here to say where that was.
      zone: columnBand(col, 2),
      condition: 'collect_coin',
      actions: [
        {
          type: 'collapse_tiles',
          tiles: [
            [col, segment.row],
            [col + 1, segment.row],
          ],
          delay: 0.2,
        },
      ],
    })
    return true
  },
}

const FLOOR_BEHIND: TrapRecipe = {
  name: 'floor_behind',
  words: ['Vanishing', 'Closing', 'Doomed'],
  apply({ skeleton, triggers, rng }) {
    const width = randomInt(rng, 1, 2)
    // Run-up, the stretch that goes, and a landing after it — and never the tile the runner spawns on.
    const roomy = skeleton.floor.filter((segment) => segmentLength(segment) >= width + 5)
    if (roomy.length === 0) return false

    const segment = pickOne(rng, roomy)
    const startCol = randomInt(rng, segment.fromCol + 2, segment.toCol - width - 2)
    const cells: [number, number][] = []
    for (let offset = 0; offset < width; offset += 1) cells.push([startCol + offset, segment.row])

    triggers.push({
      // Leaving is the cue, so the floor goes as the runner steps off it rather than while they stand
      // on it. Nothing is waiting behind them any more, which is the whole idea.
      zone: columnBand(startCol, width),
      condition: 'exit',
      actions: [{ type: 'collapse_tiles', tiles: cells, delay: 0.1 }],
    })
    return true
  },
}

const BITING_DOOR: TrapRecipe = {
  name: 'biting_door',
  words: ['Snapping', 'Toothed', 'Ravenous'],
  claimsDoor: true,
  apply({ door, triggers }) {
    const doorCol = Math.floor(door.x / TROLL_RUN_TILE_SIZE)
    if (doorCol < 3) return false

    triggers.push({
      // Armed three columns out, so the exit is already snapping by the time the runner arrives. The
      // bite counts itself down: waiting it out is always available, sprinting into it is not.
      zone: columnBand(doorCol - 3, 2),
      condition: 'enter',
      actions: [{ type: 'fake_door', duration: 1.5 }],
    })
    return true
  },
}

const TRAP_PALETTES: Record<TrollRunWorldId, readonly TrapRecipe[]> = {
  pits: [COLLAPSE_UNDERFOOT, COLLAPSE_CHAIN, SPIKE_AMBUSH, FAKE_FLOOR, DOOR_RELOCATES, FLOOR_BEHIND, ICE_PATCH],
  doors: [DOOR_RELOCATES, BAIT_DOOR, SPIKE_WALL, CEILING_DROP, SPIKE_AMBUSH, BITING_DOOR, COIN_BAIT],
  gravity: [CEILING_SPIKES, INVERT_CONTROLS, SPIKE_AMBUSH, ICE_PATCH, BOUNCE_TRAP, BITING_DOOR],
  machines: [BOUNCE_TRAP, ICE_PATCH, COLLAPSE_CHAIN, SPIKE_WALL, CEILING_DROP, FLOOR_BEHIND, BITING_DOOR],
  gauntlet: [
    COLLAPSE_UNDERFOOT,
    COLLAPSE_CHAIN,
    SPIKE_AMBUSH,
    SPIKE_WALL,
    CEILING_DROP,
    FAKE_FLOOR,
    CEILING_SPIKES,
    DOOR_RELOCATES,
    BAIT_DOOR,
    INVERT_CONTROLS,
    ICE_PATCH,
    BOUNCE_TRAP,
    COIN_BAIT,
    FLOOR_BEHIND,
    BITING_DOOR,
  ],
}

function applyTraps(palette: readonly TrapRecipe[], budget: number, context: TrapContext): TrapRecipe[] {
  const untried = [...palette]
  const applied: TrapRecipe[] = []

  while (applied.length < budget && untried.length > 0) {
    const recipe = untried.splice(Math.floor(context.rng() * untried.length), 1)[0]
    if (recipe.claimsDoor && applied.some((chosen) => chosen.claimsDoor)) continue
    if (recipe.apply(context)) applied.push(recipe)
  }

  return applied
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const SHAPE_NOUNS: Record<SkeletonShape, readonly string[]> = {
  flat: ['Causeway', 'Promenade', 'Long Hall'],
  pits: ['Pits', 'Chasm', 'Crossing'],
  steps: ['Stairway', 'Ascent', 'Terraces'],
  islands: ['Islands', 'Stepping Stones', 'Scatter'],
  corridor: ['Corridor', 'Ceiling Run', 'Overhead'],
}

function nameFor(rng: () => number, shape: SkeletonShape, traps: readonly TrapRecipe[]): string {
  const noun = pickOne(rng, SHAPE_NOUNS[shape])
  if (traps.length === 0) return `The ${noun}`
  return `${pickOne(rng, traps[0].words)} ${noun}`
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const GENERATION_ATTEMPTS = 8

/**
 * An attempt number past the last real one, meaning "build the plain room instead". An unbroken floor
 * with the exit at the far end cannot fail — no gap to clear, no trap to spring, only ground to walk
 * — so a seed the palette could not satisfy still yields a real level rather than a broken one.
 */
export const TROLL_RUN_PLAIN_ATTEMPT = GENERATION_ATTEMPTS

export interface TrollRunGenerationRequest {
  /** The level's id, which is the descriptor it was built from. */
  id: string
  world: TrollRunWorldId
  seed: number
  /** Zero-based position in the round, which drives the difficulty ramp. */
  slot: number
  /**
   * Which attempt to build. `findFairTrollRunAttempt` chooses it once, and the descriptor carries it
   * so that rebuilding the level costs a few array writes rather than a run of the solver.
   */
  attempt: number
}

export function generateTrollRunLevel(request: TrollRunGenerationRequest): TrollRunLevel {
  const slot = Math.min(Math.max(Math.trunc(request.slot), 0), SLOT_COUNT - 1)
  const isPlain = request.attempt >= TROLL_RUN_PLAIN_ATTEMPT
  const rng = createSeededRng(
    hashSeedText(`${request.world}:${request.seed}:${slot}:${isPlain ? 'plain' : request.attempt}`)
  )

  const shape: SkeletonShape = isPlain ? 'flat' : pickOne(rng, SHAPES_BY_WORLD[request.world])
  const skeleton = buildSkeleton(rng, shape, GAP_WIDTH_BY_SLOT[slot])
  const triggers: TrollTrigger[] = []

  let door: { x: number; y: number }
  if (skeleton.gateCol !== null) {
    // The exit is on the ceiling, which puts it out of reach until the gate turns gravity over. That
    // gate is not one trap among several — it is the way through.
    const landing = skeleton.ceiling[skeleton.ceiling.length - 1]
    door = doorUnderCeiling(randomInt(rng, Math.max(landing.fromCol, LAST_COL - 3), LAST_COL - 1), landing.row)
    triggers.push({ zone: columnBand(skeleton.gateCol), condition: 'enter', actions: [{ type: 'flip_gravity' }] })
  } else {
    const landing = skeleton.floor[skeleton.floor.length - 1]
    const spots = doorSpots(skeleton.tiles, [landing])
    const spot = spots.length > 0 ? spots[Math.max(0, spots.length - 1 - randomInt(rng, 0, 2))] : null
    door = spot ? doorOnPlatform(spot.col, spot.row) : doorOnPlatform(LAST_COL, landing.row)
  }

  const traps = applyTraps(TRAP_PALETTES[request.world], isPlain ? 0 : TRAP_COUNT_BY_SLOT[slot], {
    skeleton,
    door,
    triggers,
    rng,
  })

  return {
    id: request.id,
    world: request.world,
    name: nameFor(rng, shape, traps),
    width: TROLL_RUN_INTERNAL_WIDTH,
    height: TROLL_RUN_INTERNAL_HEIGHT,
    spawn: spawnOn(skeleton.floor[0]),
    door,
    tiles: skeleton.tiles,
    triggers,
    parTime: PAR_SECONDS_BY_SLOT[slot],
  }
}

/**
 * Whether a candidate is fit to hand a player: the exit is not buried where it starts or where a trap
 * sends it, the level can be finished even with every trap already sprung, and the route it demands
 * sits comfortably inside par without being over before it began.
 */
export function isFairTrollRunLevel(level: TrollRunLevel): boolean {
  if (trollRunDoorIsBuried(level.tiles, level.door)) return false
  if (trollRunDoorIsBuried(level.tiles, trollRunFinalDoor(level))) return false

  const verdict = checkTrollRunSolvable(level)
  if (!verdict.solvable) return false
  if (verdict.seconds < MIN_ROUTE_SECONDS) return false
  return verdict.seconds <= level.parTime
}

/**
 * The first attempt at this slot the solver signs off on, or `TROLL_RUN_PLAIN_ATTEMPT` when none of
 * them held up. This is the expensive half of generation and it runs once, where the round order is
 * built; every client then rebuilds the chosen attempt directly.
 */
export function findFairTrollRunAttempt(world: TrollRunWorldId, seed: number, slot: number): number {
  for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = generateTrollRunLevel({ id: `${world}:probe:${slot}`, world, seed, slot, attempt })
    if (isFairTrollRunLevel(candidate)) return attempt
  }
  return TROLL_RUN_PLAIN_ATTEMPT
}
