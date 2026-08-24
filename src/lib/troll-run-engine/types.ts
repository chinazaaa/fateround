/**
 * Troll Run Engine — Internal runtime types.
 */

export * from '@/lib/troll-run-types'

import type { TrollMovingEntity, TrollRunDoorState, TrollRunLevel } from '@/lib/troll-run-types'

export interface InputState {
  left: boolean
  right: boolean
  jump: boolean
  jumpPressed: boolean // true on the exact frame pressed
  jumpReleased: boolean // true on the exact frame released
}

export interface PlayerState {
  x: number
  y: number
  vx: number
  vy: number
  width: number
  height: number
  grounded: boolean
  onIce: boolean
  facing: 'left' | 'right'
  alive: boolean
  coyoteTimer: number
  jumpBufferTimer: number
  jumping: boolean
  invertedControlsTimer: number
  gravityInverted: boolean
  /**
   * 0 while the runner is playing, then 0→1 as they step into the door they just touched. The
   * renderer uses it to draw them behind the door leaf and fade them out.
   */
  doorEntryProgress: number
  /**
   * The solid entity the runner is standing on, so the engine can carry them when it moves.
   * Recomputed every frame by the physics step, exactly like `grounded`.
   */
  ridingEntityId: string | null
}

/**
 * The level as the running game draws it: authored geometry with the live tile grid and the live
 * door. A plain `TrollRunLevel` satisfies it, so authored levels still render untouched.
 */
export interface TrollRunRenderLevel extends Omit<TrollRunLevel, 'door'> {
  door: TrollRunDoorState
}

export interface GhostRunner {
  playerId: string
  playerName: string
  color: string
  levelIndex: number
  x: number
  y: number
  targetX: number
  targetY: number
  vx: number
  vy: number
  facing: 'left' | 'right'
  alive: boolean
  lastUpdate: number
}

/**
 * A spot where a runner died, left on screen so everyone watches the same trap collect its victims.
 * Costs no extra network traffic: deaths are read off the `alive` flag the position broadcast
 * already carries.
 */
export interface TrollRunDeathMark {
  x: number
  y: number
  color: string
  levelIndex: number
  /** Seconds since the death, used for the fade-out. */
  age: number
}

export interface GhostPositionPayload {
  playerId: string
  playerName: string
  levelIndex: number
  x: number
  y: number
  vx: number
  vy: number
  facing: 'left' | 'right'
  alive: boolean
}

export const GHOST_COLORS = [
  '#38bdf8', // sky cyan
  '#f43f5e', // vibrant rose
  '#a855f7', // purple
  '#22c55e', // emerald
  '#fbbf24', // amber yellow
  '#f97316', // orange
  '#06b6d4', // cyan teal
  '#ec4899', // hot pink
] as const

export function getPlayerGhostColor(playerId: string): string {
  let hash = 0
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash << 5) - hash + playerId.charCodeAt(i)
    hash |= 0
  }
  const idx = Math.abs(hash) % GHOST_COLORS.length
  return GHOST_COLORS[idx]
}

/**
 * Whether a pulsing hazard is live this instant. Entities with no `pulse` are always live; a pulsing
 * one starts in its off phase, so the very first thing a runner meets is the gap rather than the beam.
 */
export function trollEntityIsActive(entity: TrollMovingEntity): boolean {
  const pulse = entity.pulse
  if (!pulse) return true

  const period = pulse.onSeconds + pulse.offSeconds
  if (period <= 0) return true

  const elapsed = (entity.pulseElapsed ?? 0) + (pulse.phaseSeconds ?? 0)
  return elapsed % period >= pulse.offSeconds
}

export interface ActiveTween {
  id: string
  target: any
  property: string
  from: number
  to: number
  duration: number
  elapsed: number
  easing: (t: number) => number
  onComplete?: () => void
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

/**
 * Engine state the surrounding DOM renders on the player's behalf: the level identity plate and
 * the active trap warnings. These used to be drawn into the 320×180 buffer, where an 8px font
 * upscaled to an unreadable smear; as DOM they stay crisp and can be read by screen readers.
 */
export interface TrollRunHudState {
  levelIndex: number
  levelName: string
  controlsInverted: boolean
  gravityInverted: boolean
}

export interface EngineCallbacks {
  onDeath?: (levelId: string, levelName: string, deathCount: number) => void
  onLevelClear?: (levelId: string, levelName: string, timeMs: number, deathCount: number) => void
  onAllLevelsCleared?: (totalTimeMs: number, totalDeaths: number) => void
  onSound?: (soundName: 'jump' | 'death' | 'clear' | 'trap' | 'coin' | 'invert') => void
  onPlayerPosition?: (pos: GhostPositionPayload) => void
  /** Fired only when a field actually changes, so the DOM overlay does not re-render at 60fps. */
  onHudChange?: (hud: TrollRunHudState) => void
}
