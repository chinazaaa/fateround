/**
 * 2D Canvas Renderer for Troll Run.
 *
 * The buffer is 320×180 upscaled with `image-rendering: pixelated`, so everything here is drawn
 * on whole-pixel boundaries and shaded with flat bands rather than gradients. Two rules keep it
 * reading as deliberate pixel art instead of a grid of coloured boxes:
 *
 * 1. A run of touching tiles is one mass. Outlines and lit top faces are drawn only where the
 *    mass ends, so a ten-tile floor looks like one platform.
 * 2. No text is drawn into the buffer. Level names and status warnings are DOM overlays in
 *    `TrollRunCanvas`, where they stay crisp; only the short ghost initials live on the canvas
 *    because they have to track a moving position.
 */

import {
  TROLL_RUN_DOOR_HEIGHT,
  TROLL_RUN_DOOR_WIDTH,
  TROLL_RUN_INTERNAL_HEIGHT,
  TROLL_RUN_INTERNAL_WIDTH,
  TROLL_RUN_TILE_SIZE,
  TrollRunTileType,
  type GhostRunner,
  type PlayerState,
  type TrollMovingEntity,
  type TrollRunFrame,
  type TrollRunLevel,
} from '../../../packages/shared/src/troll-run-engine/types'
import { THEMES, type MassPalette, type RenderTheme } from '../../../packages/shared/src/troll-run-engine/palette'

export { THEMES, type MassPalette, type RenderTheme }

/** Which tiles fill their cell, and which of them read as the same material. */
const MASS_GROUP_NONE = 0
const MASS_GROUP_SOLID = 1
const MASS_GROUP_ICE = 2
const MASS_GROUP_BOUNCE = 3

/**
 * Neighbours in the same group share no internal outline. `FAKE_SOLID` groups with `SOLID` because
 * the whole trap depends on a collapsing floor being indistinguishable from a real one.
 */
function tileMassGroup(tile: number | undefined): number {
  switch (tile) {
    case TrollRunTileType.SOLID:
    case TrollRunTileType.FAKE_SOLID:
      return MASS_GROUP_SOLID
    case TrollRunTileType.ICE:
      return MASS_GROUP_ICE
    case TrollRunTileType.BOUNCE:
      return MASS_GROUP_BOUNCE
    default:
      return MASS_GROUP_NONE
  }
}

interface OpenEdges {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

export class CanvasRenderer {
  private theme: RenderTheme = THEMES.dark
  private backdrop: CanvasGradient | null = null
  private backdropTheme: RenderTheme | null = null

  public setTheme(themeName: 'dark' | 'retro' | 'neon'): void {
    this.theme = THEMES[themeName] || THEMES.dark
    // The cached gradient belongs to the palette it was built from.
    this.backdrop = null
    this.backdropTheme = null
  }

