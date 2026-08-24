import { describe, expect, it } from 'vitest'
import { TriggerManager, type TriggerContext } from './triggers'
import { createInitialPlayerState } from './physics'
import { TweenManager } from './tweens'
import { TROLL_RUN_SPAWNED_ENTITY_SIZE, TrollRunTileType, type TrollMovingEntity, type TrollTrigger } from './types'

function createContext(playerX: number, playerY: number): TriggerContext {
  const tiles: number[][] = []
  for (let row = 0; row < 11; row++) {
    tiles.push(new Array(20).fill(row === 9 ? TrollRunTileType.SOLID : TrollRunTileType.EMPTY))
  }

  return {
    player: createInitialPlayerState({ x: playerX, y: playerY }),
    tiles,
    door: { x: 288, y: 124 },
    movingEntities: [] as TrollMovingEntity[],
    tweens: new TweenManager(),
  }
}

describe('Troll Run Trigger Conditions', () => {
  it('fires an exit trigger on the way out of the zone and not on the way in', () => {
    const trigger: TrollTrigger = {
      id: 'floor-behind',
      zone: { x: 48, y: 112, w: 48, h: 48 },
      condition: 'exit',
      actions: [{ type: 'collapse_tiles', tiles: [[3, 9]] }],
    }
    const manager = new TriggerManager()
    manager.setTriggers([trigger])

    const context = createContext(56, 130)
    manager.evaluate(context)
    expect(context.tiles[9][3], 'entering the zone must not collapse anything').toBe(TrollRunTileType.SOLID)

    // Still inside — the transition has not happened yet.
    context.player.x = 80
    manager.evaluate(context)
    expect(context.tiles[9][3]).toBe(TrollRunTileType.SOLID)

    context.player.x = 140
    manager.evaluate(context)
    expect(context.tiles[9][3], 'leaving the zone must drop the floor behind the runner').toBe(TrollRunTileType.EMPTY)
  })

  it('fires an exit trigger whichever way the zone is left', () => {
    const trigger: TrollTrigger = {
      id: 'no-retreat',
      zone: { x: 100, y: 112, w: 48, h: 48 },
      condition: 'exit',
      actions: [{ type: 'collapse_tiles', tiles: [[7, 9]] }],
    }
    const manager = new TriggerManager()
    manager.setTriggers([trigger])

    const context = createContext(110, 130)
    manager.evaluate(context)

    // Backing off costs the same floor that pressing on would have.
    context.player.x = 40
    manager.evaluate(context)
    expect(context.tiles[9][7]).toBe(TrollRunTileType.EMPTY)
  })

  it('forgets zone occupancy on reset so a retried level fires cleanly', () => {
    const trigger: TrollTrigger = {
      id: 'floor-behind',
      zone: { x: 48, y: 112, w: 48, h: 48 },
      condition: 'exit',
      actions: [{ type: 'collapse_tiles', tiles: [[3, 9]] }],
    }
    const manager = new TriggerManager()
    manager.setTriggers([trigger])

    const firstRun = createContext(56, 130)
    manager.evaluate(firstRun)
    manager.reset()

    // A runner who respawns outside the zone was never inside it, so nothing should fire.
    const secondRun = createContext(140, 130)
    manager.evaluate(secondRun)
    expect(secondRun.tiles[9][3]).toBe(TrollRunTileType.SOLID)
  })

  it('stamps the bite timer a fake_door asks for, and its own default when it asks for none', () => {
    const explicit = new TriggerManager()
    explicit.setTriggers([
      {
        id: 'toothed',
        zone: { x: 48, y: 112, w: 48, h: 48 },
        condition: 'enter',
        actions: [{ type: 'fake_door', duration: 1.6 }],
      },
    ])
    const bitten = createContext(56, 130)
    explicit.evaluate(bitten)
    expect(bitten.door.biteTimer).toBe(1.6)

    const implicit = new TriggerManager()
    implicit.setTriggers([
      {
        id: 'toothed',
        zone: { x: 48, y: 112, w: 48, h: 48 },
        condition: 'enter',
        actions: [{ type: 'fake_door' }],
      },
    ])
    const defaulted = createContext(56, 130)
    implicit.evaluate(defaulted)
    expect(defaulted.door.biteTimer).toBeGreaterThan(0)
  })
})

describe('Troll Run Spawned Entities', () => {
  it('spawns a lethal box at the default size and numbers ids reproducibly', () => {
    const manager = new TriggerManager()
    manager.setTriggers([
      {
        id: 'shot',
        zone: { x: 48, y: 112, w: 48, h: 48 },
        condition: 'enter',
        oneShot: false,
        actions: [
          {
            type: 'spawn_entity',
            entityType: 'bullet',
            position: { x: 304, y: 130 },
            velocity: { x: -150, y: 0 },
          },
        ],
      },
    ])

    const context = createContext(56, 130)
    manager.evaluate(context)
    manager.evaluate(context)

    expect(context.movingEntities).toHaveLength(2)
    expect(context.movingEntities.map((entity) => entity.id)).toEqual(['spawned_1', 'spawned_2'])

    const [first] = context.movingEntities
    expect(first.w).toBe(TROLL_RUN_SPAWNED_ENTITY_SIZE)
    expect(first.h).toBe(TROLL_RUN_SPAWNED_ENTITY_SIZE)
    expect(first.killsOnTouch).toBe(true)
    expect(first.solid).toBe(false)
    expect(first.vx).toBe(-150)
  })

  it('spawns a solid entity as footing rather than as a hazard, at the size asked for', () => {
    const manager = new TriggerManager()
    manager.setTriggers([
      {
        id: 'ferry',
        zone: { x: 48, y: 112, w: 48, h: 48 },
        condition: 'enter',
        actions: [
          {
            type: 'spawn_entity',
            entityType: 'falling_block',
            position: { x: 160, y: 144 },
            velocity: { x: -60, y: 0 },
            size: 32,
            solid: true,
          },
        ],
      },
    ])

    const context = createContext(56, 130)
    manager.evaluate(context)

    const [ferry] = context.movingEntities
    expect(ferry.w).toBe(32)
    expect(ferry.h).toBe(32)
    expect(ferry.solid).toBe(true)
    expect(ferry.killsOnTouch).toBe(false)
  })

  it('restarts the spawn counter on reset so a retried level repeats the same ids', () => {
    const manager = new TriggerManager()
    manager.setTriggers([
      {
        id: 'shot',
        zone: { x: 48, y: 112, w: 48, h: 48 },
        condition: 'enter',
        actions: [
          {
            type: 'spawn_entity',
            entityType: 'bullet',
            position: { x: 304, y: 130 },
            velocity: { x: -150, y: 0 },
          },
        ],
      },
    ])

    const firstRun = createContext(56, 130)
    manager.evaluate(firstRun)
    manager.reset()

    const secondRun = createContext(56, 130)
    manager.evaluate(secondRun)
    expect(secondRun.movingEntities.map((entity) => entity.id)).toEqual(['spawned_1'])
  })
})
