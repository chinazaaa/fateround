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

export interface TriggerContext {
  player: PlayerState
  tiles: number[][]
  door: { x: number; y: number }
  movingEntities: TrollMovingEntity[]
  tweens: TweenManager
  onSound?: (soundName: 'jump' | 'death' | 'clear' | 'trap' | 'coin' | 'invert') => void
}

export class TriggerManager {
  private triggers: TrollTrigger[] = []
  private firedTriggerIds = new Set<string>()

  public setTriggers(triggers: TrollTrigger[]): void {
    this.triggers = triggers.map((t, i) => ({
      ...t,
      id: t.id || `trig_${i}`,
    }))
    this.firedTriggerIds.clear()
  }

  public reset(): void {
    this.firedTriggerIds.clear()
  }

  public evaluate(context: TriggerContext, event?: 'land_on' | 'jump_near' | 'collect_coin'): void {
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
      } else if (trigger.condition === 'collect_coin' && event === 'collect_coin') {
        shouldFire = true
      } else if (trigger.condition === 'land_on' && event === 'land_on' && playerInZone) {
        shouldFire = true
      } else if (trigger.condition === 'jump_near' && event === 'jump_near' && playerInZone) {
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
          const delay = action.delay ?? 0
          if (delay > 0) {
            setTimeout(() => {
              for (const [c, r] of action.tiles) {
                if (tiles[r] && tiles[r][c] !== undefined) {
                  tiles[r][c] = TrollRunTileType.EMPTY
                }
              }
            }, delay * 1000)
          } else {
            for (const [c, r] of action.tiles) {
              if (tiles[r] && tiles[r][c] !== undefined) {
                tiles[r][c] = TrollRunTileType.EMPTY
              }
            }
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

          const delay = action.delay ?? 0
          if (delay > 0) {
            setTimeout(() => {
              for (const [c, r] of action.positions) {
                if (tiles[r] && tiles[r][c] !== undefined) {
                  tiles[r][c] = spikeType
                }
              }
            }, delay * 1000)
          } else {
            for (const [c, r] of action.positions) {
              if (tiles[r] && tiles[r][c] !== undefined) {
                tiles[r][c] = spikeType
              }
            }
          }
          break
        }

        case 'move_door': {
          const duration = action.duration ?? 0.35
          const easing = (action.easing as any) ?? 'easeOutQuad'
          tweens.add(door, 'x', action.to.x, duration, easing)
          tweens.add(door, 'y', action.to.y, duration, easing)
          break
        }

        case 'door_runs_away': {
          const duration = action.duration ?? 0.3
          const dx = action.direction === 'right' ? action.distance : action.direction === 'left' ? -action.distance : 0
          const dy = action.direction === 'down' ? action.distance : action.direction === 'up' ? -action.distance : 0
          tweens.add(door, 'x', door.x + dx, duration, 'easeOutQuad')
          tweens.add(door, 'y', door.y + dy, duration, 'easeOutQuad')
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
          for (const [c, r] of action.tiles) {
            if (tiles[r] && tiles[r][c] !== undefined) {
              tiles[r][c] = TrollRunTileType.ICE
            }
          }
          break
        }

        case 'move_wall': {
          const entity = movingEntities.find((e) => e.id === action.id)
          if (entity) {
            const dist = Math.hypot(action.to.x - entity.x, action.to.y - entity.y)
            const duration = Math.max(0.1, dist / (action.speed || 100))
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
