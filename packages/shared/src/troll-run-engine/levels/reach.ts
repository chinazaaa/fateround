/**
 * Can the runner actually get from the spawn to the door?
 *
 * Generated levels have nobody to playtest them, so this module answers that question before one is
 * ever handed to the engine. Rather than re-deriving jump arcs from the physics constants — a second
 * copy of the physics, free to drift from the first — it searches by *running* the real
 * `updatePlayerPhysics`: from every place the player can stand, it plays out a short menu of
 * plausible inputs and records where each one puts them. An edge exists because the game's own
 * physics produced it, so spikes, ice, bounce pads and fake floors are all handled by construction.
 */

import { createInitialPlayerState, updatePlayerPhysics } from '../physics'
import {
  TROLL_RUN_DOOR_HEIGHT,
  TROLL_RUN_DOOR_WIDTH,
  TROLL_RUN_GRID_COLS,
  TROLL_RUN_GRID_ROWS,
  TROLL_RUN_PHYSICS,
  TROLL_RUN_TILE_SIZE,
  TrollRunTileType,
  type InputState,
  type TrollMovingEntity,
  type TrollRunLevel,
} from '../types'

/** The engine's fixed step. Matching it keeps simulated arcs identical to played ones. */
const SIMULATION_DT = 1 / 60

/**
 * Frame ceiling for a single move. A full jump lasts 40 frames and the longest bounce arc about 55,
 * so 150 leaves room for a long fall while still bounding a plan that goes nowhere.
 */
const MAX_FRAMES_PER_MOVE = 150

export interface TrollRunRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A place the player can come to rest. `supportRow` is the row of the tile holding them up — below
 * their feet normally, above their head when gravity is inverted.
 */
export interface TrollRunStandingSpot {
  col: number
  supportRow: number
}

/**
 * One thing a player might try from a standstill: a direction, optionally a jump, and how long each
 * is held. Two direction-hold lengths matter because letting go mid-flight is how you land on a
 * narrow ledge instead of sailing past it, and three jump lengths cover the tap, the half and the
 * full-height jump that TROLL_RUN_PHYSICS.JUMP_CUT_MULTIPLIER makes distinct.
 */
interface MovePlan {
  direction: -1 | 0 | 1
  /** Frames the jump button is held, or null for no jump at all. */
  jumpHoldFrames: number | null
  /** Frames the direction is held. */
  directionHoldFrames: number
}

const DIRECTION_HOLD_ALL = MAX_FRAMES_PER_MOVE
const DIRECTION_HOLD_SHORT = 14

const MOVE_PLANS: readonly MovePlan[] = (() => {
  const plans: MovePlan[] = []
  for (const direction of [-1, 0, 1] as const) {
    for (const jumpHoldFrames of [null, 4, 8, 20]) {
      for (const directionHoldFrames of [DIRECTION_HOLD_ALL, DIRECTION_HOLD_SHORT]) {
        // Standing perfectly still goes nowhere, and with no direction to release the short hold is
        // the same plan twice.
        if (direction === 0 && jumpHoldFrames === null) continue
        if (direction === 0 && directionHoldFrames === DIRECTION_HOLD_SHORT) continue
        plans.push({ direction, jumpHoldFrames, directionHoldFrames })
      }
    }
  }
  return plans
})()

function tileAt(tiles: number[][], col: number, row: number): number {
  if (row < 0 || row >= tiles.length || col < 0 || col >= TROLL_RUN_GRID_COLS) return TrollRunTileType.EMPTY
  return tiles[row][col] ?? TrollRunTileType.EMPTY
}

function isSpikeTile(tile: number): boolean {
  return (
    tile === TrollRunTileType.SPIKE_UP ||
    tile === TrollRunTileType.SPIKE_DOWN ||
    tile === TrollRunTileType.SPIKE_LEFT ||
    tile === TrollRunTileType.SPIKE_RIGHT
  )
}

/** The tile kinds the player collides with, mirroring `isSolidTile` in physics.ts. */
export function isSolidTileType(tile: number): boolean {
  return (
    tile === TrollRunTileType.SOLID ||
    tile === TrollRunTileType.ICE ||
    tile === TrollRunTileType.BOUNCE ||
    tile === TrollRunTileType.FAKE_SOLID
  )
}

/**
 * A cell that will still be holding the player up a moment after they land on it. Bounce pads
 * launch instead of supporting, and fake floors delete themselves the instant weight lands on them
 * (`steppedOnFake` in physics.ts), so neither one is a place to stand.
 */
function supportsWeight(tile: number): boolean {
  return tile === TrollRunTileType.SOLID || tile === TrollRunTileType.ICE
}