  public render(ctx: CanvasRenderingContext2D, frame: TrollRunFrame): void {
    const { level, player, entities: movingEntities, ghosts, particles, now: nowMs } = frame
    const tileSize = TROLL_RUN_TILE_SIZE

    this.renderBackdrop(ctx)

    const tiles = level.tiles
    for (let row = 0; row < tiles.length; row++) {
      const rowTiles = tiles[row]
      if (!rowTiles) continue

      for (let col = 0; col < rowTiles.length; col++) {
        const tile = rowTiles[col]
        const x = col * tileSize
        const y = row * tileSize
        const group = tileMassGroup(tile)

        if (group !== MASS_GROUP_NONE) {
          this.renderMassTile(ctx, x, y, tileSize, group, {
            up: tileMassGroup(tiles[row - 1]?.[col]) !== group,
            down: tileMassGroup(tiles[row + 1]?.[col]) !== group,
            left: tileMassGroup(rowTiles[col - 1]) !== group,
            right: tileMassGroup(rowTiles[col + 1]) !== group,
          })
          continue
        }

        if (tile === TrollRunTileType.COIN) {
          this.renderCoin(ctx, x, y, tileSize, col + row, nowMs)
        } else if (
          tile === TrollRunTileType.SPIKE_UP ||
          tile === TrollRunTileType.SPIKE_DOWN ||
          tile === TrollRunTileType.SPIKE_LEFT ||
          tile === TrollRunTileType.SPIKE_RIGHT
        ) {
          this.renderSpike(ctx, x, y, tileSize, tile)
        }
      }
    }

    for (const entity of movingEntities) {
      this.renderEntity(ctx, entity, nowMs)
    }

    // A runner who has touched the door is walking into it, so they draw *behind* the leaf and get
    // occluded by it. Drawing them on top instead is what made a clear look like running past.
    const enteringDoor = player.alive && player.doorEntryProgress > 0
    if (enteringDoor) {
      this.renderEnteringPlayer(ctx, player)
    }

    this.renderDoor(ctx, level.door.x, level.door.y, nowMs)

    for (const ghost of ghosts) {
      this.renderGhost(ctx, ghost)
    }

    if (player.alive && !enteringDoor) {
      this.renderPlayer(ctx, player)
    }

    for (const particle of particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = particle.color
      ctx.fillRect(
        Math.round(particle.x - particle.size / 2),
        Math.round(particle.y - particle.size / 2),
        particle.size,
        particle.size
      )
      ctx.restore()
    }
  }

  /**
   * The runner mid-doorway. The fade is quantised into quarters instead of running smooth so it
   * reads as a sprite dissolve rather than a CSS transition, and the sprite itself is never scaled —
   * sub-pixel geometry would soften the pixel edges the rest of the frame keeps hard.
   */
  private renderEnteringPlayer(ctx: CanvasRenderingContext2D, player: PlayerState): void {
    const remaining = Math.max(0, 1 - Math.min(1, player.doorEntryProgress))
    ctx.save()
    ctx.globalAlpha = Math.max(0.25, Math.ceil(remaining * 4) / 4)
    this.renderPlayer(ctx, player)
    ctx.restore()
  }

  /** Vertical wash plus a faint tile grid, so the level sits in a space instead of on a flat fill. */
  private renderBackdrop(ctx: CanvasRenderingContext2D): void {
    if (!this.backdrop || this.backdropTheme !== this.theme) {
      const gradient = ctx.createLinearGradient(0, 0, 0, TROLL_RUN_INTERNAL_HEIGHT)
      gradient.addColorStop(0, this.theme.bgTop)
      gradient.addColorStop(1, this.theme.bgBottom)
      this.backdrop = gradient
      this.backdropTheme = this.theme
    }

    ctx.fillStyle = this.backdrop
    ctx.fillRect(0, 0, TROLL_RUN_INTERNAL_WIDTH, TROLL_RUN_INTERNAL_HEIGHT)

    ctx.fillStyle = this.theme.bgGrid
    for (let x = TROLL_RUN_TILE_SIZE; x < TROLL_RUN_INTERNAL_WIDTH; x += TROLL_RUN_TILE_SIZE) {
      ctx.fillRect(x, 0, 1, TROLL_RUN_INTERNAL_HEIGHT)
    }
    for (let y = TROLL_RUN_TILE_SIZE; y < TROLL_RUN_INTERNAL_HEIGHT; y += TROLL_RUN_TILE_SIZE) {
      ctx.fillRect(0, y, TROLL_RUN_INTERNAL_WIDTH, 1)
    }
  }

  private massPalette(group: number): MassPalette {
    if (group === MASS_GROUP_ICE) return this.theme.ice
    if (group === MASS_GROUP_BOUNCE) return this.theme.bounce
    return this.theme.solid
  }

