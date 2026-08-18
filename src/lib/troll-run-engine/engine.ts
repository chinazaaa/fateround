/**
 * Main Troll Run Game Engine.
 */

import {
  TROLL_RUN_PHYSICS,
  type EngineCallbacks,
  type PlayerState,
  type TrollMovingEntity,
  type TrollRunLevel,
} from './types'
import { createInitialPlayerState, updatePlayerPhysics } from './physics'
import { InputManager } from './input'
import { TweenManager } from './tweens'
import { ParticleManager } from './particles'
import { TriggerManager } from './triggers'
import { CanvasRenderer } from './renderer'
import { AudioManager } from './audio'

export class TrollRunEngine {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  private input = new InputManager()
  private tweens = new TweenManager()
  private particles = new ParticleManager()
  private triggers = new TriggerManager()
  private renderer = new CanvasRenderer()
  private audio = new AudioManager()

  private levels: TrollRunLevel[] = []
  private currentLevelIndex = 0
  private activeLevel: TrollRunLevel | null = null

  // Mutable runtime copies
  private activeTiles: number[][] = []
  private activeDoor: { x: number; y: number } = { x: 0, y: 0 }
  private activeEntities: TrollMovingEntity[] = []
  private player: PlayerState = createInitialPlayerState({ x: 0, y: 0 })

  private running = false
  private animFrameId: number | null = null
  private lastTime = 0

  private levelDeaths = 0
  private totalDeaths = 0
  private levelStartTime = 0
  private totalTimeElapsed = 0

  private respawnPending = false
  private respawnTimeout: any = null

  private callbacks: EngineCallbacks = {}

  constructor(levels: TrollRunLevel[] = [], callbacks: EngineCallbacks = {}) {
    this.levels = levels
    this.callbacks = callbacks
  }