function bodyRowOf(supportRow: number, gravityUp: boolean): number {
  return gravityUp ? supportRow + 1 : supportRow - 1
}

export function isStandableSpot(tiles: number[][], col: number, supportRow: number, gravityUp = false): boolean {
  if (col < 0 || col >= TROLL_RUN_GRID_COLS) return false
  const bodyRow = bodyRowOf(supportRow, gravityUp)
  if (bodyRow < 0 || bodyRow >= TROLL_RUN_GRID_ROWS) return false
  if (!supportsWeight(tileAt(tiles, col, supportRow))) return false
  const bodyTile = tileAt(tiles, col, bodyRow)
  return !isSolidTileType(bodyTile) && !isSpikeTile(bodyTile)
}

/** The 12x14 rectangle the player occupies while resting on a spot. */
export function standingRect(spot: TrollRunStandingSpot, gravityUp = false): TrollRunRect {
  const inset = (TROLL_RUN_TILE_SIZE - TROLL_RUN_PHYSICS.PLAYER_WIDTH) / 2
  return {
    x: spot.col * TROLL_RUN_TILE_SIZE + inset,
    y: gravityUp
      ? (spot.supportRow + 1) * TROLL_RUN_TILE_SIZE
      : spot.supportRow * TROLL_RUN_TILE_SIZE - TROLL_RUN_PHYSICS.PLAYER_HEIGHT,
    w: TROLL_RUN_PHYSICS.PLAYER_WIDTH,
    h: TROLL_RUN_PHYSICS.PLAYER_HEIGHT,
  }
}

export function listStandingSpots(tiles: number[][], gravityUp = false): TrollRunStandingSpot[] {
  const spots: TrollRunStandingSpot[] = []
  for (let supportRow = 0; supportRow < TROLL_RUN_GRID_ROWS; supportRow += 1) {
    for (let col = 0; col < TROLL_RUN_GRID_COLS; col += 1) {
      if (isStandableSpot(tiles, col, supportRow, gravityUp)) spots.push({ col, supportRow })
    }
  }
  return spots
}

export function doorRect(door: { x: number; y: number }): TrollRunRect {
  return { x: door.x, y: door.y, w: TROLL_RUN_DOOR_WIDTH, h: TROLL_RUN_DOOR_HEIGHT }
}

function rectsOverlap(first: TrollRunRect, second: TrollRunRect): boolean {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  )
}

function spotKey(spot: TrollRunStandingSpot): string {
  return `${spot.col},${spot.supportRow}`
}

/** Where a resting player's body puts them on the grid. */
function spotUnderPlayer(x: number, y: number, gravityUp: boolean): TrollRunStandingSpot {
  const col = Math.floor((x + TROLL_RUN_PHYSICS.PLAYER_WIDTH / 2) / TROLL_RUN_TILE_SIZE)
  const supportRow = gravityUp
    ? Math.floor((y - 1) / TROLL_RUN_TILE_SIZE)
    : Math.floor((y + TROLL_RUN_PHYSICS.PLAYER_HEIGHT) / TROLL_RUN_TILE_SIZE)
  return { col, supportRow }
}

function inputForFrame(plan: MovePlan, frameIndex: number): InputState {
  const directionActive = frameIndex < plan.directionHoldFrames
  const jumping = plan.jumpHoldFrames !== null
  return {
    left: directionActive && plan.direction === -1,
    right: directionActive && plan.direction === 1,
    jump: jumping && frameIndex <= (plan.jumpHoldFrames ?? 0),
    jumpPressed: jumping && frameIndex === 0,
    jumpReleased: jumping && frameIndex === (plan.jumpHoldFrames ?? 0) + 1,
  }
}

interface SimulationSetup {
  tiles: number[][]
  door: { x: number; y: number }
  movingEntities: TrollMovingEntity[]
  gravityUp: boolean
  target: TrollRunRect
}

type MoveOutcome =
  | { kind: 'reached'; frames: number; position: { x: number; y: number } }
  | { kind: 'landed'; frames: number; spot: TrollRunStandingSpot; position: { x: number; y: number } }
  | { kind: 'nowhere' }

/**
 * Plays one plan out frame by frame and reports what became of it.
 *
 * Each run gets its own copy of the grid because the physics edits it: coins are consumed and, via
 * `steppedOnFake`, a fake floor is deleted the moment it is stood on — which `engine.ts` does too,
 * and which is exactly why a fake tile can never be a resting place.
 */
