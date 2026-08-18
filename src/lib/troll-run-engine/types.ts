/**
 * Troll Run Engine — Internal runtime types.
 */

export * from '@/../../packages/shared/src/troll-run'

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

export interface EngineCallbacks {
  onDeath?: (levelId: string, deathCount: number) => void
  onLevelClear?: (levelId: string, timeMs: number, deathCount: number) => void
  onAllLevelsCleared?: (totalTimeMs: number, totalDeaths: number) => void
  onSound?: (soundName: 'jump' | 'death' | 'clear' | 'trap' | 'coin' | 'invert') => void
  onPlayerPosition?: (pos: GhostPositionPayload) => void
}