  private renderMassTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tileSize: number,
    group: number,
    open: OpenEdges
  ): void {
    const palette = this.massPalette(group)

    ctx.fillStyle = palette.body
    ctx.fillRect(x, y, tileSize, tileSize)

    // Lit top face where the mass meets open air, with a shadow band under it for depth.
    if (open.up) {
      ctx.fillStyle = palette.top
      ctx.fillRect(x, y, tileSize, 3)
      ctx.fillStyle = palette.shade
      ctx.fillRect(x, y + 3, tileSize, 1)
      ctx.fillStyle = palette.edge
      ctx.fillRect(x, y, tileSize, 1)
    }

    if (open.down) {
      ctx.fillStyle = palette.shade
      ctx.fillRect(x, y + tileSize - 2, tileSize, 2)
      ctx.fillStyle = palette.edge
      ctx.fillRect(x, y + tileSize - 1, tileSize, 1)
    }

    if (open.left) {
      ctx.fillStyle = palette.shade
      ctx.fillRect(x + 1, y, 1, tileSize)
      ctx.fillStyle = palette.edge
      ctx.fillRect(x, y, 1, tileSize)
    }

    if (open.right) {
      ctx.fillStyle = palette.shade
      ctx.fillRect(x + tileSize - 2, y, 1, tileSize)
      ctx.fillStyle = palette.edge
      ctx.fillRect(x + tileSize - 1, y, 1, tileSize)
    }

    // Bounce pads get chevrons so "this launches you" is legible before you touch it.
    if (group === MASS_GROUP_BOUNCE && open.up) {
      ctx.fillStyle = palette.top
      const midX = x + tileSize / 2
      for (let step = 0; step < 3; step++) {
        const chevronY = y + 6 + step * 3
        ctx.fillRect(midX - 3 + step, chevronY, 2, 1)
        ctx.fillRect(midX + 1 - step, chevronY, 2, 1)
      }
    }
  }

  private renderCoin(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tileSize: number,
    phaseOffset: number,
    nowMs: number
  ): void {
    // A one-pixel bob is enough to separate a pickup from the scenery.
    const bob = Math.round(Math.sin(nowMs / 260 + phaseOffset) * 1.2)
    const centerX = x + tileSize / 2
    const centerY = y + tileSize / 2 + bob
    const radius = tileSize / 3

    ctx.fillStyle = this.theme.coin.body
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = this.theme.coin.lit
    ctx.fillRect(Math.round(centerX - 2), Math.round(centerY - radius + 1), 2, 2)
  }

  private renderSpike(ctx: CanvasRenderingContext2D, x: number, y: number, tileSize: number, type: number): void {
    const { body, lit, socket } = this.theme.spike

    // Socket plate: spikes read as mounted to the surface rather than floating.
    ctx.fillStyle = socket
    if (type === TrollRunTileType.SPIKE_UP) ctx.fillRect(x, y + tileSize - 2, tileSize, 2)
    else if (type === TrollRunTileType.SPIKE_DOWN) ctx.fillRect(x, y, tileSize, 2)
    else if (type === TrollRunTileType.SPIKE_LEFT) ctx.fillRect(x + tileSize - 2, y, 2, tileSize)
    else ctx.fillRect(x, y, 2, tileSize)

    const drawTriangle = (color: string, inset: number) => {
      ctx.fillStyle = color
      ctx.beginPath()
      if (type === TrollRunTileType.SPIKE_UP) {
        ctx.moveTo(x + inset, y + tileSize)
        ctx.lineTo(x + tileSize / 2, y + 1 + inset * 2)
        ctx.lineTo(x + tileSize - inset, y + tileSize)
      } else if (type === TrollRunTileType.SPIKE_DOWN) {
        ctx.moveTo(x + inset, y)
        ctx.lineTo(x + tileSize / 2, y + tileSize - 1 - inset * 2)
        ctx.lineTo(x + tileSize - inset, y)
      } else if (type === TrollRunTileType.SPIKE_LEFT) {
        ctx.moveTo(x + tileSize, y + inset)
        ctx.lineTo(x + 1 + inset * 2, y + tileSize / 2)
        ctx.lineTo(x + tileSize, y + tileSize - inset)
      } else {
        ctx.moveTo(x, y + inset)
        ctx.lineTo(x + tileSize - 1 - inset * 2, y + tileSize / 2)
        ctx.lineTo(x, y + tileSize - inset)
      }
      ctx.closePath()
      ctx.fill()
    }

    drawTriangle(body, 0)
    // Inner highlight along the lit side gives the blade a facet instead of a flat wedge.
    drawTriangle(lit, 4)
  }

