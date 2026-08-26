/**
 * Physics simulation and AABB collision resolution for Troll Run.
 */

import {
  TROLL_RUN_DOOR_HEIGHT,
  TROLL_RUN_DOOR_WIDTH,
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TROLL_RUN_PHYSICS,
  TROLL_RUN_TILE_SIZE,
  TrollRunTileType,
  trollEntityIsActive,
  type TrollMovingEntity,
  type TrollRunDoorState,
} from './types'
import type { InputState, PlayerState } from './types'

// How far outside the visible viewport the player may travel before the fall counts as a death.
const OUT_OF_BOUNDS_MARGIN = 40

// How far past the viewport an unbounded entity flies before it is dropped.
const ENTITY_DESPAWN_MARGIN = 24

// Upward launch speed of a bounce pad, in pixels/s (negative is up).
const BOUNCE_VELOCITY = -450

export interface CollisionResult {
  hitSpike: boolean
  collectedCoin: boolean
  reachedDoor: boolean
  jumped: boolean
  steppedOnFake: Array<{ col: number; row: number }>
}

export function createInitialPlayerState(spawn: { x: number; y: number }): PlayerState {
  return {
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    width: TROLL_RUN_PHYSICS.PLAYER_WIDTH,
    height: TROLL_RUN_PHYSICS.PLAYER_HEIGHT,
    grounded: false,
    onIce: false,
    facing: 'right',
    alive: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumping: false,
    invertedControlsTimer: 0,
    gravityInverted: false,
    doorEntryProgress: 0,
    ridingEntityId: null,
  }
}

