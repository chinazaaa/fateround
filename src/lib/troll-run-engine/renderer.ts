/**
 * 2D Canvas Renderer for Troll Run.
 * Renders tiles, animated exit door, spikes, hazard entities, player sprite with directional eyes, particles,
 * and other players' real-time translucent ghost avatars.
 */

import {
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TROLL_RUN_TILE_SIZE,
  TrollRunTileType,
  type GhostRunner,
  type PlayerState,
  type TrollMovingEntity,
  type TrollRunLevel,
} from './types'
import type { ParticleManager } from './particles'

export interface RenderTheme {
  bg: string
  solid: string
  solidOutline: string
  fakeSolid: string
  ice: string
  spike: string
  doorGlow: string
  doorFrame: string
  playerColor: string
  playerEye: string
}

export const THEMES: Record<string, RenderTheme> = {
  dark: {
    bg: '#0f172a', // slate 900
    solid: '#f8fafc', // slate 50
    solidOutline: '#cbd5e1', // slate 300
    fakeSolid: '#f8fafc', // identical to solid to deceive player!
    ice: '#38bdf8', // sky blue
    spike: '#ef4444', // vibrant red
    doorGlow: '#facc15', // gold yellow
    doorFrame: '#eab308',
    playerColor: '#ffffff',
    playerEye: '#090d16',
  },
  retro: {
    bg: '#18181b', // zinc 900
    solid: '#e4e4e7',
    solidOutline: '#a1a1aa',
    fakeSolid: '#e4e4e7',
    ice: '#67e8f9',
    spike: '#dc2626',
    doorGlow: '#fbbf24',
    doorFrame: '#d97706',
    playerColor: '#ffffff',
    playerEye: '#18181b',
  },
  neon: {
    bg: '#050510',
    solid: '#a855f7',
    solidOutline: '#d8b4fe',
    fakeSolid: '#a855f7',
    ice: '#06b6d4',
    spike: '#f43f5e',
    doorGlow: '#22c55e',
    doorFrame: '#16a34a',
    playerColor: '#ffffff',
    playerEye: '#050510',
  },
}

export class CanvasRenderer {
  private theme: RenderTheme = THEMES.dark

  public setTheme(themeName: 'dark' | 'retro' | 'neon'): void {
    this.theme = THEMES[themeName] || THEMES.dark
  }

