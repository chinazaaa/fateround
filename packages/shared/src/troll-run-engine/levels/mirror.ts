/**
 * Horizontal mirror of an authored level.
 *
 * Reflecting a level a player already knows makes them read the room again instead of replaying a
 * memorised sequence of inputs, and it costs nothing in fairness: the physics has no handedness —
 * one MOVE_SPEED for both directions, symmetric spike hitboxes, a vertical bounce — so a mirrored
 * level is exactly as hard as the original. That is why this transform needs no solvability check.
 */

import {
  TROLL_RUN_DOOR_WIDTH,
  TROLL_RUN_GRID_COLS,
  TROLL_RUN_INTERNAL_WIDTH,
  TROLL_RUN_PHYSICS,
  TrollRunTileType,
  type TrollAction,
  type TrollMovingEntity,
  type TrollRunLevel,
  type TrollTrigger,
} from '../types'

/** `spawn_entity` builds a fixed 14x14 box (triggers.ts), so that is the width to reflect around. */
const SPAWNED_ENTITY_SIZE = 14

/** Mirrors the left edge of something `size` wide, keeping it in the same place on the far side. */
function mirrorSpan(x: number, size: number): number {
  return TROLL_RUN_INTERNAL_WIDTH - x - size
}

function mirrorColumn(col: number): number {
  return TROLL_RUN_GRID_COLS - 1 - col
}

function mirrorCell(cell: [number, number]): [number, number] {
  return [mirrorColumn(cell[0]), cell[1]]
}

/** Left and right swap; up and down are unaffected by a horizontal flip. */
function mirrorDirection<TDirection extends 'left' | 'right' | 'up' | 'down'>(direction: TDirection): TDirection {
  if (direction === 'left') return 'right' as TDirection
  if (direction === 'right') return 'left' as TDirection
  return direction
}

function mirrorTile(tile: number): number {
  if (tile === TrollRunTileType.SPIKE_LEFT) return TrollRunTileType.SPIKE_RIGHT
  if (tile === TrollRunTileType.SPIKE_RIGHT) return TrollRunTileType.SPIKE_LEFT
  return tile
}

function mirrorAction(action: TrollAction, movingEntities: readonly TrollMovingEntity[]): TrollAction {
  switch (action.type) {
    case 'collapse_tiles':
      return { ...action, tiles: action.tiles.map(mirrorCell) }

    case 'ice_floor':
      return { ...action, tiles: action.tiles.map(mirrorCell) }

    case 'spawn_spikes':
      return {
        ...action,
        positions: action.positions.map(mirrorCell),
        direction: mirrorDirection(action.direction),
      }

    case 'move_door':
      return { ...action, to: { x: mirrorSpan(action.to.x, TROLL_RUN_DOOR_WIDTH), y: action.to.y } }

    case 'door_runs_away':
      return { ...action, direction: mirrorDirection(action.direction) }

    case 'move_wall': {
      // The wall's own width decides where its left edge lands. An id with no entity behind it is a
      // no-op in TriggerManager either way, so reflecting it as a point keeps that no-op intact.
      const wallWidth = movingEntities.find((entity) => entity.id === action.id)?.w ?? 0
      return { ...action, to: { x: mirrorSpan(action.to.x, wallWidth), y: action.to.y } }
    }

    case 'spawn_entity':
      return {
        ...action,
        position: { x: mirrorSpan(action.position.x, SPAWNED_ENTITY_SIZE), y: action.position.y },
        velocity: action.velocity ? { x: -action.velocity.x, y: action.velocity.y } : undefined,
      }

    // Nothing about these has a side to it: they flip the controls, flip gravity, or make the door
    // a liar.
    case 'fake_door':
    case 'invert_controls':
    case 'flip_gravity':
      return { ...action }
  }
}

function mirrorTrigger(trigger: TrollTrigger, movingEntities: readonly TrollMovingEntity[]): TrollTrigger {
  return {
    ...trigger,
    zone: { ...trigger.zone, x: mirrorSpan(trigger.zone.x, trigger.zone.w) },
    actions: trigger.actions.map((action) => mirrorAction(action, movingEntities)),
  }
}

function mirrorEntity(entity: TrollMovingEntity): TrollMovingEntity {
  return {
    ...entity,
    x: mirrorSpan(entity.x, entity.w),
    vx: entity.vx === undefined ? undefined : -entity.vx,
  }
}

/**
 * Returns a mirrored copy of `level` under a new id. The original is left untouched — the authored
 * levels are module-level singletons shared by every session, so nothing here may mutate them.
 */
export function mirrorTrollRunLevel(level: TrollRunLevel, id: string): TrollRunLevel {
  const movingEntities = level.movingEntities ?? []

  return {
    ...level,
    id,
    spawn: { ...level.spawn, x: mirrorSpan(level.spawn.x, TROLL_RUN_PHYSICS.PLAYER_WIDTH) },
    door: { ...level.door, x: mirrorSpan(level.door.x, TROLL_RUN_DOOR_WIDTH) },
    tiles: level.tiles.map((row) => [...row].reverse().map(mirrorTile)),
    triggers: level.triggers.map((trigger) => mirrorTrigger(trigger, movingEntities)),
    movingEntities: level.movingEntities ? level.movingEntities.map(mirrorEntity) : undefined,
  }
}