  public attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.input.attachKeyboard()
  }

  public setLevels(levels: TrollRunLevel[]): void {
    this.levels = levels
    this.currentLevelIndex = 0
    this.totalDeaths = 0
    this.totalTimeElapsed = 0
  }

  public start(levelIndex = 0): void {
    if (this.levels.length === 0) return

    this.currentLevelIndex = Math.max(0, Math.min(levelIndex, this.levels.length - 1))
    this.running = true
    this.lastTime = performance.now()
    this.loadLevel(this.currentLevelIndex)

    const loop = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - this.lastTime) / 1000)
      this.lastTime = now

      this.update(dt)
      this.render()

      this.animFrameId = requestAnimationFrame(loop)
    }

    this.animFrameId = requestAnimationFrame(loop)
  }

  public stop(): void {
    this.running = false
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    if (this.respawnTimeout) {
      clearTimeout(this.respawnTimeout)
      this.respawnTimeout = null
    }
    this.input.reset()
  }

  public restartCurrentLevel(): void {
    this.loadLevel(this.currentLevelIndex)
  }

  public nextLevel(): void {
    if (this.currentLevelIndex < this.levels.length - 1) {
      this.currentLevelIndex++
      this.loadLevel(this.currentLevelIndex)
    } else {
      // All levels cleared
      if (this.callbacks.onAllLevelsCleared) {
        this.callbacks.onAllLevelsCleared(this.totalTimeElapsed, this.totalDeaths)
      }
    }
  }

  public setVirtualInput(control: 'left' | 'right' | 'jump', active: boolean): void {
    this.input.setVirtualInput(control, active)
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted)
  }

  public setTheme(theme: 'dark' | 'retro' | 'neon'): void {
    this.renderer.setTheme(theme)
  }

  private loadLevel(index: number): void {
    const rawLevel = this.levels[index]
    if (!rawLevel) return

    this.activeLevel = rawLevel
    this.levelDeaths = 0
    this.levelStartTime = performance.now()

    // Deep clone tiles grid so trap mutations don't dirty the original template
    this.activeTiles = rawLevel.tiles.map((row) => [...row])
    this.activeDoor = { ...rawLevel.door }
    this.activeEntities = (rawLevel.movingEntities || []).map((e) => ({ ...e }))

    this.tweens.clear()
    this.particles.clear()
    this.triggers.setTriggers(rawLevel.triggers || [])

    this.player = createInitialPlayerState(rawLevel.spawn)
    this.respawnPending = false
  }

  private resetAttempt(): void {
    if (!this.activeLevel) return

    // Re-clone tiles and reset door
    this.activeTiles = this.activeLevel.tiles.map((row) => [...row])
    this.activeDoor = { ...this.activeLevel.door }
    this.activeEntities = (this.activeLevel.movingEntities || []).map((e) => ({ ...e }))

    this.tweens.clear()
    this.triggers.reset()
    this.player = createInitialPlayerState(this.activeLevel.spawn)
    this.respawnPending = false
  }

  private triggerDeath(): void {
    if (!this.player.alive || this.respawnPending) return

    this.player.alive = false
    this.respawnPending = true
    this.levelDeaths++
    this.totalDeaths++

    this.particles.emitDeathPoof(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2)

    this.audio.playDeath()
    if (this.callbacks.onDeath && this.activeLevel) {
      this.callbacks.onDeath(this.activeLevel.id, this.levelDeaths)
    }

    this.respawnTimeout = setTimeout(() => {
      this.resetAttempt()
    }, TROLL_RUN_PHYSICS.RESPAWN_DELAY_MS)
  }

  private triggerLevelClear(): void {
    if (!this.player.alive || this.respawnPending) return

    this.player.alive = false // lock input
    this.particles.emitDoorSparkles(this.activeDoor.x + 8, this.activeDoor.y + 10)
    this.audio.playClear()

    const clearTimeMs = Math.round(performance.now() - this.levelStartTime)
    this.totalTimeElapsed += clearTimeMs

    if (this.callbacks.onLevelClear && this.activeLevel) {
      this.callbacks.onLevelClear(this.activeLevel.id, clearTimeMs, this.levelDeaths)
    }

    setTimeout(() => {
      this.nextLevel()
    }, 450)
  }

  private update(dt: number): void {
    if (!this.activeLevel) return

    const inputState = this.input.update()

    if (inputState.jumpPressed && this.player.alive && this.player.grounded) {
      this.audio.playJump()
    }

    // Update Tweens
    this.tweens.update(dt)

    // Update Particles
    this.particles.update(dt)

    // Update Moving Entities
    for (const entity of this.activeEntities) {
      if (entity.vx) entity.x += entity.vx * dt
      if (entity.vy) entity.y += entity.vy * dt
    }

    // Step Physics
    const prevGrounded = this.player.grounded
    const collision = updatePlayerPhysics(
      this.player,
      inputState,
      dt,
      this.activeTiles,
      this.activeDoor,
      this.activeEntities
    )

    // Landing Dust effect
    if (!prevGrounded && this.player.grounded && this.player.alive) {
      this.particles.emitLandingDust(this.player.x + this.player.width / 2, this.player.y + this.player.height)
    }

    // Coin collected
    if (collision.collectedCoin) {
      this.audio.playCoin()
    }

    // Handle collision flags
    if (collision.hitSpike) {
      this.triggerDeath()
      return
    }

    if (collision.reachedDoor) {
      this.triggerLevelClear()
      return
    }

    // Evaluate Triggers
    if (this.player.alive) {
      this.triggers.evaluate(
        {
          player: this.player,
          tiles: this.activeTiles,
          door: this.activeDoor,
          movingEntities: this.activeEntities,
          tweens: this.tweens,
          onSound: (sound) => {
            if (sound === 'trap') this.audio.playTrap()
          },
        },
        collision.collectedCoin ? 'collect_coin' : undefined
      )
    }
  }

  private render(): void {
    if (!this.ctx || !this.activeLevel) return

    const renderLevel: TrollRunLevel = {
      ...this.activeLevel,
      tiles: this.activeTiles,
      door: this.activeDoor,
    }

    this.renderer.render(this.ctx, renderLevel, this.player, this.particles, this.activeEntities, this.activeLevel.name)
  }

  public getCurrentStats() {
    return {
      levelIndex: this.currentLevelIndex,
      totalLevels: this.levels.length,
      levelId: this.activeLevel?.id ?? '',
      levelName: this.activeLevel?.name ?? '',
      world: this.activeLevel?.world ?? '',
      levelDeaths: this.levelDeaths,
      totalDeaths: this.totalDeaths,
      parTime: this.activeLevel?.parTime ?? 5,
    }
  }

  public destroy(): void {
    this.stop()
    this.input.destroy()
    this.particles.clear()
    this.tweens.clear()
  }
}
