/**
 * Main Troll Run Game Engine.
 * Supports physics, triggers, audio, particles, and real-time multiplayer ghost runners.
 */

import {
  getPlayerGhostColor,
  TROLL_RUN_DEATH_MARK_SECONDS,
  TROLL_RUN_DOOR_HEIGHT,
  TROLL_RUN_DOOR_WIDTH,
  TROLL_RUN_PHYSICS,
  TrollRunTileType,
  type EngineCallbacks,
  type GhostPositionPayload,
  type GhostRunner,
  type PlayerState,
  type TrollMovingEntity,
  type TrollRunAudioSink,
  type TrollRunDeathMark,
  type TrollRunDoorState,
  type TrollRunHudState,
  type TrollRunLevel,
  type TrollRunRenderLevel,
  type TrollRunRenderTarget,
} from './types'
import { advanceTrollRunEntities, createInitialPlayerState, updatePlayerPhysics } from './physics'
import { InputManager } from './input'
import { TweenManager } from './tweens'
import { ParticleManager } from './particles'
import { TriggerManager, type TrollRunFrameEvent } from './triggers'

// Pause on the cleared level so the door sparkles are visible before the next one loads.
const LEVEL_CLEAR_DELAY_MS = 450

// How long the runner takes to step into the doorway. Kept well inside LEVEL_CLEAR_DELAY_MS so the
// sparkles that mark the entry land while the level is still on screen.
const DOOR_ENTRY_SECONDS = 0.28

/**
 * The simulation. Deliberately free of any DOM, canvas or Web Audio reference: the two things it
 * cannot do itself — draw a frame and make a noise — are injected as adapters, which is what lets
 * the same physics, traps and level geometry run under React Native.
 */
export class TrollRunEngine {
  private renderTarget: TrollRunRenderTarget | null = null
  private theme: 'dark' | 'retro' | 'neon' = 'dark'

  private input = new InputManager()
  private tweens = new TweenManager()
  private particles = new ParticleManager()
  private triggers = new TriggerManager()
  private audio: TrollRunAudioSink = {}

  private levels: TrollRunLevel[] = []
  private currentLevelIndex = 0
  private activeLevel: TrollRunLevel | null = null

  // Mutable runtime copies
  private activeTiles: number[][] = []
  private activeDoor: TrollRunDoorState = { x: 0, y: 0 }
  private activeEntities: TrollMovingEntity[] = []
  private player: PlayerState = createInitialPlayerState({ x: 0, y: 0 })
  // Where the runner was standing when they touched the door, so the entry animation has a start.
  private doorEntryOrigin: { x: number; y: number } = { x: 0, y: 0 }

  // Multiplayer Ghosts
  private ghosts: Map<string, GhostRunner> = new Map()
  private deathMarks: TrollRunDeathMark[] = []
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
  private levelCleared = false

  private respawnPending = false
  private respawnTimeout: ReturnType<typeof setTimeout> | null = null
  private levelAdvanceTimeout: ReturnType<typeof setTimeout> | null = null
  private pausedAt: number | null = null