function simulateMove(
  setup: SimulationSetup,
  origin: { x: number; y: number },
  plan: MovePlan | null,
  startSpot: TrollRunStandingSpot | null
): MoveOutcome {
  const tiles = setup.tiles.map((row) => [...row])
  const player = createInitialPlayerState(origin)
  player.gravityInverted = setup.gravityUp

  if (startSpot) {
    // Resting on solid ground: grounded with coyote time banked, so a jump on frame one is real.
    player.grounded = true
    player.coyoteTimer = TROLL_RUN_PHYSICS.COYOTE_TIME
  }

  const idleInput: InputState = { left: false, right: false, jump: false, jumpPressed: false, jumpReleased: false }
  let hasLeftGround = false

  for (let frameIndex = 0; frameIndex < MAX_FRAMES_PER_MOVE; frameIndex += 1) {
    const input = plan ? inputForFrame(plan, frameIndex) : idleInput
    const result = updatePlayerPhysics(player, input, SIMULATION_DT, tiles, setup.door, setup.movingEntities)

    for (const fake of result.steppedOnFake) {
      tiles[fake.row][fake.col] = TrollRunTileType.EMPTY
    }

    if (result.hitSpike || !player.alive) return { kind: 'nowhere' }

    const frames = frameIndex + 1
    const body: TrollRunRect = {
      x: player.x,
      y: player.y,
      w: TROLL_RUN_PHYSICS.PLAYER_WIDTH,
      h: TROLL_RUN_PHYSICS.PLAYER_HEIGHT,
    }
    if (rectsOverlap(body, setup.target)) return { kind: 'reached', frames, position: { x: player.x, y: player.y } }

    if (!player.grounded) {
      hasLeftGround = true
      continue
    }

    const spot = spotUnderPlayer(player.x, player.y, setup.gravityUp)
    const isNewSpot = !startSpot || spotKey(spot) !== spotKey(startSpot)
    if (isNewSpot && isStandableSpot(tiles, spot.col, spot.supportRow, setup.gravityUp)) {
      return { kind: 'landed', frames, spot, position: { x: player.x, y: player.y } }
    }
    // Back where they started after a hop: this plan taught us nothing, and staying would only burn
    // frames standing still.
    if (hasLeftGround && !isNewSpot) return { kind: 'nowhere' }
  }

  return { kind: 'nowhere' }
}

export interface TrollRunRouteRequest {
  /** Grid to search. Defaults to the level's own tiles; pass a mutated copy to test a fired trap. */
  tiles?: number[][]
  /** Search along the ceiling instead of the floor, for levels whose traps flip gravity. */
  gravityUp?: boolean
  /** Where the run starts. Defaults to the level's spawn point. */
  from?: { x: number; y: number }
  /** Where the door is when the runner has to reach it. Defaults to the level's layout position. */
  door?: { x: number; y: number }
  /** Goal rectangle. Defaults to the door, but a trigger zone works too. */
  target?: TrollRunRect
}

export interface TrollRunRoute {
  /** Resting places along the way, spawn landing first. */
  spots: TrollRunStandingSpot[]
  /** How long the route takes the simulated runner, in seconds. */
  seconds: number
  /**
   * Where the runner was standing — or flying — the moment they touched the goal. A second leg
   * (after a gravity flip, say) picks up from exactly here.
   */
  arrival: { x: number; y: number }
}

/**
 * Breadth-first search from the spawn to the goal, expanding each resting place by every move plan.
 * Returns the route — fewest moves, with the time the simulation took to walk it — or null when the
 * goal cannot be reached at all.
 */
