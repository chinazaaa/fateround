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
}