  public render(
    ctx: CanvasRenderingContext2D,
    level: TrollRunLevel,
    player: PlayerState,
    particles: ParticleManager,
    movingEntities: TrollMovingEntity[] = [],
    levelTitle = '',
    ghosts: GhostRunner[] = []
  ): void {
    const ts = TROLL_RUN_TILE_SIZE

    // Background
    ctx.fillStyle = this.theme.bg
    ctx.fillRect(0, 0, TROLL_RUN_INTERNAL_WIDTH, TROLL_RUN_INTERNAL_HEIGHT)

    // Render Tiles
    const tiles = level.tiles
    for (let r = 0; r < tiles.length; r++) {
      for (let c = 0; c < (tiles[r]?.length ?? 0); c++) {
        const tile = tiles[r][c]
        const x = c * ts
        const y = r * ts

        if (tile === TrollRunTileType.SOLID || tile === TrollRunTileType.FAKE_SOLID) {
          ctx.fillStyle = this.theme.solid
          ctx.fillRect(x, y, ts, ts)
          ctx.strokeStyle = this.theme.solidOutline
          ctx.lineWidth = 1
          ctx.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1)
        } else if (tile === TrollRunTileType.ICE) {
          ctx.fillStyle = this.theme.ice
          ctx.fillRect(x, y, ts, ts)
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(x + 2, y + 2, ts - 4, 2)
        } else if (tile === TrollRunTileType.BOUNCE) {
          ctx.fillStyle = '#ec4899' // pink bouncy
          ctx.fillRect(x, y, ts, ts)
          ctx.fillStyle = '#fbcfe8'
          ctx.fillRect(x + 3, y + 3, ts - 6, ts - 6)
        } else if (tile === TrollRunTileType.COIN) {
          ctx.fillStyle = '#facc15'
          ctx.beginPath()
          ctx.arc(x + ts / 2, y + ts / 2, ts / 3, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#fef08a'
          ctx.beginPath()
          ctx.arc(x + ts / 2 - 1, y + ts / 2 - 1, ts / 6, 0, Math.PI * 2)
          ctx.fill()
        } else if (
          tile === TrollRunTileType.SPIKE_UP ||
          tile === TrollRunTileType.SPIKE_DOWN ||
          tile === TrollRunTileType.SPIKE_LEFT ||
          tile === TrollRunTileType.SPIKE_RIGHT
        ) {
          this.renderSpike(ctx, x, y, ts, tile)
        }
      }
    }

    // Render Moving Entities
    for (const entity of movingEntities) {
      if (entity.type === 'buzzsaw') {
        ctx.save()
        ctx.translate(entity.x + entity.w / 2, entity.y + entity.h / 2)
        ctx.fillStyle = '#ef4444'
        ctx.beginPath()
        ctx.arc(0, 0, entity.w / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      } else {
        ctx.fillStyle = this.theme.solid
        ctx.fillRect(entity.x, entity.y, entity.w, entity.h)
        ctx.strokeStyle = this.theme.solidOutline
        ctx.strokeRect(entity.x + 0.5, entity.y + 0.5, entity.w - 1, entity.h - 1)
      }
    }

    // Render Exit Door
    this.renderDoor(ctx, level.door.x, level.door.y)

    // Render other players' real-time ghost avatars on this level
    for (const ghost of ghosts) {
      this.renderGhost(ctx, ghost)
    }

    // Render Main Player
    if (player.alive) {
      this.renderPlayer(ctx, player)
    }

    // Render Particles
    particles.render(ctx)

    // Level Title / Hint banner at top
    if (levelTitle) {
      ctx.save()
      ctx.font = 'bold 9px monospace'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.textAlign = 'center'
      ctx.fillText(levelTitle.toUpperCase(), TROLL_RUN_INTERNAL_WIDTH / 2, 12)
      ctx.restore()
    }

    // Inverted controls indicator
    if (player.invertedControlsTimer > 0) {
      ctx.save()
      ctx.font = 'bold 8px monospace'
      ctx.fillStyle = '#f43f5e'
      ctx.textAlign = 'center'
      ctx.fillText('⚠️ CONTROLS INVERTED ⚠️', TROLL_RUN_INTERNAL_WIDTH / 2, 24)
      ctx.restore()
    }
  }

  private renderSpike(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, type: number): void {
    ctx.fillStyle = this.theme.spike
    ctx.beginPath()
    if (type === TrollRunTileType.SPIKE_UP) {
      ctx.moveTo(x, y + ts)
      ctx.lineTo(x + ts / 2, y + 2)
      ctx.lineTo(x + ts, y + ts)
    } else if (type === TrollRunTileType.SPIKE_DOWN) {
      ctx.moveTo(x, y)
      ctx.lineTo(x + ts / 2, y + ts - 2)
      ctx.lineTo(x + ts, y)
    } else if (type === TrollRunTileType.SPIKE_LEFT) {
      ctx.moveTo(x + ts, y)
      ctx.lineTo(x + 2, y + ts / 2)
      ctx.lineTo(x + ts, y + ts)
    } else if (type === TrollRunTileType.SPIKE_RIGHT) {
      ctx.moveTo(x, y)
      ctx.lineTo(x + ts - 2, y + ts / 2)
      ctx.lineTo(x, y + ts)
    }
    ctx.closePath()
    ctx.fill()
  }

  private renderDoor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const dw = 14
    const dh = 20

    // Door Frame
    ctx.fillStyle = this.theme.doorFrame
    ctx.fillRect(Math.round(x), Math.round(y), dw, dh)

    // Inner Glowing Gateway
    ctx.fillStyle = this.theme.doorGlow
    ctx.fillRect(Math.round(x + 2), Math.round(y + 2), dw - 4, dh - 2)

    // Door Knob / Sparkle
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(Math.round(x + dw - 4), Math.round(y + dh / 2), 2, 2)
  }

  public renderGhost(ctx: CanvasRenderingContext2D, ghost: GhostRunner): void {
    if (!ghost.alive) return

    const gx = Math.round(ghost.x)
    const gy = Math.round(ghost.y)
    const gw = 12
    const gh = 14

    ctx.save()

    // Translucent ghost silhouette
    ctx.globalAlpha = 0.55
    ctx.fillStyle = ghost.color || '#38bdf8'
    ctx.fillRect(gx, gy, gw, gh)

    // Ghost directional eyes
    ctx.fillStyle = '#090d16'
    const eyeOffsetX = ghost.facing === 'right' ? 6 : 2
    ctx.fillRect(gx + eyeOffsetX, gy + 3, 2, 3)
    ctx.fillRect(gx + eyeOffsetX + 3, gy + 3, 2, 3)

    // Floating Name Tag above head
    ctx.globalAlpha = 0.95
    ctx.font = 'bold 7px sans-serif'
    ctx.textAlign = 'center'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    const tag = ghost.playerName.length > 7 ? ghost.playerName.slice(0, 6) + '…' : ghost.playerName
    ctx.strokeText(tag, gx + gw / 2, gy - 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(tag, gx + gw / 2, gy - 2)

    ctx.restore()
  }

  private renderPlayer(ctx: CanvasRenderingContext2D, player: PlayerState): void {
    const px = Math.round(player.x)
    const py = Math.round(player.y)
    const pw = player.width
    const ph = player.height

    // Main Body
    ctx.fillStyle = this.theme.playerColor
    ctx.fillRect(px, py, pw, ph)

    // Directional Pixel Eyes
    ctx.fillStyle = this.theme.playerEye
    const eyeOffsetX = player.facing === 'right' ? 6 : 2
    const eyeOffsetY = player.gravityInverted ? ph - 5 : 3

    ctx.fillRect(px + eyeOffsetX, py + eyeOffsetY, 2, 3)
    ctx.fillRect(px + eyeOffsetX + 3, py + eyeOffsetY, 2, 3)
  }
}