export function findTrollRunRoute(level: TrollRunLevel, request: TrollRunRouteRequest = {}): TrollRunRoute | null {
  const door = request.door ?? level.door
  const setup: SimulationSetup = {
    tiles: request.tiles ?? level.tiles,
    door,
    movingEntities: level.movingEntities ?? [],
    gravityUp: request.gravityUp ?? false,
    target: request.target ?? doorRect(door),
  }

  const spawn = request.from ?? level.spawn
  const landing = simulateMove(setup, spawn, null, null)
  if (landing.kind === 'reached') {
    return { spots: [], seconds: landing.frames * SIMULATION_DT, arrival: landing.position }
  }
  if (landing.kind === 'nowhere') return null

  const start = landing.spot
  const startKey = spotKey(start)
  const cameFrom = new Map<string, TrollRunStandingSpot | null>([[startKey, null]])
  const framesToReach = new Map<string, number>([[startKey, landing.frames]])
  const queue: TrollRunStandingSpot[] = [start]

  const routeTo = (goal: TrollRunStandingSpot, extraFrames: number, arrival: { x: number; y: number }) => {
    const spots: TrollRunStandingSpot[] = []
    let cursor: TrollRunStandingSpot | null = goal
    while (cursor) {
      spots.unshift(cursor)
      cursor = cameFrom.get(spotKey(cursor)) ?? null
    }
    const frames = (framesToReach.get(spotKey(goal)) ?? 0) + extraFrames
    return { spots, seconds: frames * SIMULATION_DT, arrival }
  }

  while (queue.length > 0) {
    const current = queue.shift() as TrollRunStandingSpot
    const currentKey = spotKey(current)
    const origin = standingRect(current, setup.gravityUp)
    const framesSoFar = framesToReach.get(currentKey) ?? 0

    for (const plan of MOVE_PLANS) {
      const outcome = simulateMove(setup, origin, plan, current)
      if (outcome.kind === 'reached') return routeTo(current, outcome.frames, outcome.position)
      if (outcome.kind === 'nowhere') continue

      const nextKey = spotKey(outcome.spot)
      if (cameFrom.has(nextKey)) continue
      cameFrom.set(nextKey, current)
      framesToReach.set(nextKey, framesSoFar + outcome.frames)
      queue.push(outcome.spot)
    }
  }

  return null
}

export interface TrollRunDoorPlacement {
  x: number
  y: number
  /** Where this placement comes from, so a failure names the trap that caused it. */
  origin: string
}

/**
 * Every position the exit door can come to rest in during a level: where it is laid out, plus
 * wherever a trap sends it. Each level moves the door at most once, so a destination is always
 * measured from the starting position — the same thing `TriggerManager` tweens towards.
 */
export function trollRunDoorPlacements(level: TrollRunLevel): TrollRunDoorPlacement[] {
  const placements: TrollRunDoorPlacement[] = [{ x: level.door.x, y: level.door.y, origin: 'layout' }]

  level.triggers.forEach((trigger, triggerIndex) => {
    const triggerLabel = trigger.id ?? `trigger #${triggerIndex}`
    for (const action of trigger.actions) {
      if (action.type === 'move_door') {
        placements.push({ x: action.to.x, y: action.to.y, origin: `move_door from ${triggerLabel}` })
      } else if (action.type === 'door_runs_away') {
        const deltaX =
          action.direction === 'right' ? action.distance : action.direction === 'left' ? -action.distance : 0
        const deltaY = action.direction === 'down' ? action.distance : action.direction === 'up' ? -action.distance : 0
        placements.push({
          x: level.door.x + deltaX,
          y: level.door.y + deltaY,
          origin: `door_runs_away ${action.direction} from ${triggerLabel}`,
        })
      }
    }
  })

  return placements
}

/** The tile columns or rows a rectangle covers, clamped to whole tiles. */
function coveredTileRange(start: number, size: number): { from: number; to: number } {
  return {
    from: Math.floor(start / TROLL_RUN_TILE_SIZE),
    to: Math.floor((start + size - 1) / TROLL_RUN_TILE_SIZE),
  }
}

/**
 * Whether the door's hitbox is inside level geometry.
 *
 * This is the check "The Grand Chase" failed: its door was tweened onto a spot occupied by a
 * platform, over a pit, so the level could be started but never finished. A door the runner cannot
 * put their own hitbox into is not an exit.
 */
export function trollRunDoorIsBuried(tiles: number[][], door: { x: number; y: number }): boolean {
  const columns = coveredTileRange(door.x, TROLL_RUN_DOOR_WIDTH)
  const rows = coveredTileRange(door.y, TROLL_RUN_DOOR_HEIGHT)

  for (let row = rows.from; row <= rows.to; row += 1) {
    for (let col = columns.from; col <= columns.to; col += 1) {
      if (isSolidTileType(tileAt(tiles, col, row))) return true
    }
  }
  return false
}

/**
 * The grid as it stands once every trap in the level has fired: floors collapsed, spikes out, ice
 * spread. Applying all of them at once is deliberately harsher than any single life — it is the
 * worst layout the level can present, which is what `checkTrollRunSolvable` measures against.
 */
