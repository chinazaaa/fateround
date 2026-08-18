/**
 * Main Troll Run Game Engine.
 * Supports physics, triggers, audio, particles, and real-time multiplayer ghost runners.
 */

import {
  getPlayerGhostColor,
  TROLL_RUN_PHYSICS,
  type EngineCallbacks,
  type GhostPositionPayload,
  type GhostRunner,
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

  // Multiplayer Ghosts
  private ghosts: Map<string, GhostRunner> = new Map()
  private playerId = ''
  private playerName = ''
  private positionEmitTimer = 0

  private running = false
  private animFrameId: number | null = null
  private lastTime = 0

  private levelDeaths = 0
  private totalDeaths = 0
  private levelStartTime = 0
  private totalTimeElapsed = 0

  private respawnPending = false
  private respawnTimeout: ReturnType<typeof setTimeout> | null = null

  private callbacks: EngineCallbacks = {}

  constructor(levels: TrollRunLevel[] = [], callbacks: EngineCallbacks = {}) {
    this.levels = levels
    this.callbacks = callbacks
  }

  public setPlayerIdentity(playerId: string, playerName: string): void {
    this.playerId = playerId
    this.playerName = playerName
  }

  public setGhostPosition(payload: GhostPositionPayload & { color?: string }): void {
    if (!payload.playerId || payload.playerId === this.playerId) return

    const existing = this.ghosts.get(payload.playerId)
    const color = payload.color || getPlayerGhostColor(payload.playerId)

    if (!existing) {
      this.ghosts.set(payload.playerId, {
        playerId: payload.playerId,
        playerName: payload.playerName,
        color,
        levelIndex: payload.levelIndex,
        x: payload.x,
        y: payload.y,
        targetX: payload.x,
        targetY: payload.y,
        vx: payload.vx,
        vy: payload.vy,
        facing: payload.facing,
        alive: payload.alive,
        lastUpdate: Date.now(),
      })
    } else {
      existing.playerName = payload.playerName || existing.playerName
      existing.levelIndex = payload.levelIndex
      existing.targetX = payload.x
      existing.targetY = payload.y
      existing.vx = payload.vx
      existing.vy = payload.vy
      existing.facing = payload.facing
      existing.alive = payload.alive
      existing.lastUpdate = Date.now()
    }
  }

  public removeGhost(playerId: string): void {
    this.ghosts.delete(playerId)
  }

  public clearGhosts(): void {
    this.ghosts.clear()
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
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    if (this.respawnTimeout) {
      clearTimeout(this.respawnTimeout)
      this.respawnTimeout = null
    }
  }

  public setTheme(themeName: 'dark' | 'retro' | 'neon'): void {
    this.renderer.setTheme(themeName)
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted)
  }

  public setVirtualInput(control: 'left' | 'right' | 'jump', active: boolean): void {
    this.input.setVirtualInput(control, active)
  }

  public loadLevel(index: number): void {
    if (index < 0 || index >= this.levels.length) return

    this.currentLevelIndex = index
    this.activeLevel = this.levels[index]
    this.levelDeaths = 0
    this.levelStartTime = performance.now()

    // Deep clone level state
    this.activeTiles = this.activeLevel.tiles.map((row) => [...row])
    this.activeDoor = { ...this.activeLevel.door }
    this.activeEntities = (this.activeLevel.movingEntities || []).map((e) => ({ ...e }))

    this.tweens.clear()
    this.particles.clear()
    this.triggers.reset()

    this.respawnPlayer()
  }

  private respawnPlayer(): void {
    if (!this.activeLevel) return
    this.player = createInitialPlayerState(this.activeLevel.spawn)
    this.respawnPending = false
  }

  public restartCurrentLevel(): void {
    if (!this.activeLevel) return
    this.loadLevel(this.currentLevelIndex)
  }

  public nextLevel(): void {
    if (this.currentLevelIndex + 1 < this.levels.length) {
      this.loadLevel(this.currentLevelIndex + 1)
    } else {
      // Completed all levels in world
      this.stop()
      if (this.callbacks.onAllLevelsCleared) {
        this.callbacks.onAllLevelsCleared(this.totalTimeElapsed, this.totalDeaths)
      }
    }
  }

  private triggerDeath(): void {
    if (!this.player.alive || this.respawnPending) return

    this.player.alive = false
    this.respawnPending = true
    this.levelDeaths++
    this.totalDeaths++

    this.audio.playDeath()
    this.particles.emitDeathPoof(
      this.player.x + this.player.width / 2,
      this.player.y + this.player.height / 2,
      '#ffffff'
    )

    if (this.callbacks.onDeath && this.activeLevel) {
      this.callbacks.onDeath(this.activeLevel.id, this.levelDeaths)
    }

    this.respawnTimeout = setTimeout(() => {
      if (this.running) {
        this.loadLevel(this.currentLevelIndex)
      }
    }, TROLL_RUN_PHYSICS.RESPAWN_DELAY_MS)
  }

  private triggerLevelClear(): void {
    if (!this.player.alive) return

    this.audio.playClear()
    const clearTimeMs = performance.now() - this.levelStartTime
    this.totalTimeElapsed += clearTimeMs

    this.particles.emitDoorSparkles(this.activeDoor.x + 7, this.activeDoor.y + 10)

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

    // Update & Interpolate Ghosts
    const now = Date.now()
    for (const [id, ghost] of this.ghosts.entries()) {
      if (now - ghost.lastUpdate > 4000) {
        this.ghosts.delete(id)
        continue
      }
      ghost.x += (ghost.targetX - ghost.x) * Math.min(1, dt * 15)
      ghost.y += (ghost.targetY - ghost.y) * Math.min(1, dt * 15)
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

    // Emit Realtime Position for other players
    this.positionEmitTimer += dt
    if (this.positionEmitTimer >= 0.05) {
      // 20Hz update
      this.positionEmitTimer = 0
      if (this.callbacks.onPlayerPosition && this.playerId) {
        this.callbacks.onPlayerPosition({
          playerId: this.playerId,
          playerName: this.playerName,
          levelIndex: this.currentLevelIndex,
          x: this.player.x,
          y: this.player.y,
          vx: this.player.vx,
          vy: this.player.vy,
          facing: this.player.facing,
          alive: this.player.alive,
        })
      }
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

    // Filter ghosts to only those on the same level as the player
    const currentGhosts = Array.from(this.ghosts.values()).filter((g) => g.levelIndex === this.currentLevelIndex)

    this.renderer.render(
      this.ctx,
      renderLevel,
      this.player,
      this.particles,
      this.activeEntities,
      this.activeLevel.name,
      currentGhosts
    )
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
    this.ghosts.clear()
  }
}
