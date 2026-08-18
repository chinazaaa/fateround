/**
 * Troll Run — Shared types, constants, and physics definitions.
 */

export const TROLL_RUN_TILE_SIZE = 16
export const TROLL_RUN_INTERNAL_WIDTH = 320
export const TROLL_RUN_INTERNAL_HEIGHT = 180
export const TROLL_RUN_GRID_COLS = 20 // 320 / 16
export const TROLL_RUN_GRID_ROWS = 12 // 180 ~ 192 (180 visible viewport, 11.25 -> 12 rows max)

export const TROLL_RUN_PHYSICS = {
  GRAVITY: 980, // pixels/s²
  MAX_FALL_SPEED: 550, // pixels/s
  MOVE_SPEED: 160, // pixels/s (snappy arcade response)
  JUMP_VELOCITY: -320, // pixels/s (upward)
  JUMP_CUT_MULTIPLIER: 0.45, // short tap vs full hold
  COYOTE_TIME: 0.08, // seconds grace after walking off edge
  JUMP_BUFFER: 0.1, // seconds pre-land jump queue
  PLAYER_WIDTH: 12, // pixels hitbox
  PLAYER_HEIGHT: 14, // pixels hitbox
  RESPAWN_DELAY_MS: 150, // instant comedic respawn
} as const

export const enum TrollRunTileType {
  EMPTY = 0,
  SOLID = 1,
  FAKE_SOLID = 2,
  SPIKE_UP = 3,
  SPIKE_DOWN = 4,
  SPIKE_LEFT = 5,
  SPIKE_RIGHT = 6,
  ICE = 7,
  BOUNCE = 8,
  COIN = 9,
}

export type TrollTriggerCondition = 'enter' | 'exit' | 'jump_near' | 'land_on' | 'collect_coin'

export type TrollAction =
  | { type: 'collapse_tiles'; tiles: [number, number][]; delay?: number }
  | { type: 'spawn_spikes'; positions: [number, number][]; direction: 'up' | 'down' | 'left' | 'right'; delay?: number }
  | {
      type: 'move_door'
      to: { x: number; y: number }
      easing?: 'linear' | 'elastic' | 'bounce' | 'snap'
      duration?: number
    }
  | { type: 'door_runs_away'; direction: 'left' | 'right' | 'up' | 'down'; distance: number; duration?: number }
  | { type: 'fake_door' } // turns door into spikes when touched
  | { type: 'move_wall'; id: string; to: { x: number; y: number }; speed: number }
  | { type: 'invert_controls'; duration: number }
  | { type: 'flip_gravity'; duration?: number }
  | { type: 'ice_floor'; tiles: [number, number][] }
  | {
      type: 'spawn_entity'
      entityType: 'buzzsaw' | 'falling_block' | 'bullet'
      position: { x: number; y: number }
      velocity?: { x: number; y: number }
    }

export interface TrollTrigger {
  id?: string
  zone: { x: number; y: number; w: number; h: number }
  condition: TrollTriggerCondition
  actions: TrollAction[]
  oneShot?: boolean
}

export interface TrollMovingEntity {
  id: string
  x: number
  y: number
  w: number
  h: number
  type: 'platform' | 'buzzsaw' | 'falling_block' | 'spike_wall' | 'bullet'
  solid?: boolean
  killsOnTouch?: boolean
  vx?: number
  vy?: number
}

export interface TrollRunLevel {
  id: string
  world: string
  name: string
  width: number
  height: number
  spawn: { x: number; y: number }
  door: { x: number; y: number }
  tiles: number[][]
  triggers: TrollTrigger[]
  movingEntities?: TrollMovingEntity[]
  parTime: number // in seconds
  theme?: 'dark' | 'retro' | 'neon'
}