export function trollRunTilesAfterTraps(level: TrollRunLevel): number[][] {
  const tiles = level.tiles.map((row) => [...row])

  const write = (col: number, row: number, tile: number) => {
    if (tiles[row]?.[col] === undefined) return
    tiles[row][col] = tile
  }

  for (const trigger of level.triggers) {
    for (const action of trigger.actions) {
      if (action.type === 'collapse_tiles') {
        for (const [col, row] of action.tiles) write(col, row, TrollRunTileType.EMPTY)
      } else if (action.type === 'ice_floor') {
        for (const [col, row] of action.tiles) write(col, row, TrollRunTileType.ICE)
      } else if (action.type === 'spawn_spikes') {
        const spikeType =
          action.direction === 'up'
            ? TrollRunTileType.SPIKE_UP
            : action.direction === 'down'
              ? TrollRunTileType.SPIKE_DOWN
              : action.direction === 'left'
                ? TrollRunTileType.SPIKE_LEFT
                : TrollRunTileType.SPIKE_RIGHT
        for (const [col, row] of action.positions) write(col, row, spikeType)
      }
    }
  }

  return tiles
}

/** Where the door ends up once the traps that chase it have run. */
export function trollRunFinalDoor(level: TrollRunLevel): { x: number; y: number } {
  const placements = trollRunDoorPlacements(level)
  const last = placements[placements.length - 1]
  return { x: last.x, y: last.y }
}

export interface TrollRunSolvability {
  solvable: boolean
  /** Seconds the simulated runner needs to walk it — a floor for a fair par time. */
  seconds: number
  /** How it was cleared: a straight run, or the two legs a gravity flip needs. Null if it wasn't. */
  via: 'route' | 'gravity-flip' | null
}

const UNSOLVED: TrollRunSolvability = { solvable: false, seconds: 0, via: null }

/**
 * Whether the door can be reached on one particular grid.
 *
 * A level whose door sits on the ceiling is unreachable until a trap inverts gravity, so those get
 * the two-leg treatment: reach the flip zone the normal way up, then reach the door from exactly
 * where the flip fired, with gravity reversed. That is the shape `gravity-04` uses, where the floor
 * is nothing but spikes.
 *
 * The flip is tried first when the level has one, because on those levels the straight run is the
 * expensive answer: it has to exhaust every spot in the room before it can conclude the door is out
 * of reach, and that null costs far more than the two legs that succeed. Either route proves the
 * level clearable, so trying the likely one first only changes the bill. The seconds it reports are
 * therefore the flip route's, which is the longer way round — and reporting the longer route makes
 * the par-time check stricter, never more forgiving.
 */
function solveOnGrid(level: TrollRunLevel, tiles: number[][], door: { x: number; y: number }): TrollRunSolvability {
  const flipTrigger = level.triggers.find((trigger) => trigger.actions.some((action) => action.type === 'flip_gravity'))

  if (flipTrigger) {
    const toFlipZone = findTrollRunRoute(level, { tiles, door, target: flipTrigger.zone })
    if (toFlipZone) {
      const afterFlip = findTrollRunRoute(level, { tiles, door, gravityUp: true, from: toFlipZone.arrival })
      if (afterFlip) {
        return { solvable: true, seconds: toFlipZone.seconds + afterFlip.seconds, via: 'gravity-flip' }
      }
    }
  }

  const direct = findTrollRunRoute(level, { tiles, door })
  return direct ? { solvable: true, seconds: direct.seconds, via: 'route' } : UNSOLVED
}

/**
 * Whether a level can be finished on the layout as it is built.
 *
 * This is the check "The Grand Chase" failed before its door was moved: a door the runner has no
 * way of touching makes the level a dead end no matter how well the rest of it plays.
 */
export function checkTrollRunReachable(level: TrollRunLevel): TrollRunSolvability {
  return solveOnGrid(level, level.tiles, trollRunFinalDoor(level))
}

/**
 * Whether a level can be finished *even with every trap already sprung* — collapses gone, spikes
 * out, ice spread.
 *
 * This asks for more than the game strictly demands, and authored levels are allowed to be cleverer
 * than it. `pits-07` drops the one mid-air platform out from under the runner, so clearing it means
 * jumping off again inside the trap's 0.3s delay; the level is fine because `resetLevelRuntime`
 * (engine.ts) restores the tiles on every death, and a designer verified that timing by hand.
 *
 * A generated level has nobody to verify it, so it gets the bar that needs no verifying: clearable
 * with all of it already fired means no seed can produce a level that a player who dies once is
 * then stuck on for the rest of the round.
 */
export function checkTrollRunSolvable(level: TrollRunLevel): TrollRunSolvability {
  const door = trollRunFinalDoor(level)
  const pristine = solveOnGrid(level, level.tiles, door)
  if (!pristine.solvable) return pristine

  const sprung = solveOnGrid(level, trollRunTilesAfterTraps(level), door)
  if (!sprung.solvable) return sprung

  return { solvable: true, seconds: Math.max(pristine.seconds, sprung.seconds), via: sprung.via }
}