export function aabbIntersect(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

export function updatePlayerPhysics(
  player: PlayerState,
  input: InputState,
  dt: number,
  tiles: number[][],
  door: TrollRunDoorState,
  movingEntities: TrollMovingEntity[] = []
): CollisionResult {
  const result: CollisionResult = {
    hitSpike: false,
    collectedCoin: false,
    reachedDoor: false,
    jumped: false,
    steppedOnFake: [],
  }

  if (!player.alive) return result

  // Handle Inverted Controls Timer
  if (player.invertedControlsTimer > 0) {
    player.invertedControlsTimer -= dt
  }

  const effectiveLeft = player.invertedControlsTimer > 0 ? input.right : input.left
  const effectiveRight = player.invertedControlsTimer > 0 ? input.left : input.right

  // Horizontal Movement (Instant snappy response or ice sliding)
  let targetVx = 0
  if (effectiveLeft) {
    targetVx = -TROLL_RUN_PHYSICS.MOVE_SPEED
    player.facing = 'left'
  } else if (effectiveRight) {
    targetVx = TROLL_RUN_PHYSICS.MOVE_SPEED
    player.facing = 'right'
  }

  if (player.onIce) {
    player.vx += (targetVx - player.vx) * (dt * 4) // slippery ice
  } else {
    player.vx = targetVx // instant stop/start
  }

  // Coyote Time & Jump Buffering
  if (player.grounded) {
    player.coyoteTimer = TROLL_RUN_PHYSICS.COYOTE_TIME
  } else {
    player.coyoteTimer = Math.max(0, player.coyoteTimer - dt)
  }

  if (input.jumpPressed) {
    player.jumpBufferTimer = TROLL_RUN_PHYSICS.JUMP_BUFFER
  } else {
    player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt)
  }

  // Gravity
  const gravity = player.gravityInverted ? -TROLL_RUN_PHYSICS.GRAVITY : TROLL_RUN_PHYSICS.GRAVITY
  player.vy += gravity * dt

  const maxFall = player.gravityInverted ? -TROLL_RUN_PHYSICS.MAX_FALL_SPEED : TROLL_RUN_PHYSICS.MAX_FALL_SPEED

  if (player.gravityInverted) {
    if (player.vy < maxFall) player.vy = maxFall
  } else {
    if (player.vy > maxFall) player.vy = maxFall
  }

  // Jump execution
  const canJump = player.coyoteTimer > 0
  if (player.jumpBufferTimer > 0 && canJump) {
    const jumpVel = player.gravityInverted ? -TROLL_RUN_PHYSICS.JUMP_VELOCITY : TROLL_RUN_PHYSICS.JUMP_VELOCITY
    player.vy = jumpVel
    player.jumping = true
    player.coyoteTimer = 0
    player.jumpBufferTimer = 0
    result.jumped = true
  }

  // Variable Jump Height (Cut jump when released early)
  if (input.jumpReleased && player.jumping) {
    if (!player.gravityInverted && player.vy < 0) {
      player.vy *= TROLL_RUN_PHYSICS.JUMP_CUT_MULTIPLIER
    } else if (player.gravityInverted && player.vy > 0) {
      player.vy *= TROLL_RUN_PHYSICS.JUMP_CUT_MULTIPLIER
    }
    player.jumping = false
  }

  // Horizontal Movement & Collision
  player.x += player.vx * dt
  resolveTileCollisionsX(player, tiles, result)

  // Vertical Movement & Collision
  player.y += player.vy * dt
  player.grounded = false
  player.onIce = false
  player.ridingEntityId = null
  resolveTileCollisionsY(player, tiles, result)

  // Moving Entity Collisions (crushers, buzzsaws, lifts, sliding platforms)
  for (const entity of movingEntities) {
    // A pulsing hazard in its gap is not there at all: no hitbox, no footing.
    if (!trollEntityIsActive(entity)) continue
    if (!aabbIntersect(player.x, player.y, player.width, player.height, entity.x, entity.y, entity.w, entity.h)) {
      continue
    }
    if (entity.killsOnTouch) {
      result.hitSpike = true
      continue
    }
    if (entity.solid) {
      resolveSolidEntity(player, entity)
    }
  }

  // Door Collision — same hitbox the renderer draws
  if (
    aabbIntersect(
      player.x,
      player.y,
      player.width,
      player.height,
      door.x,
      door.y,
      TROLL_RUN_DOOR_WIDTH,
      TROLL_RUN_DOOR_HEIGHT
    )
  ) {
    // A biting door is a hazard, not an exit: `fake_door` has given it teeth for a moment.
    if ((door.biteTimer ?? 0) > 0) {
      result.hitSpike = true
    } else {
      result.reachedDoor = true
    }
  }

  // Out of bounds death
  if (
    player.y > TROLL_RUN_INTERNAL_HEIGHT + OUT_OF_BOUNDS_MARGIN ||
    player.y < -OUT_OF_BOUNDS_MARGIN ||
    player.x < -OUT_OF_BOUNDS_MARGIN ||
    player.x > TROLL_RUN_INTERNAL_WIDTH + OUT_OF_BOUNDS_MARGIN
  ) {
    result.hitSpike = true
  }

  return result
}

/**
 * Moves the machinery. Patrolled entities ping-pong between their bounds; unbounded ones fly
 * straight and are dropped once they leave the screen, so spawned hazards do not pile up. A runner
 * standing on a solid entity is carried by the same delta, which is what makes a lift feel like a
 * lift instead of a floor that slides out from under them.
 */
