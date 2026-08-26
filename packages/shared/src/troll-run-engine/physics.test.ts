import { describe, expect, it } from 'vitest'
import { advanceTrollRunEntities, aabbIntersect, createInitialPlayerState, updatePlayerPhysics } from './physics'
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

  it('treats a biting door as a hazard and as an exit again once the bite expires', () => {
    const tiles = [new Array(20).fill(TrollRunTileType.EMPTY)]
    const idle = { left: false, right: false, jump: false, jumpPressed: false, jumpReleased: false }

    const bitten = createInitialPlayerState({ x: 100, y: 100 })
    const biting = updatePlayerPhysics(bitten, idle, 0.016, tiles, { x: 102, y: 98, biteTimer: 0.4 })
    expect(biting.hitSpike).toBe(true)
    expect(biting.reachedDoor).toBe(false)

    // The engine drains the timer every frame, so the same contact is a clean exit once it hits zero.
    const patient = createInitialPlayerState({ x: 100, y: 100 })
    const expired = updatePlayerPhysics(patient, idle, 0.016, tiles, { x: 102, y: 98, biteTimer: 0 })
    expect(expired.hitSpike).toBe(false)
    expect(expired.reachedDoor).toBe(true)
  })

  it('stands the player on a solid entity and records the ride, but still kills on a lethal one', () => {
    const tiles: number[][] = []
    for (let row = 0; row < 11; row++) {
      tiles.push(new Array(20).fill(TrollRunTileType.EMPTY))
    }
    const door = { x: 300, y: 20 }
    const idle = { left: false, right: false, jump: false, jumpPressed: false, jumpReleased: false }

    const rider = createInitialPlayerState({ x: 100, y: 100 })
    const lift = { id: 'lift', x: 96, y: 120, w: 32, h: 16, type: 'platform' as const, solid: true }
    for (let frame = 0; frame < 30; frame++) {
      updatePlayerPhysics(rider, idle, 0.016, tiles, door, [lift])
    }
    expect(rider.grounded).toBe(true)
    expect(rider.y).toBe(lift.y - rider.height)
    expect(rider.ridingEntityId).toBe('lift')

    const victim = createInitialPlayerState({ x: 100, y: 100 })
    const saw = { id: 'saw', x: 98, y: 98, w: 16, h: 16, type: 'buzzsaw' as const, killsOnTouch: true }
    const mangled = updatePlayerPhysics(victim, idle, 0.016, tiles, door, [saw])
    expect(mangled.hitSpike).toBe(true)
  })

  it('blocks the player sideways against a solid entity', () => {
    const tiles: number[][] = []
    for (let row = 0; row < 11; row++) {
      tiles.push(new Array(20).fill(row === 9 ? TrollRunTileType.SOLID : TrollRunTileType.EMPTY))
    }
    const door = { x: 300, y: 20 }
    const player = createInitialPlayerState({ x: 100, y: 9 * 16 - 14 })
    const wall = { id: 'wall', x: 140, y: 112, w: 16, h: 32, type: 'spike_wall' as const, solid: true }

    for (let frame = 0; frame < 40; frame++) {
      updatePlayerPhysics(
        player,
        { left: false, right: true, jump: false, jumpPressed: false, jumpReleased: false },
        0.016,
        tiles,
        door,
        [wall]
      )
    }

    expect(player.x).toBe(wall.x - player.width)
  })
})

describe('Troll Run Machinery', () => {
  it('ping-pongs a patrolled entity between its bounds instead of flying off', () => {
    const player = createInitialPlayerState({ x: 0, y: 0 })
    const press = {
      id: 'press',
      x: 48,
      y: 120,
      w: 16,
      h: 16,
      type: 'buzzsaw' as const,
      killsOnTouch: true,
      vy: 240,
      patrol: { minY: 16, maxY: 128 },
    }
    const entities = [press]

    for (let frame = 0; frame < 200; frame++) {
      advanceTrollRunEntities(entities, player, 0.016)
      expect(press.y).toBeGreaterThanOrEqual(16)
      expect(press.y).toBeLessThanOrEqual(128)
    }

    expect(entities).toHaveLength(1)
    // Two hundred frames at 240px/s covers far more than the 112px band, so it must have turned round.
    expect(press.vy).toBeDefined()
  })

  it('carries a riding player by the entity delta and leaves other players alone', () => {
    const rider = createInitialPlayerState({ x: 112, y: 128 })
    rider.ridingEntityId = 'lift'
    const bystander = createInitialPlayerState({ x: 112, y: 128 })

    const lift = { id: 'lift', x: 112, y: 144, w: 32, h: 16, type: 'platform' as const, solid: true, vy: -45 }
    advanceTrollRunEntities([lift], rider, 0.1)
    advanceTrollRunEntities([{ ...lift, y: 144 }], bystander, 0.1)

    expect(lift.y).toBeCloseTo(139.5, 5)
    expect(rider.y).toBeCloseTo(123.5, 5)
    expect(bystander.y).toBe(128)
  })

  it('drops unbounded entities once they leave the screen so spawns do not accumulate', () => {
    const player = createInitialPlayerState({ x: 24, y: 120 })
    const entities = [
      { id: 'spawned_1', x: 304, y: 130, w: 8, h: 8, type: 'bullet' as const, killsOnTouch: true, vx: -150 },
      { id: 'spawned_2', x: 304, y: 130, w: 8, h: 8, type: 'bullet' as const, killsOnTouch: true, vx: -150 },
    ]

    // Long enough for both rounds to cross the room and clear the far margin.
    for (let frame = 0; frame < 200; frame++) {
      advanceTrollRunEntities(entities, player, 0.016)
    }

    expect(entities).toHaveLength(0)
  })

  it('lets the player stand inside a dormant pulsing hazard and kills them once it lights', () => {
    const tiles: number[][] = []
    for (let row = 0; row < 11; row++) {
      tiles.push(new Array(20).fill(row === 9 ? TrollRunTileType.SOLID : TrollRunTileType.EMPTY))
    }
    const door = { x: 300, y: 20 }
    const idle = { left: false, right: false, jump: false, jumpPressed: false, jumpReleased: false }
    const beam = {
      id: 'beam',
      x: 96,
      y: 96,
      w: 4,
      h: 48,
      type: 'laser' as const,
      killsOnTouch: true,
      pulse: { offSeconds: 1, onSeconds: 1.3 },
    }

    // Parked in the beam's footprint for the whole test, so the pulse is the only thing that changes.
    const player = createInitialPlayerState({ x: 94, y: 9 * 16 - 14 })
    expect(updatePlayerPhysics(player, idle, 0.016, tiles, door, [beam]).hitSpike).toBe(false)

    // Past the 1s gap the same contact is lethal — a stationary hazard still has to keep its clock.
    for (let frame = 0; frame < 11; frame++) advanceTrollRunEntities([beam], player, 0.1)
    expect(updatePlayerPhysics(player, idle, 0.016, tiles, door, [beam]).hitSpike).toBe(true)

    // And past the 1.3s burn it goes out again, rather than latching on for the rest of the level.
    for (let frame = 0; frame < 13; frame++) advanceTrollRunEntities([beam], player, 0.1)
    expect(updatePlayerPhysics(player, idle, 0.016, tiles, door, [beam]).hitSpike).toBe(false)
  })
})