  private renderDoor(ctx: CanvasRenderingContext2D, doorX: number, doorY: number, nowMs: number): void {
    const width = TROLL_RUN_DOOR_WIDTH
    const height = TROLL_RUN_DOOR_HEIGHT
    const left = Math.round(doorX)
    const top = Math.round(doorY)

    // Three-frame pulse: a stepped animation stays crisp where a smooth fade would band.
    const pulseFrame = Math.floor(nowMs / 190) % 3

    // Stepped halo instead of a blurred gradient — nearest-neighbour upscaling keeps it clean.
    ctx.save()
    for (let ring = 3; ring >= 1; ring--) {
      ctx.globalAlpha = 0.05 + (3 - ring) * 0.045 + pulseFrame * 0.02
      ctx.fillStyle = this.theme.door.glow
      const spread = ring * 2
      ctx.fillRect(left - spread, top - spread, width + spread * 2, height + spread * 2)
    }
    ctx.restore()

    ctx.fillStyle = this.theme.door.frame
    ctx.fillRect(left, top, width, height)

    ctx.fillStyle = this.theme.door.body
    ctx.fillRect(left + 2, top + 2, width - 4, height - 2)

    // Light spilling out of the gateway, growing with the pulse.
    ctx.fillStyle = this.theme.door.lit
    const beamInset = 4 - pulseFrame
    ctx.fillRect(left + beamInset, top + 4, width - beamInset * 2, height - 6)

    ctx.fillStyle = this.theme.door.frame
    ctx.fillRect(left + width - 4, top + Math.round(height / 2), 2, 2)
  }

  private renderEntity(ctx: CanvasRenderingContext2D, entity: TrollMovingEntity, nowMs: number): void {
    if (entity.type === 'buzzsaw') {
      this.renderSaw(ctx, entity, nowMs)
      return
    }

    const left = Math.round(entity.x)
    const top = Math.round(entity.y)

    if (entity.type === 'bullet') {
      ctx.fillStyle = this.theme.hazard.body
      ctx.fillRect(left, top, entity.w, entity.h)
      ctx.fillStyle = this.theme.hazard.lit
      ctx.fillRect(left, top, Math.max(1, Math.round(entity.w / 2)), 1)
      return
    }

    if (entity.type === 'spike_wall' || entity.killsOnTouch) {
      ctx.fillStyle = this.theme.hazard.body
      ctx.fillRect(left, top, entity.w, entity.h)
      ctx.fillStyle = this.theme.hazard.lit
      ctx.fillRect(left, top, entity.w, 2)
      ctx.fillStyle = this.theme.spike.socket
      ctx.fillRect(left, top + entity.h - 1, entity.w, 1)
      return
    }

    // Platforms and falling blocks are standalone masses, so every side gets an edge.
    const palette = this.theme.block
    ctx.fillStyle = palette.body
    ctx.fillRect(left, top, entity.w, entity.h)
    ctx.fillStyle = palette.top
    ctx.fillRect(left, top, entity.w, Math.min(3, entity.h))
    ctx.fillStyle = palette.shade
    ctx.fillRect(left, top + entity.h - 2, entity.w, 2)
    ctx.fillStyle = palette.edge
    ctx.fillRect(left, top, entity.w, 1)
    ctx.fillRect(left, top + entity.h - 1, entity.w, 1)
    ctx.fillRect(left, top, 1, entity.h)
    ctx.fillRect(left + entity.w - 1, top, 1, entity.h)
  }