export function advanceTrollRunEntities(entities: TrollMovingEntity[], player: PlayerState, dt: number): void {
  for (let index = entities.length - 1; index >= 0; index--) {
    const entity = entities[index]
    // A pulsing hazard keeps its own clock whether or not it travels, so a beam bolted to a wall
    // still blinks.
    if (entity.pulse) entity.pulseElapsed = (entity.pulseElapsed ?? 0) + dt
    if (!entity.vx && !entity.vy) continue

    const previousX = entity.x
    const previousY = entity.y

    if (entity.vx) entity.x += entity.vx * dt
    if (entity.vy) entity.y += entity.vy * dt

    const patrol = entity.patrol
    if (patrol) {
      if (patrol.minX !== undefined && entity.x < patrol.minX) {
        entity.x = patrol.minX
        entity.vx = Math.abs(entity.vx ?? 0)
      } else if (patrol.maxX !== undefined && entity.x > patrol.maxX) {
        entity.x = patrol.maxX
        entity.vx = -Math.abs(entity.vx ?? 0)
      }
      if (patrol.minY !== undefined && entity.y < patrol.minY) {
        entity.y = patrol.minY
        entity.vy = Math.abs(entity.vy ?? 0)
      } else if (patrol.maxY !== undefined && entity.y > patrol.maxY) {
        entity.y = patrol.maxY
        entity.vy = -Math.abs(entity.vy ?? 0)
      }
    } else if (
      entity.x + entity.w < -ENTITY_DESPAWN_MARGIN ||
      entity.x > TROLL_RUN_INTERNAL_WIDTH + ENTITY_DESPAWN_MARGIN ||
      entity.y + entity.h < -ENTITY_DESPAWN_MARGIN ||
      entity.y > TROLL_RUN_INTERNAL_HEIGHT + ENTITY_DESPAWN_MARGIN
    ) {
      entities.splice(index, 1)
      continue
    }

    if (player.alive && player.ridingEntityId === entity.id) {
      player.x += entity.x - previousX
      player.y += entity.y - previousY
    }
  }
}

function resolveTileCollisionsX(player: PlayerState, tiles: number[][], result: CollisionResult): void {
  const startCol = Math.floor(player.x / TROLL_RUN_TILE_SIZE)
  const endCol = Math.floor((player.x + player.width - 0.01) / TROLL_RUN_TILE_SIZE)
  const startRow = Math.floor(player.y / TROLL_RUN_TILE_SIZE)
  const endRow = Math.floor((player.y + player.height - 0.01) / TROLL_RUN_TILE_SIZE)

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (row < 0 || row >= tiles.length || col < 0 || col >= (tiles[0]?.length ?? 0)) continue
      const tile = tiles[row][col]

      if (isSpike(tile)) {
        if (checkSpikeCollision(player, col, row, tile)) {
          result.hitSpike = true
        }
      } else if (tile === TrollRunTileType.COIN) {
        result.collectedCoin = true
        tiles[row][col] = TrollRunTileType.EMPTY
      } else if (isSolidTile(tile)) {
        // Fake tiles block sideways movement exactly like real ones — the lie only
        // breaks when the player puts weight on top of them.
        if (player.vx > 0) {
          player.x = col * TROLL_RUN_TILE_SIZE - player.width
          player.vx = 0
        } else if (player.vx < 0) {
          player.x = (col + 1) * TROLL_RUN_TILE_SIZE
          player.vx = 0
        }
      }
    }
  }
}

function resolveTileCollisionsY(player: PlayerState, tiles: number[][], result: CollisionResult): void {
  const startCol = Math.floor(player.x / TROLL_RUN_TILE_SIZE)
  const endCol = Math.floor((player.x + player.width - 0.01) / TROLL_RUN_TILE_SIZE)
  const startRow = Math.floor(player.y / TROLL_RUN_TILE_SIZE)
  const endRow = Math.floor((player.y + player.height - 0.01) / TROLL_RUN_TILE_SIZE)

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (row < 0 || row >= tiles.length || col < 0 || col >= (tiles[0]?.length ?? 0)) continue
      const tile = tiles[row][col]

      if (isSpike(tile)) {
        if (checkSpikeCollision(player, col, row, tile)) {
          result.hitSpike = true
        }
      } else if (tile === TrollRunTileType.COIN) {
        result.collectedCoin = true
        tiles[row][col] = TrollRunTileType.EMPTY
      } else if (isSolidTile(tile)) {
        if (player.vy > 0) {
          player.y = row * TROLL_RUN_TILE_SIZE - player.height
          if (tile === TrollRunTileType.BOUNCE) {
            player.vy = BOUNCE_VELOCITY
          } else {
            player.vy = 0
            player.grounded = !player.gravityInverted
          }
          if (tile === TrollRunTileType.ICE) {
            player.onIce = true
          }
          if (tile === TrollRunTileType.FAKE_SOLID && !player.gravityInverted) {
            result.steppedOnFake.push({ col, row })
          }
        } else if (player.vy < 0) {
          player.y = (row + 1) * TROLL_RUN_TILE_SIZE
          if (tile === TrollRunTileType.BOUNCE && player.gravityInverted) {
            // Under inverted gravity the pad is underfoot, so it launches the other way.
            player.vy = -BOUNCE_VELOCITY
          } else {
            player.vy = 0
            if (player.gravityInverted) {
              player.grounded = true
            }
          }
          if (tile === TrollRunTileType.FAKE_SOLID && player.gravityInverted) {
            result.steppedOnFake.push({ col, row })
          }
        }
      }
    }
  }
}

