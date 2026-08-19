/**
 * Troll Run Engine — Internal runtime types.
 */

export * from '@/lib/troll-run-types'

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