  private renderSaw(ctx: CanvasRenderingContext2D, entity: TrollMovingEntity, nowMs: number): void {
    const radius = entity.w / 2
    const teeth = 6

    ctx.save()
    ctx.translate(entity.x + entity.w / 2, entity.y + entity.h / 2)
    // Visible rotation: a saw that slides across the screen without spinning reads as a red dot.
    ctx.rotate((nowMs / 1000) * 7)

    ctx.fillStyle = this.theme.saw.teeth
    for (let tooth = 0; tooth < teeth; tooth++) {
      const angle = (Math.PI * 2 * tooth) / teeth
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * (radius + 2), Math.sin(angle) * (radius + 2))
      ctx.lineTo(Math.cos(angle + 0.5) * radius * 0.7, Math.sin(angle + 0.5) * radius * 0.7)
      ctx.lineTo(Math.cos(angle - 0.5) * radius * 0.7, Math.sin(angle - 0.5) * radius * 0.7)
      ctx.closePath()
      ctx.fill()
    }

    ctx.fillStyle = this.theme.saw.blade
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = this.theme.saw.hub
    ctx.beginPath()
    ctx.arc(0, 0, Math.max(1.5, radius / 3), 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }

  public renderGhost(ctx: CanvasRenderingContext2D, ghost: GhostRunner): void {
    if (!ghost.alive) return

    const left = Math.round(ghost.x)
    const top = Math.round(ghost.y)
    const width = 12
    const height = 14

    ctx.save()

    ctx.globalAlpha = 0.45
    ctx.fillStyle = this.theme.ghostOutline
    ctx.fillRect(left - 1, top - 1, width + 2, height + 2)

    ctx.globalAlpha = 0.6
    ctx.fillStyle = ghost.color
    ctx.fillRect(left, top, width, height)

    ctx.globalAlpha = 0.9
    const eyeOffsetX = ghost.facing === 'right' ? 6 : 2
    ctx.fillStyle = this.theme.ghostOutline
    ctx.fillRect(left + eyeOffsetX, top + 3, 2, 3)
    ctx.fillRect(left + eyeOffsetX + 3, top + 3, 2, 3)

    // A single initial on a solid plate survives the upscale; a truncated name at 7px did not.
    // The full name is in the runner lanes in the DOM, keyed by the same colour.
    const initial = (ghost.playerName.trim()[0] ?? '?').toUpperCase()
    const badgeSize = 9
    const badgeLeft = left + Math.round((width - badgeSize) / 2)
    const badgeTop = top - badgeSize - 2

    ctx.globalAlpha = 1
    ctx.fillStyle = this.theme.ghostOutline
    ctx.fillRect(badgeLeft - 1, badgeTop - 1, badgeSize + 2, badgeSize + 2)
    ctx.fillStyle = ghost.color
    ctx.fillRect(badgeLeft, badgeTop, badgeSize, badgeSize)

    ctx.fillStyle = this.theme.ghostTagText
    ctx.font = 'bold 7px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initial, badgeLeft + badgeSize / 2, badgeTop + badgeSize / 2 + 0.5)

    ctx.restore()
  }

  private renderPlayer(ctx: CanvasRenderingContext2D, player: PlayerState): void {
    const { body, top, outline, eye } = this.theme.player

    // Squash and stretch on the drawn sprite only — the hitbox never changes.
    const airStretch = player.grounded ? 0 : Math.min(2, Math.round(Math.abs(player.vy) / 260))
    const width = player.width - airStretch
    const height = player.height + airStretch
    const left = Math.round(player.x + airStretch / 2)
    const drawTop = Math.round(player.gravityInverted ? player.y - airStretch : player.y)

    // The outline is what keeps the runner visible against a pale platform.
    ctx.fillStyle = outline
    ctx.fillRect(left - 1, drawTop - 1, width + 2, height + 2)

    ctx.fillStyle = body
    ctx.fillRect(left, drawTop, width, height)

    ctx.fillStyle = top
    ctx.fillRect(left, player.gravityInverted ? drawTop + height - 2 : drawTop, width, 2)

    ctx.fillStyle = eye
    const eyeOffsetX = player.facing === 'right' ? width - 6 : 2
    const eyeOffsetY = player.gravityInverted ? height - 6 : 3
    ctx.fillRect(left + eyeOffsetX, drawTop + eyeOffsetY, 2, 3)
    ctx.fillRect(left + eyeOffsetX + 3, drawTop + eyeOffsetY, 2, 3)
  }
}
