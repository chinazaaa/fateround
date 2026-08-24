import { describe, expect, it } from 'vitest'
import { createInitialPlayerState, aabbIntersect, updatePlayerPhysics } from './physics'
import { TROLL_RUN_PHYSICS, TrollRunTileType } from './types'

describe('Troll Run Physics Engine', () => {
  it('initializes player state correctly at spawn point', () => {
    const player = createInitialPlayerState({ x: 32, y: 120 })
    expect(player.x).toBe(32)
    expect(player.y).toBe(120)
    expect(player.vx).toBe(0)
    expect(player.vy).toBe(0)
    expect(player.alive).toBe(true)
    expect(player.grounded).toBe(false)
    expect(player.width).toBe(TROLL_RUN_PHYSICS.PLAYER_WIDTH)
    expect(player.height).toBe(TROLL_RUN_PHYSICS.PLAYER_HEIGHT)
  })

  it('computes AABB intersections accurately', () => {
    // Overlapping boxes
    expect(aabbIntersect(10, 10, 20, 20, 15, 15, 20, 20)).toBe(true)
    // Non-overlapping boxes (separated on X)
    expect(aabbIntersect(10, 10, 20, 20, 40, 10, 20, 20)).toBe(false)
    // Non-overlapping boxes (separated on Y)
    expect(aabbIntersect(10, 10, 20, 20, 10, 40, 20, 20)).toBe(false)
    // Touching edges (non-overlapping)
    expect(aabbIntersect(10, 10, 20, 20, 30, 10, 20, 20)).toBe(false)
  })

  it('moves player horizontally with snappy arcade acceleration', () => {
    const player = createInitialPlayerState({ x: 50, y: 50 })
    const tiles = [new Array(20).fill(TrollRunTileType.EMPTY)]
    const door = { x: 200, y: 50 }

    // Move right
    updatePlayerPhysics(
      player,
      { left: false, right: true, jump: false, jumpPressed: false, jumpReleased: false },
      0.016, // ~60fps frame dt
      tiles,
      door
    )
    expect(player.vx).toBe(TROLL_RUN_PHYSICS.MOVE_SPEED)
    expect(player.facing).toBe('right')
    expect(player.x).toBeGreaterThan(50)

    // Move left
    updatePlayerPhysics(
      player,
      { left: true, right: false, jump: false, jumpPressed: false, jumpReleased: false },
      0.016,
      tiles,
      door
    )
    expect(player.vx).toBe(-TROLL_RUN_PHYSICS.MOVE_SPEED)
    expect(player.facing).toBe('left')
  })

  it('applies gravity and stops on solid ground', () => {
    const player = createInitialPlayerState({ x: 50, y: 50 })
    // Create 10 rows of empty, row 5 is solid (y = 80)
    const tiles: number[][] = []
    for (let r = 0; r < 8; r++) {
      tiles.push(new Array(20).fill(r === 5 ? TrollRunTileType.SOLID : TrollRunTileType.EMPTY))
    }
    const door = { x: 200, y: 50 }

    // Step physics multiple frames until landing on ground
    for (let i = 0; i < 30; i++) {
      updatePlayerPhysics(
        player,
        { left: false, right: false, jump: false, jumpPressed: false, jumpReleased: false },
        0.016,
        tiles,
        door
      )
    }

    expect(player.grounded).toBe(true)
    expect(player.vy).toBe(0)
    expect(player.y).toBe(5 * 16 - player.height) // exactly flush on top of row 5
  })

  it('executes jump and applies coyote time / jump cut', () => {
    const player = createInitialPlayerState({ x: 50, y: 5 * 16 - 14 })
    player.grounded = true
    player.coyoteTimer = 0.08
    const tiles: number[][] = []
    for (let r = 0; r < 8; r++) {
      tiles.push(new Array(20).fill(r === 5 ? TrollRunTileType.SOLID : TrollRunTileType.EMPTY))
    }
    const door = { x: 200, y: 50 }

    // Jump pressed
    updatePlayerPhysics(
      player,
      { left: false, right: false, jump: true, jumpPressed: true, jumpReleased: false },
      0.016,
      tiles,
      door
    )

    expect(player.vy).toBeLessThan(0) // upward velocity
    expect(player.jumping).toBe(true)

    // Jump released early cuts jump velocity
    const vyBeforeCut = player.vy
    updatePlayerPhysics(
      player,
      { left: false, right: false, jump: false, jumpPressed: false, jumpReleased: true },
      0.016,
      tiles,
      door
    )
    expect(player.vy).toBeGreaterThan(vyBeforeCut) // velocity dampened
  })

  it('detects spike collision and flags hitSpike', () => {
    const player = createInitialPlayerState({ x: 16, y: 16 })
    const tiles: number[][] = [
      [TrollRunTileType.EMPTY, TrollRunTileType.EMPTY],
      [TrollRunTileType.EMPTY, TrollRunTileType.SPIKE_UP],
    ]
    const door = { x: 200, y: 50 }

    const collision = updatePlayerPhysics(
      player,
      { left: false, right: true, jump: false, jumpPressed: false, jumpReleased: false },
      0.016,
      tiles,
      door
    )

    expect(collision.hitSpike).toBe(true)
  })

  it('detects door reach and flags reachedDoor', () => {
    const player = createInitialPlayerState({ x: 100, y: 100 })
    const tiles = [new Array(20).fill(TrollRunTileType.EMPTY)]
    const door = { x: 102, y: 98 } // overlapping player

    const collision = updatePlayerPhysics(
      player,
      { left: false, right: false, jump: false, jumpPressed: false, jumpReleased: false },
      0.016,
      tiles,
      door
    )

    expect(collision.reachedDoor).toBe(true)
  })
})
