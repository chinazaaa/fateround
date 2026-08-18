/**
 * Physics simulation and AABB collision resolution for Troll Run.
 */

import { TROLL_RUN_PHYSICS, TROLL_RUN_TILE_SIZE, TrollRunTileType, type TrollMovingEntity } from './types'
import type { InputState, PlayerState } from './types'

export interface CollisionResult {
  hitSpike: boolean
  collectedCoin: boolean
  reachedDoor: boolean
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
  door: { x: number; y: number },
  movingEntities: TrollMovingEntity[] = []
): CollisionResult {
  const result: CollisionResult = {
    hitSpike: false,
    collectedCoin: false,
    reachedDoor: false,
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
  const grav = player.gravityInverted ? -TROLL_RUN_PHYSICS.GRAVITY : TROLL_RUN_PHYSICS.GRAVITY
  player.vy += grav * dt

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
  resolveTileCollisionsY(player, tiles, result)

  // Moving Entity Collisions (crushers, buzzsaws, moving platforms)
  for (const entity of movingEntities) {
    if (aabbIntersect(player.x, player.y, player.width, player.height, entity.x, entity.y, entity.w, entity.h)) {
      if (entity.killsOnTouch) {
        result.hitSpike = true
      }
    }
  }

  // Door Collision (Door size is 16x20)
  if (aabbIntersect(player.x, player.y, player.width, player.height, door.x, door.y, 16, 20)) {
    result.reachedDoor = true
  }

  // Out of bounds death
  if (player.y > 220 || player.y < -40 || player.x < -20 || player.x > 340) {
    result.hitSpike = true
  }

  return result
}

function resolveTileCollisionsX(player: PlayerState, tiles: number[][], result: CollisionResult): void {
  const startCol = Math.floor(player.x / TROLL_RUN_TILE_SIZE)
  const endCol = Math.floor((player.x + player.width - 0.01) / TROLL_RUN_TILE_SIZE)
  const startRow = Math.floor(player.y / TROLL_RUN_TILE_SIZE)
  const endRow = Math.floor((player.y + player.height - 0.01) / TROLL_RUN_TILE_SIZE)

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      if (r < 0 || r >= tiles.length || c < 0 || c >= (tiles[0]?.length ?? 0)) continue
      const tile = tiles[r][c]

      if (isSpike(tile)) {
        if (checkSpikeCollision(player, c, r, tile)) {
          result.hitSpike = true
        }
      } else if (tile === TrollRunTileType.COIN) {
        result.collectedCoin = true
        tiles[r][c] = TrollRunTileType.EMPTY
      } else if (tile === TrollRunTileType.FAKE_SOLID) {
        result.steppedOnFake.push({ col: c, row: r })
      } else if (tile === TrollRunTileType.SOLID || tile === TrollRunTileType.ICE) {
        if (player.vx > 0) {
          player.x = c * TROLL_RUN_TILE_SIZE - player.width
          player.vx = 0
        } else if (player.vx < 0) {
          player.x = (c + 1) * TROLL_RUN_TILE_SIZE
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

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      if (r < 0 || r >= tiles.length || c < 0 || c >= (tiles[0]?.length ?? 0)) continue
      const tile = tiles[r][c]

      if (isSpike(tile)) {
        if (checkSpikeCollision(player, c, r, tile)) {
          result.hitSpike = true
        }
      } else if (tile === TrollRunTileType.COIN) {
        result.collectedCoin = true
        tiles[r][c] = TrollRunTileType.EMPTY
      } else if (tile === TrollRunTileType.FAKE_SOLID) {
        result.steppedOnFake.push({ col: c, row: r })
      } else if (tile === TrollRunTileType.SOLID || tile === TrollRunTileType.ICE || tile === TrollRunTileType.BOUNCE) {
        if (player.vy > 0) {
          player.y = r * TROLL_RUN_TILE_SIZE - player.height
          if (tile === TrollRunTileType.BOUNCE) {
            player.vy = -450 // super bounce
          } else {
            player.vy = 0
            player.grounded = !player.gravityInverted
          }
          if (tile === TrollRunTileType.ICE) {
            player.onIce = true
          }
        } else if (player.vy < 0) {
          player.y = (r + 1) * TROLL_RUN_TILE_SIZE
          player.vy = 0
          if (player.gravityInverted) {
            player.grounded = true
          }
        }
      }
    }
  }
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
  const ts = TROLL_RUN_TILE_SIZE
  const sx = col * ts
  const sy = row * ts

  // Generous inset hitboxes for spikes so edges feel fair
  switch (spikeType) {
    case TrollRunTileType.SPIKE_UP:
      return aabbIntersect(player.x, player.y, player.width, player.height, sx + 2, sy + 6, ts - 4, ts - 6)
    case TrollRunTileType.SPIKE_DOWN:
      return aabbIntersect(player.x, player.y, player.width, player.height, sx + 2, sy, ts - 4, ts - 6)
    case TrollRunTileType.SPIKE_LEFT:
      return aabbIntersect(player.x, player.y, player.width, player.height, sx + 6, sy + 2, ts - 6, ts - 4)
    case TrollRunTileType.SPIKE_RIGHT:
      return aabbIntersect(player.x, player.y, player.width, player.height, sx, sy + 2, ts - 6, ts - 4)
    default:
      return false
  }
}