  private callbacks: EngineCallbacks = {}
  private lastHudState: TrollRunHudState | null = null

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
      const levelChanged = existing.levelIndex !== payload.levelIndex
      const distanceSq = (existing.x - payload.x) ** 2 + (existing.y - payload.y) ** 2
      // The alive→dead edge is the only death signal the broadcast carries, and it is enough: leave
      // a mark where they fell so everyone else watches the same trap collect them.
      if (existing.alive && !payload.alive) {
        this.addDeathMark(payload.x, payload.y, existing.color, payload.levelIndex)
      }
      // Large displacement (respawn or teleport) or level change -> snap immediately, no backward sliding!
      if (levelChanged || distanceSq > 48 * 48 || !payload.alive) {
        existing.x = payload.x
        existing.y = payload.y
      }
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
    this.deathMarks = []
  }

  /** A body on the floor, in the runner's own ghost colour, fading out over a few seconds. */
  private addDeathMark(x: number, y: number, color: string, levelIndex: number): void {
    this.deathMarks.push({ x, y, color, levelIndex, age: 0 })
  }

  /** Hands the engine somewhere to draw. Passing `null` runs it headless (used by tests). */
  public setRenderTarget(target: TrollRunRenderTarget | null): void {
    this.renderTarget = target
    target?.setTheme?.(this.theme)
  }

  public setAudioSink(sink: TrollRunAudioSink | null): void {
    this.audio = sink ?? {}
  }

  /** Exposed so a platform wrapper can wire keyboard/gamepad input of its own. */
  public getInput(): InputManager {
    return this.input
  }

  public setLevels(levels: TrollRunLevel[]): void {
    this.levels = levels
    this.currentLevelIndex = 0
    this.totalDeaths = 0
    this.totalTimeElapsed = 0
    this.levelDeaths = 0
    this.levelCleared = false
    this.deathMarks = []
    // A new round may open on a level with the same index and name, so drop the edge-trigger
    // baseline or the overlay would keep showing the previous round's plate.
    this.lastHudState = null
  }

  public start(levelIndex = 0): void {
    if (this.levels.length === 0 || this.running) return

    this.currentLevelIndex = Math.max(0, Math.min(levelIndex, this.levels.length - 1))
    this.running = true
    this.pausedAt = null
    this.lastTime = performance.now()
    this.loadLevel(this.currentLevelIndex)

    this.runLoop()
  }

  /** Freezes simulation and rendering without discarding round progress. */
  public pause(): void {
    if (!this.running) return
    this.pausedAt = performance.now()
    this.running = false
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  /** Resumes a paused run, discounting the paused span from the level timer. */
  public resume(): void {
    if (this.running || !this.activeLevel) return
    const now = performance.now()
    if (this.pausedAt !== null) {
      this.levelStartTime += now - this.pausedAt
      this.pausedAt = null
    }
    this.running = true
    this.lastTime = now
    this.runLoop()
  }

  private runLoop(): void {
    const loop = (now: number) => {
      if (!this.running) return
      const deltaSeconds = Math.min(0.05, (now - this.lastTime) / 1000)
      this.lastTime = now

      this.update(deltaSeconds)
      this.emitHudState()
      this.render()

      this.animFrameId = requestAnimationFrame(loop)
    }

    this.animFrameId = requestAnimationFrame(loop)
  }

  public stop(): void {
    this.running = false
    this.pausedAt = null
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    this.clearPendingTimers()
  }

  private clearPendingTimers(): void {
    if (this.respawnTimeout) {
      clearTimeout(this.respawnTimeout)
      this.respawnTimeout = null
    }
    if (this.levelAdvanceTimeout) {
      clearTimeout(this.levelAdvanceTimeout)
      this.levelAdvanceTimeout = null
    }
    this.triggers.reset()
  }

  public setTheme(themeName: 'dark' | 'retro' | 'neon'): void {
    this.theme = themeName
    this.renderTarget?.setTheme?.(themeName)
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted?.(muted)
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

    this.resetLevelRuntime()
    this.emitHudState()
  }

  /**
   * Rebuilds the level's mutable state after a death. Death count and level timer are
   * kept so failed attempts still cost the player something.
   */
  private reloadAfterDeath(): void {
    this.resetLevelRuntime()
    this.emitPlayerPosition()
  }

  private resetLevelRuntime(): void {
    if (!this.activeLevel) return

    this.levelCleared = false

    // Deep clone level state
    this.activeTiles = this.activeLevel.tiles.map((row) => [...row])
    this.activeDoor = { ...this.activeLevel.door }
    this.activeEntities = (this.activeLevel.movingEntities || []).map((entity) => ({ ...entity }))

    this.tweens.clear()
    this.particles.clear()
    this.triggers.setTriggers(this.activeLevel.triggers)

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

    this.audio.playDeath?.()
    this.particles.emitDeathPoof(
      this.player.x + this.player.width / 2,
      this.player.y + this.player.height / 2,
      '#ffffff'
    )
    // Your own misses leave a mark too, so a level you keep failing shows you where.
    this.addDeathMark(this.player.x, this.player.y, getPlayerGhostColor(this.playerId), this.currentLevelIndex)

    this.emitPlayerPosition()

    if (this.callbacks.onDeath && this.activeLevel) {
      this.callbacks.onDeath(this.activeLevel.id, this.activeLevel.name, this.levelDeaths)
    }

    this.respawnTimeout = setTimeout(() => {
      this.respawnTimeout = null
      this.reloadAfterDeath()
    }, TROLL_RUN_PHYSICS.RESPAWN_DELAY_MS)
  }

  private triggerLevelClear(): void {
    if (!this.player.alive || this.levelCleared) return

    this.levelCleared = true
    this.audio.playClear?.()
    const clearTimeMs = performance.now() - this.levelStartTime
    this.totalTimeElapsed += clearTimeMs

    // Hand the runner over to the door-entry animation: input stops mattering and the momentum that
    // carried them into the door is dropped so they step in rather than slide through.
    this.doorEntryOrigin = { x: this.player.x, y: this.player.y }
    this.player.doorEntryProgress = 0
    this.player.vx = 0
    this.player.vy = 0
    this.player.jumping = false
    this.player.facing = this.activeDoor.x + TROLL_RUN_DOOR_WIDTH / 2 >= this.player.x ? 'right' : 'left'

    if (this.callbacks.onLevelClear && this.activeLevel) {
      this.callbacks.onLevelClear(this.activeLevel.id, this.activeLevel.name, clearTimeMs, this.levelDeaths)
    }

    this.levelAdvanceTimeout = setTimeout(() => {
      this.levelAdvanceTimeout = null
      this.nextLevel()
    }, LEVEL_CLEAR_DELAY_MS)
  }

  /**
   * Walks the runner from wherever they touched the door into the middle of the doorway. Physics is
   * off for the duration — leaving it running is what let a runner sail past the door they had just
   * cleared, since nothing stopped them for the 450ms before the next level loaded.
   */
  private advanceDoorEntry(dt: number): void {
    const player = this.player
    if (player.doorEntryProgress >= 1) return

    player.doorEntryProgress = Math.min(1, player.doorEntryProgress + dt / DOOR_ENTRY_SECONDS)

    // easeOutQuad, the same curve the door's own tweens run on.
    const eased = player.doorEntryProgress * (2 - player.doorEntryProgress)
    const targetX = this.activeDoor.x + (TROLL_RUN_DOOR_WIDTH - player.width) / 2
    const targetY = this.activeDoor.y + TROLL_RUN_DOOR_HEIGHT - player.height
    player.x = this.doorEntryOrigin.x + (targetX - this.doorEntryOrigin.x) * eased
    player.y = this.doorEntryOrigin.y + (targetY - this.doorEntryOrigin.y) * eased

    if (player.doorEntryProgress >= 1) {
      this.particles.emitDoorSparkles(this.activeDoor.x + 7, this.activeDoor.y + 10)
    }
  }

  private advanceDeathMarks(dt: number): void {
    if (this.deathMarks.length === 0) return
    for (const mark of this.deathMarks) {
      mark.age += dt
    }
    this.deathMarks = this.deathMarks.filter((mark) => mark.age < TROLL_RUN_DEATH_MARK_SECONDS)
  }

  private update(dt: number): void {
    if (!this.activeLevel) return

    const inputState = this.input.update()

    // Update Tweens
    this.tweens.update(dt)

    // Update Particles
    this.particles.update(dt)

    // A `fake_door` bite expires on its own, so the exit is never permanently lethal.
    if (this.activeDoor.biteTimer) {
      this.activeDoor.biteTimer = Math.max(0, this.activeDoor.biteTimer - dt)
    }

    advanceTrollRunEntities(this.activeEntities, this.player, dt)
    this.advanceDeathMarks(dt)

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

    // The level is already won; the runner is stepping into the door and takes no more input.
    if (this.levelCleared) {
      this.advanceDoorEntry(dt)
      // Without these frames a peer's ghost freezes short of the exit for the whole animation.
      this.tickPositionEmit(dt)
      return
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

    // Jump actually executed this frame (covers coyote-time and buffered jumps)
    if (collision.jumped) {
      this.audio.playJump?.()
    }

    // Coin collected
    if (collision.collectedCoin) {
      this.audio.playCoin?.()
    }

    // Fake floors give way the moment the player puts weight on them
    if (collision.steppedOnFake.length > 0) {
      for (const { col, row } of collision.steppedOnFake) {
        if (this.activeTiles[row] && this.activeTiles[row][col] !== undefined) {
          this.activeTiles[row][col] = TrollRunTileType.EMPTY
        }
      }
      this.audio.playTrap?.()
      this.particles.emitLandingDust(this.player.x + this.player.width / 2, this.player.y + this.player.height)
    }

    // Emit Realtime Position for other players
    this.tickPositionEmit(dt)

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
      // Landings and jumps are what `land_on` / `jump_near` traps wait for, so they travel with the
      // coin pickup rather than being recomputed inside the trigger manager.
      const frameEvents: TrollRunFrameEvent[] = []
      if (!prevGrounded && this.player.grounded) frameEvents.push('land_on')
      if (collision.jumped) frameEvents.push('jump_near')
      if (collision.collectedCoin) frameEvents.push('collect_coin')

      this.triggers.evaluate(
        {
          player: this.player,
          tiles: this.activeTiles,
          door: this.activeDoor,
          movingEntities: this.activeEntities,
          tweens: this.tweens,
          onSound: (sound) => {
            if (sound === 'trap') this.audio.playTrap?.()
          },
        },
        frameEvents
      )
    }
  }

  private render(): void {
    const target = this.renderTarget
    if (!target || !this.activeLevel) return

    const renderLevel: TrollRunRenderLevel = {
      ...this.activeLevel,
      tiles: this.activeTiles,
      door: this.activeDoor,
    }

    // Filter ghosts to only those on the same level as the player
    const currentGhosts = Array.from(this.ghosts.values()).filter(
      (ghost) => ghost.levelIndex === this.currentLevelIndex
    )
    const currentMarks = this.deathMarks.filter((mark) => mark.levelIndex === this.currentLevelIndex)

    target.render({
      level: renderLevel,
      player: this.player,
      particles: this.particles.getParticles(),
      entities: this.activeEntities,
      ghosts: currentGhosts,
      deathMarks: currentMarks,
      now: performance.now(),
    })
  }

  /**
   * Pushes level identity and trap state out to the DOM overlay, but only on an actual change —
   * the render loop calls this every frame and the overlay is React state.
   */
  private emitHudState(): void {
    const callback = this.callbacks.onHudChange
    if (!callback) return

    const next: TrollRunHudState = {
      levelIndex: this.currentLevelIndex,
      levelName: this.activeLevel?.name ?? '',
      controlsInverted: this.player.invertedControlsTimer > 0,
      gravityInverted: this.player.gravityInverted,
    }

    const previous = this.lastHudState
    if (
      previous &&
      previous.levelIndex === next.levelIndex &&
      previous.levelName === next.levelName &&
      previous.controlsInverted === next.controlsInverted &&
      previous.gravityInverted === next.gravityInverted
    ) {
      return
    }

    this.lastHudState = next
    callback(next)
  }

  /** Hands peers a position 20 times a second, which is as often as a ghost can usefully move. */
  private tickPositionEmit(dt: number): void {
    this.positionEmitTimer += dt
    if (this.positionEmitTimer >= 0.05) {
      this.positionEmitTimer = 0
      this.emitPlayerPosition()
    }
  }

  private emitPlayerPosition(): void {
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
    this.deathMarks = []
  }
}