/**
 * Pushes the runner out of a solid entity along whichever side they are least deep into, which is
 * the side they came from. Standing on one counts as ground and records the ride, so the engine can
 * carry the runner along when the entity moves next frame.
 */
function resolveSolidEntity(player: PlayerState, entity: TrollMovingEntity): void {
  const fromLeft = player.x + player.width - entity.x
  const fromRight = entity.x + entity.w - player.x
  const fromTop = player.y + player.height - entity.y
  const fromBottom = entity.y + entity.h - player.y
  const shallowest = Math.min(fromLeft, fromRight, fromTop, fromBottom)

  if (shallowest === fromTop) {
    player.y = entity.y - player.height
    if (player.vy > 0) player.vy = 0
    if (!player.gravityInverted) {
      player.grounded = true
      player.ridingEntityId = entity.id
    }
    return
  }

  if (shallowest === fromBottom) {
    player.y = entity.y + entity.h
    if (player.vy < 0) player.vy = 0
    if (player.gravityInverted) {
      player.grounded = true
      player.ridingEntityId = entity.id
    }
    return
  }

  if (shallowest === fromLeft) {
    player.x = entity.x - player.width
    if (player.vx > 0) player.vx = 0
    return
  }

  player.x = entity.x + entity.w
  if (player.vx < 0) player.vx = 0
}

function isSolidTile(tile: number): boolean {
  return (
    tile === TrollRunTileType.SOLID ||
    tile === TrollRunTileType.ICE ||
    tile === TrollRunTileType.BOUNCE ||
    tile === TrollRunTileType.FAKE_SOLID
  )
}

function isSpike(tile: number): boolean {
  return (
    tile === TrollRunTileType.SPIKE_UP ||
    tile === TrollRunTileType.SPIKE_DOWN ||
    tile === TrollRunTileType.SPIKE_LEFT ||
    tile === TrollRunTileType.SPIKE_RIGHT
  )
}

function checkSpikeCollision(player: PlayerState, col: number, row: number, spikeType: number): boolean {
  const tileSize = TROLL_RUN_TILE_SIZE
  const spikeX = col * tileSize
  const spikeY = row * tileSize

  // Generous inset hitboxes for spikes so edges feel fair
  switch (spikeType) {
    case TrollRunTileType.SPIKE_UP:
      return aabbIntersect(
        player.x,
        player.y,
        player.width,
        player.height,
        spikeX + 2,
        spikeY + 6,
        tileSize - 4,
        tileSize - 6
      )
    case TrollRunTileType.SPIKE_DOWN:
      return aabbIntersect(
        player.x,
        player.y,
        player.width,
        player.height,
        spikeX + 2,
        spikeY,
        tileSize - 4,
        tileSize - 6
      )
    case TrollRunTileType.SPIKE_LEFT:
      return aabbIntersect(
        player.x,
        player.y,
        player.width,
        player.height,
        spikeX + 6,
        spikeY + 2,
        tileSize - 6,
        tileSize - 4
      )
    case TrollRunTileType.SPIKE_RIGHT:
      return aabbIntersect(
        player.x,
        player.y,
        player.width,
        player.height,
        spikeX,
        spikeY + 2,
        tileSize - 6,
        tileSize - 4
      )
    default:
      return false
  }
}
