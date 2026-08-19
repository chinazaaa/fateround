/**
 * Trigger Evaluation and Trap Action Dispatcher for Troll Run.
 */

import {
  TrollRunTileType,
  type PlayerState,
  type TrollAction,
  type TrollMovingEntity,
  type TrollTrigger,
} from './types'
import { aabbIntersect } from './physics'
import type { TweenManager } from './tweens'

/** Maps the level-data easing names onto the easing curves the tween manager implements. */
function resolveEasingName(
  easing: 'linear' | 'elastic' | 'bounce' | 'snap' | undefined
): 'linear' | 'easeOutElastic' | 'easeOutBounce' | 'snap' | 'easeOutQuad' {
  switch (easing) {
    case 'linear':
      return 'linear'
    case 'elastic':
      return 'easeOutElastic'
    case 'bounce':
      return 'easeOutBounce'
    case 'snap':
      return 'snap'
    default:
      return 'easeOutQuad'
  }
}

export interface TriggerContext {
  player: PlayerState
  tiles: number[][]
  door: { x: number; y: number }
  movingEntities: TrollMovingEntity[]
  tweens: TweenManager
  onSound?: (soundName: 'jump' | 'death' | 'clear' | 'trap' | 'coin' | 'invert') => void
}

/** The player events a trigger condition can wait for, as observed by the engine on a single frame. */
export type TrollRunFrameEvent = 'land_on' | 'jump_near' | 'collect_coin'

export class TriggerManager {
  private triggers: TrollTrigger[] = []
  private firedTriggerIds = new Set<string>()
  private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>()

  public setTriggers(triggers: TrollTrigger[]): void {
    this.triggers = triggers.map((trigger, index) => ({
      ...trigger,
      id: trigger.id || `trig_${index}`,
    }))
    this.reset()
  }

  public reset(): void {
    this.firedTriggerIds.clear()
    for (const timeout of this.pendingTimeouts) {
      clearTimeout(timeout)
    }
    this.pendingTimeouts.clear()
  }

  /** Runs a delayed trap effect, keeping the handle so a level reload can cancel it. */
  private schedule(delaySeconds: number, effect: () => void): void {
    const timeout = setTimeout(() => {
      this.pendingTimeouts.delete(timeout)
      effect()
    }, delaySeconds * 1000)
    this.pendingTimeouts.add(timeout)
  }

  /**
   * `frameEvents` carries everything that happened to the player on this frame. It is a list rather
   * than a single value because one frame can be several events at once — a jump that also grabs a
   * coin — and a trigger keyed on the quieter of the two would otherwise never fire.
   */
  public evaluate(context: TriggerContext, frameEvents: readonly TrollRunFrameEvent[] = []): void {
    const { player } = context

    for (const trigger of this.triggers) {
      const id = trigger.id!
      if (trigger.oneShot !== false && this.firedTriggerIds.has(id)) {
        continue
      }

      const playerInZone = aabbIntersect(
        player.x,
        player.y,
        player.width,
        player.height,
        trigger.zone.x,
        trigger.zone.y,
        trigger.zone.w,
        trigger.zone.h
      )

      let shouldFire = false

      if (trigger.condition === 'enter' && playerInZone) {
        shouldFire = true
      } else if (trigger.condition === 'collect_coin' && frameEvents.includes('collect_coin')) {
        shouldFire = true
      } else if (trigger.condition === 'land_on' && frameEvents.includes('land_on') && playerInZone) {
        shouldFire = true
      } else if (trigger.condition === 'jump_near' && frameEvents.includes('jump_near') && playerInZone) {
        shouldFire = true
      }

      if (shouldFire) {
        this.firedTriggerIds.add(id)
        this.executeActions(trigger.actions, context)
      }
    }
  }

  private executeActions(actions: TrollAction[], context: TriggerContext): void {
    const { player, tiles, door, movingEntities, tweens, onSound } = context

    if (onSound && actions.length > 0) {
      onSound('trap')
    }

    for (const action of actions) {
      switch (action.type) {
        case 'collapse_tiles': {
          const collapse = () => {
            for (const [col, row] of action.tiles) {
              if (tiles[row] && tiles[row][col] !== undefined) {
                tiles[row][col] = TrollRunTileType.EMPTY
              }
            }
          }
          const delay = action.delay ?? 0
          if (delay > 0) {
            this.schedule(delay, collapse)
          } else {
            collapse()
          }
          break
        }

        case 'spawn_spikes': {
          const spikeType =
            action.direction === 'up'
              ? TrollRunTileType.SPIKE_UP
              : action.direction === 'down'
                ? TrollRunTileType.SPIKE_DOWN
                : action.direction === 'left'
                  ? TrollRunTileType.SPIKE_LEFT
                  : TrollRunTileType.SPIKE_RIGHT

          const spawn = () => {
            for (const [col, row] of action.positions) {
              if (tiles[row] && tiles[row][col] !== undefined) {
                tiles[row][col] = spikeType
              }
            }
          }
          const delay = action.delay ?? 0
          if (delay > 0) {
            this.schedule(delay, spawn)
          } else {
            spawn()
          }
          break
        }

        case 'move_door': {
          const duration = action.duration ?? 0.35
          const easing = resolveEasingName(action.easing)
          tweens.add(door, 'x', action.to.x, duration, easing)
          tweens.add(door, 'y', action.to.y, duration, easing)
          break
        }

        case 'door_runs_away': {
          const duration = action.duration ?? 0.3
          const deltaX =
            action.direction === 'right' ? action.distance : action.direction === 'left' ? -action.distance : 0
          const deltaY =
            action.direction === 'down' ? action.distance : action.direction === 'up' ? -action.distance : 0
          tweens.add(door, 'x', door.x + deltaX, duration, 'easeOutQuad')
          tweens.add(door, 'y', door.y + deltaY, duration, 'easeOutQuad')
          break
        }

        case 'invert_controls': {
          player.invertedControlsTimer = action.duration
          if (onSound) onSound('invert')
          break
        }

        case 'flip_gravity': {
          player.gravityInverted = !player.gravityInverted
          player.vy = 0
          break
        }

        case 'ice_floor': {
          for (const [col, row] of action.tiles) {
            if (tiles[row] && tiles[row][col] !== undefined) {
              tiles[row][col] = TrollRunTileType.ICE
            }
          }
          break
        }

        case 'move_wall': {
          const entity = movingEntities.find((candidate) => candidate.id === action.id)
          if (entity) {
            const distance = Math.hypot(action.to.x - entity.x, action.to.y - entity.y)
            const duration = Math.max(0.1, distance / (action.speed || 100))
            tweens.add(entity, 'x', action.to.x, duration, 'easeInOutQuad')
            tweens.add(entity, 'y', action.to.y, duration, 'easeInOutQuad')
          }
          break
        }

        case 'spawn_entity': {
          movingEntities.push({
            id: `spawned_${Date.now()}_${Math.random()}`,
            x: action.position.x,
            y: action.position.y,
            w: 14,
            h: 14,
            type: action.entityType,
            killsOnTouch: true,
            vx: action.velocity?.x ?? 0,
            vy: action.velocity?.y ?? 0,
          })
          break
        }
      }
    }
  }
}
