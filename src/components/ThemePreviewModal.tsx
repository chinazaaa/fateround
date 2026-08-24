'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useTheme } from '@/components/ThemeProvider'
import type { Theme } from '@/lib/theme-cookie'
import { type ThemeConfig } from '@/lib/themes'
import { Glyph } from '@/components/icons/Glyph'

/** Per-theme description of its two named modes (all themes adapt to light/dark). */
const THEME_MODE_SUBTITLES: Record<string, string> = {
  default: 'Default follows your site light or dark appearance',
  pirate: 'Pirate theme has both Light Mode (Day Chart) and Dark Mode (Night Sea)',
  arctic: 'Arctic theme has both Light Mode (Polar Day) and Dark Mode (Polar Night)',
  naija: 'Naija theme has both Light Mode (Balogun Sun) and Dark Mode (Wuse Night)',
  neon: 'Neon theme has both Light Mode (Daylight Circuit) and Dark Mode (Midnight Circuit)',
  retro: 'Retro theme has both Light Mode (Sun-faded Print) and Dark Mode (Warm Tube Glow)',
  elegant: 'Elegant theme has both Light Mode (Ivory & Gold) and Dark Mode (Midnight & Gold)',
  tropical: 'Tropical theme has both Light Mode (Beach Day) and Dark Mode (Moonlit Lagoon)',
}

function EyeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function PreviewModeToggle({ mode, onChange }: { mode: Theme; onChange: (mode: Theme) => void }) {
  return (
    <div
      className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-inset-bg)] p-0.5"
      role="group"
      aria-label="Preview appearance"
    >
      {(['light', 'dark'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
            mode === option ? 'bg-[var(--card-strong)] text-body shadow-sm' : 'text-muted hover:text-body'
          }`}
          aria-pressed={mode === option}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

/** Titles/labels the game-specific mini scenes hang under the header. Keeps
 *  the preview honest — a Sudoku theme reads "Sudoku", a Whot theme reads
 *  "Whot", so buyers see the game they're skinning. */
const GAME_LABELS: Record<string, { title: string; badge: string }> = {
  sudoku: { title: 'Daily Sudoku', badge: 'SUDOKU' },
  whot: { title: 'Whot Night', badge: 'WHOT' },
  ludo: { title: 'Family Ludo', badge: 'LUDO' },
  monopoly: { title: 'Estate Kings', badge: 'MONOPOLY' },
}

function ThemeSampleRoom({ theme, siteMode, gameType }: { theme: ThemeConfig; siteMode: Theme; gameType?: string }) {
  const hasRoomVars = Object.keys(theme.cssVars || {}).length > 0
  const roomStyle = (theme.cssVars || {}) as unknown as React.CSSProperties
  const labels = (gameType && GAME_LABELS[gameType]) || { title: 'Friday Night', badge: 'Kiss Marry Kill' }

  return (
    <div
      className="rounded-2xl overflow-hidden border border-[var(--border)] shadow-lg"
      style={roomStyle}
      data-theme={hasRoomVars ? undefined : siteMode}
      data-game-theme={theme.id === 'default' ? undefined : theme.id}
      data-game-type={gameType}
    >
      <div
        className="p-5 space-y-4"
        style={{
          backgroundColor: 'var(--background)',
          backgroundImage: 'var(--bg-gradient)',
          color: 'var(--foreground)',
        }}
      >
        <div className="text-center space-y-2">
          <Glyph icon={theme.icon} filled={theme.iconFilled} size={26} className="mx-auto" />
          <h3 className="text-lg font-black tracking-tight gradient-title">{labels.title}</h3>
          <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-inset-bg)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {labels.badge}
          </span>
        </div>

        <div className="glass-card p-3 space-y-2">
          <p className="label-caps text-[10px]">Players in lobby</p>
          <div className="flex items-center gap-2">
            {['Alex', 'Sam', 'Jordan'].map((name) => (
              <div key={name} className="flex flex-col items-center gap-1">
                <div className="avatar w-8 h-8 text-xs">{name.charAt(0)}</div>
                <span className="text-[10px] text-muted truncate max-w-[3.5rem]">{name}</span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-1 opacity-60">
              <div className="avatar w-8 h-8 text-xs border-dashed">+</div>
              <span className="text-[10px] text-faint">Join</span>
            </div>
          </div>
        </div>

        <GameSpecificSample theme={theme} gameType={gameType} />
      </div>
    </div>
  )
}

/**
 * Game-appropriate preview surface inside ThemeSampleRoom. Each mini paints
 * with the theme's OWN palette (`theme.preview.bg/accent/text`) rather than
 * inheriting `--surface`/`--primary` CSS vars — those only differ per theme
 * where globals.css has a `[data-game-theme=...]` block, and the per-game
 * paid themes (whot-neon, ludo-wooden, sudoku-newsprint, …) don't have those
 * blocks yet. Reading the palette directly is what makes "Wooden Ludo"
 * actually look brown, "Neon Whot" actually look neon, etc.
 *
 * Layouts read as the ACTUAL game at a glance — Ludo shows a cross-shaped
 * board with home yards, Whot shows a hand with classic shapes (circle,
 * cross, triangle, star, square), Sudoku shows a real 9×9 grid with 3×3
 * subgrid dividers, Monopoly shows a board corner with a strip of property
 * tiles carrying the theme's accent as their color-band.
 */
function GameSpecificSample({ theme, gameType }: { theme: ThemeConfig; gameType?: string }) {
  if (gameType === 'whot') return <WhotSample theme={theme} />
  if (gameType === 'ludo') return <LudoSample theme={theme} />
  if (gameType === 'sudoku') return <SudokuSample theme={theme} />
  if (gameType === 'monopoly') return <MonopolySample theme={theme} />
  return <KissMarryKillSample />
}

/** Wooden themes get a subtle warm-toned grain overlay so "Wooden Ludo"
 *  actually reads as wooden and not just brown. Everything else no-ops. */
function themeSurfaceBackground(themeId: string, base: string): string {
  if (themeId === 'ludo-wooden') {
    return `repeating-linear-gradient(90deg, ${base} 0px, ${base} 3px, color-mix(in srgb, ${base} 88%, #000) 3px, color-mix(in srgb, ${base} 88%, #000) 5px), ${base}`
  }
  if (themeId === 'sudoku-newsprint') {
    return `radial-gradient(circle at 20% 15%, color-mix(in srgb, ${base} 92%, #000) 0px, transparent 40%), ${base}`
  }
  if (themeId === 'whot-neon') {
    return `radial-gradient(circle at 50% 100%, color-mix(in srgb, #00e5ff 25%, transparent) 0%, transparent 60%), ${base}`
  }
  return base
}

function KissMarryKillSample() {
  return (
    <div className="glass-card-strong p-4 space-y-3">
      <p className="text-sm font-semibold text-center text-body">Round 1 — pick your fate</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { emoji: '💋', label: 'Kiss', color: 'var(--kiss)' },
          { emoji: '💍', label: 'Marry', color: 'var(--marry)' },
          { emoji: '💀', label: 'Kill', color: 'var(--kill)' },
        ].map((slot) => (
          <div key={slot.label} className="surface-inset rounded-xl px-2 py-2.5 text-center space-y-0.5">
            <span className="text-base leading-none">{slot.emoji}</span>
            <p className="text-[10px] font-bold" style={{ color: slot.color }}>
              {slot.label}
            </p>
          </div>
        ))}
      </div>
      <button type="button" className="btn-primary btn-fit mx-auto px-6 py-2 text-sm pointer-events-none">
        Submit vote
      </button>
    </div>
  )
}

/** Classic Whot shape glyphs as inline SVG so the card faces read like the
 *  real deck (circle, cross, triangle, star, square) rather than generic
 *  emoji. `color` is the accent from the previewed theme. */
function WhotShape({ shape, color, size = 24 }: { shape: 'circle' | 'cross' | 'triangle' | 'star' | 'square'; color: string; size?: number }) {
  const s = size
  const c = s / 2
  if (shape === 'circle') return <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}><circle cx={c} cy={c} r={s * 0.38} fill={color} /></svg>
  if (shape === 'cross') return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <rect x={c - s * 0.08} y={s * 0.15} width={s * 0.16} height={s * 0.7} fill={color} />
      <rect x={s * 0.15} y={c - s * 0.08} width={s * 0.7} height={s * 0.16} fill={color} />
    </svg>
  )
  if (shape === 'triangle') return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <polygon points={`${c},${s * 0.15} ${s * 0.85},${s * 0.82} ${s * 0.15},${s * 0.82}`} fill={color} />
    </svg>
  )
  if (shape === 'star') return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <polygon
        points={Array.from({ length: 10 }, (_, i) => {
          const a = (Math.PI / 5) * i - Math.PI / 2
          const r = i % 2 === 0 ? s * 0.42 : s * 0.18
          return `${c + Math.cos(a) * r},${c + Math.sin(a) * r}`
        }).join(' ')}
        fill={color}
      />
    </svg>
  )
  // square
  return <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}><rect x={s * 0.2} y={s * 0.2} width={s * 0.6} height={s * 0.6} fill={color} /></svg>
}

function WhotSample({ theme }: { theme: ThemeConfig }) {
  // Face-up call card + a fan of three hand cards, each with a classic Whot
  // shape. Card faces use the theme's own palette (whot-neon → dark card
  // with cyan shapes; whot-naija → green card with cream shapes).
  const cardBg = theme.preview.bg
  const cardText = theme.preview.text
  const shapeColor = theme.preview.accent
  const hand: { shape: 'circle' | 'cross' | 'triangle' | 'star' | 'square'; n: string }[] = [
    { shape: 'circle', n: '3' },
    { shape: 'star', n: '10' },
    { shape: 'triangle', n: '2' },
  ]
  return (
    <div
      className="rounded-xl p-4 space-y-3 border"
      style={{
        background: themeSurfaceBackground(theme.id, cardBg),
        borderColor: shapeColor,
        boxShadow: theme.id === 'whot-neon' ? `0 0 12px color-mix(in srgb, ${shapeColor} 40%, transparent)` : undefined,
      }}
    >
      <p className="text-sm font-semibold text-center" style={{ color: cardText }}>Match shape or number</p>
      {/* Face-up call card */}
      <div className="flex justify-center">
        <div
          className="flex h-24 w-16 flex-col items-center justify-center rounded-lg border-2 shadow-lg"
          style={{ background: cardBg, borderColor: shapeColor, color: cardText }}
        >
          <span className="absolute self-start pl-1.5 pt-0.5 text-[10px] font-black" style={{ color: cardText }}>7</span>
          <WhotShape shape="star" color={shapeColor} size={32} />
          <span className="absolute self-end pr-1.5 pb-0.5 rotate-180 text-[10px] font-black" style={{ color: cardText }}>7</span>
        </div>
      </div>
      {/* Hand */}
      <div className="flex justify-center gap-1.5">
        {hand.map((c, i) => (
          <div
            key={i}
            className="relative flex h-20 w-12 flex-col items-center justify-center rounded-md border shadow"
            style={{ background: cardBg, borderColor: shapeColor, color: cardText }}
          >
            <span className="absolute left-1 top-0.5 text-[9px] font-black" style={{ color: cardText }}>{c.n}</span>
            <WhotShape shape={c.shape} color={shapeColor} size={22} />
            <span className="absolute right-1 bottom-0.5 rotate-180 text-[9px] font-black" style={{ color: cardText }}>{c.n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LudoSample({ theme }: { theme: ThemeConfig }) {
  // 5×5 grid rendering a real Ludo cross: four home yards at the corners
  // in the traditional Ludo colors, cross-shaped track around the middle,
  // and a center goal star. The BOARD surface uses the previewed theme's
  // background — Wooden Ludo gets a warm brown with grain, Naija Ludo
  // green, etc. Home-yard colors stay traditional so the game is instantly
  // recognizable regardless of theme.
  const boardBg = theme.preview.bg
  const trackFill = theme.preview.text
  const goal = theme.preview.accent
  const yards = { r: '#c62828', b: '#1565c0', g: '#2e7d32', y: '#f9a825' }
  // Simple 5x5 lookup: 'r','b','g','y' = home yard, 't' = track cell,
  // 'x' = center goal, '.' = empty.
  const grid = [
    ['r', 'r', 't', 'b', 'b'],
    ['r', 'r', 't', 'b', 'b'],
    ['t', 't', 'x', 't', 't'],
    ['g', 'g', 't', 'y', 'y'],
    ['g', 'g', 't', 'y', 'y'],
  ]
  const cellFor = (v: string) => {
    if (v === 'r') return yards.r
    if (v === 'b') return yards.b
    if (v === 'g') return yards.g
    if (v === 'y') return yards.y
    if (v === 't') return trackFill
    return goal // 'x'
  }
  return (
    <div
      className="rounded-xl p-4 space-y-3 border"
      style={{
        background: themeSurfaceBackground(theme.id, boardBg),
        borderColor: `color-mix(in srgb, ${trackFill} 40%, transparent)`,
        color: theme.preview.text,
      }}
    >
      <p className="text-sm font-semibold text-center" style={{ color: theme.preview.text }}>
        Race four pieces home · 🎲 4
      </p>
      <div
        className="mx-auto grid aspect-square w-44 grid-cols-5 gap-0.5 rounded-md p-1"
        style={{ background: `color-mix(in srgb, ${trackFill} 30%, ${boardBg})` }}
      >
        {grid.flatMap((row, r) =>
          row.map((v, c) => {
            const isYard = v === 'r' || v === 'b' || v === 'g' || v === 'y'
            const isCenter = v === 'x'
            return (
              <div
                key={`${r}-${c}`}
                className="flex items-center justify-center rounded-sm"
                style={{
                  background: isYard
                    ? `color-mix(in srgb, ${cellFor(v)} 25%, ${boardBg})`
                    : isCenter
                      ? goal
                      : `color-mix(in srgb, ${trackFill} 15%, ${boardBg})`,
                  border: isYard ? `1px solid ${cellFor(v)}` : `1px solid color-mix(in srgb, ${trackFill} 25%, transparent)`,
                }}
              >
                {isYard && (r === 0 || r === 3) && (c === 0 || c === 3) && (
                  <span
                    className="block h-2.5 w-2.5 rounded-full border border-white/60"
                    style={{ background: cellFor(v) }}
                  />
                )}
                {isCenter && <span style={{ color: boardBg, fontSize: 12, fontWeight: 900 }}>★</span>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SudokuSample({ theme }: { theme: ThemeConfig }) {
  // A real 9×9 sudoku grid with the standard 3×3 subgrid dividers so it
  // reads unmistakably as sudoku. Numbers filled in a plausible pattern.
  // Cell background = theme.bg, digit color = theme.text, thick dividers
  // = theme.text (so the classic ink-on-paper contrast comes through on
  // both Minimalist and Newsprint themes).
  const cellBg = theme.preview.bg
  const digitColor = theme.preview.text
  const dividerColor = theme.preview.text
  const clueColor = theme.preview.accent
  // 9x9 puzzle with a plausible spread of givens
  const puzzle: (number | null)[][] = [
    [5, 3, null, null, 7, null, null, null, null],
    [6, null, null, 1, 9, 5, null, null, null],
    [null, 9, 8, null, null, null, null, 6, null],
    [8, null, null, null, 6, null, null, null, 3],
    [4, null, null, 8, null, 3, null, null, 1],
    [7, null, null, null, 2, null, null, null, 6],
    [null, 6, null, null, null, null, 2, 8, null],
    [null, null, null, 4, 1, 9, null, null, 5],
    [null, null, null, null, 8, null, null, 7, 9],
  ]
  return (
    <div
      className="rounded-xl p-4 space-y-3 border"
      style={{
        background: themeSurfaceBackground(theme.id, cellBg),
        borderColor: `color-mix(in srgb, ${dividerColor} 30%, transparent)`,
        color: digitColor,
      }}
    >
      <p className="text-sm font-semibold text-center" style={{ color: digitColor }}>
        Fill the 9×9 grid
      </p>
      <div
        className="mx-auto aspect-square w-52 rounded-sm"
        style={{ background: dividerColor, padding: 2, border: `2px solid ${dividerColor}` }}
      >
        <div className="grid h-full w-full grid-cols-9 gap-px" style={{ background: dividerColor }}>
          {puzzle.flatMap((row, r) =>
            row.map((v, c) => {
              // Draw thicker borders on every 3rd row/col so the 3×3 blocks pop.
              const rightThick = c === 2 || c === 5
              const bottomThick = r === 2 || r === 5
              return (
                <div
                  key={`${r}-${c}`}
                  className="flex items-center justify-center text-[10px]"
                  style={{
                    background: cellBg,
                    color: v ? clueColor : digitColor,
                    fontWeight: v ? 700 : 400,
                    fontFamily: theme.id === 'sudoku-newsprint' ? 'Georgia, serif' : undefined,
                    borderRight: rightThick ? `2px solid ${dividerColor}` : undefined,
                    borderBottom: bottomThick ? `2px solid ${dividerColor}` : undefined,
                  }}
                >
                  {v ?? ''}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/** Human-readable label for the currently-previewed Monopoly edition. */
function monopolyEditionLabel(themeId: string): string {
  if (themeId === 'america') return 'USA edition'
  if (themeId === 'christmas') return 'Christmas edition'
  if (themeId === 'naija') return 'Naija edition'
  if (themeId === 'pirate') return 'High Seas edition'
  if (themeId === 'arctic') return 'Polar edition'
  return 'London edition'
}

function MonopolySample({ theme }: { theme: ThemeConfig }) {
  // A row of six property tiles + a GO corner — the classic bottom edge of
  // a Monopoly board. Each property's color-band uses the previewed edition's
  // accent so USA reads red-white-blue, Christmas red-green, Naija green, etc.
  // Property names swap per edition so a shopper reads familiar streets.
  const boardBg = theme.preview.bg
  const tileBg = theme.preview.text
  const band = theme.preview.accent
  const streets =
    theme.id === 'america'
      ? ['Boardwalk', 'Park Ave', '5th Ave', 'Times Sq', 'Wall St', 'Broadway']
      : theme.id === 'christmas'
        ? ['Holly Ln', 'North Pole', 'Elf Way', 'Sleigh Rd', 'Reindeer', 'Snowfall']
        : theme.id === 'naija'
          ? ['Ikoyi', 'V.I.', 'Lekki', 'Ikeja', 'Yaba', 'Surulere']
          : theme.id === 'pirate'
            ? ['Tortuga', 'Cove', 'Kraken Bay', 'Skull Isle', 'The Reef', 'Port Royal']
            : theme.id === 'arctic'
              ? ['Aurora', 'Glacier', 'Pole Star', 'Fjord', 'Tundra', 'Iceberg']
              : ['Mayfair', 'Park Ln', 'Bond St', 'Oxford St', 'Regent', 'Piccadilly']
  const priceCurrency = theme.id === 'america' ? '$' : theme.id === 'naija' ? '₦' : '£'
  return (
    <div
      className="rounded-xl p-4 space-y-3 border"
      style={{
        background: themeSurfaceBackground(theme.id, boardBg),
        borderColor: `color-mix(in srgb, ${band} 45%, transparent)`,
        color: theme.preview.text,
      }}
    >
      <p className="text-sm font-semibold text-center" style={{ color: theme.preview.text }}>
        {monopolyEditionLabel(theme.id)}
      </p>
      <div className="mx-auto grid w-full grid-cols-7 gap-0.5">
        {/* GO corner */}
        <div
          className="flex aspect-square flex-col items-center justify-center rounded-sm"
          style={{ background: tileBg, color: boardBg, border: `1px solid ${band}` }}
        >
          <span className="text-[9px] font-black tracking-wide" style={{ color: band }}>GO</span>
          <span className="text-sm" style={{ color: band, lineHeight: 1 }}>⇐</span>
        </div>
        {streets.map((name, i) => (
          <div
            key={i}
            className="flex aspect-square flex-col overflow-hidden rounded-sm"
            style={{ background: tileBg, border: `1px solid color-mix(in srgb, ${band} 40%, ${tileBg})` }}
          >
            <div className="h-2 w-full" style={{ background: band }} />
            <div className="flex flex-1 flex-col items-center justify-center px-0.5 text-center">
              <span className="text-[7px] font-bold leading-tight" style={{ color: boardBg }}>
                {name}
              </span>
              <span className="text-[7px] leading-tight" style={{ color: boardBg, opacity: 0.75 }}>
                {priceCurrency}
                {(i + 1) * 50 + 100}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ThemePreviewModal({
  theme,
  open,
  onClose,
  onSelect,
  gameType,
}: {
  theme: ThemeConfig | null
  open: boolean
  onClose: () => void
  onSelect?: (themeId: ThemeConfig['id']) => void
  gameType?: string
}) {
  const { theme: siteTheme } = useTheme()
  const [previewMode, setPreviewMode] = useState<Theme>(siteTheme)
  // Every theme now carries its palette in globals.css (light + dark variants),
  // so all of them adapt to the site's light/dark mode. A non-empty `cssVars`
  // would mark a legacy fixed-palette theme (none remain today).
  const isAdaptiveTheme = theme ? Object.keys(theme.cssVars).length === 0 : false

  useEffect(() => {
    if (open) setPreviewMode(siteTheme)
  }, [open, siteTheme, theme?.id])

  if (!theme) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={theme.label}
      subtitle={
        isAdaptiveTheme
          ? (THEME_MODE_SUBTITLES[theme.id] ?? 'Follows your site light or dark appearance')
          : 'This theme uses its own fixed color palette'
      }
      size="md"
    >
      <div className="space-y-4">
        {isAdaptiveTheme && (
          <div className="flex justify-center">
            <PreviewModeToggle mode={previewMode} onChange={setPreviewMode} />
          </div>
        )}
        <ThemeSampleRoom theme={theme} siteMode={previewMode} gameType={gameType} />
        {onSelect && (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary px-5 py-2.5 text-sm">
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onSelect(theme.id)
                onClose()
              }}
              className="btn-primary btn-fit px-5 py-2.5 text-sm"
            >
              Use this theme
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function ThemePreviewCard({
  theme,
  selected,
  onClick,
  onPreview,
  locked = false,
  priceCoins,
}: {
  theme: ThemeConfig
  selected: boolean
  onClick: () => void
  onPreview: () => void
  /**
   * Renders the card as a "you don't own this yet" tile: dimmed, 🔒 badge,
   * bottom bar becomes an "Unlock in Shop" link that routes to /shop.
   * Tap on the tile body also routes to /shop (via onClick — the caller is
   * responsible for wiring that navigation). Selection styling is skipped
   * while locked because locked items cannot be selected.
   */
  locked?: boolean
  /** Price shown alongside the lock icon (e.g. 800). Omit for editions
   *  whose price isn't yet known client-side. */
  priceCoins?: number
}) {
  const borderClass = locked
    ? 'border-[var(--border)] opacity-70 hover:opacity-100 hover:border-[var(--border-strong)]'
    : selected
      ? 'border-[var(--primary)] shadow-[0_0_0_1px_var(--primary)]'
      : 'border-[var(--border)] hover:border-[var(--border-strong)]'
  return (
    <div className={`flex min-w-0 flex-col overflow-hidden rounded-xl border transition-all ${borderClass}`}>
      <button
        type="button"
        onClick={onClick}
        className="relative flex w-full flex-col items-center gap-1 px-1.5 pt-2 pb-1.5"
        aria-label={locked ? `${theme.label} — unlock in shop` : theme.label}
      >
        {locked && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-inset-bg)] text-[9px] leading-none"
          >
            🔒
          </span>
        )}
        <div className="flex gap-0.5">
          <span
            className="block h-3.5 w-3.5 rounded-full border border-black/10"
            style={{ background: theme.preview.bg }}
          />
          <span
            className="block h-3.5 w-3.5 rounded-full border border-black/10"
            style={{ background: theme.preview.accent }}
          />
          <span
            className="block h-3.5 w-3.5 rounded-full border border-black/10"
            style={{ background: theme.preview.text }}
          />
        </div>
        <span className="flex w-full min-w-0 items-center justify-center gap-1 text-[11px] font-medium leading-tight text-body">
          <Glyph icon={theme.icon} filled={theme.iconFilled} size={13} className="shrink-0" />
          <span className="truncate">{theme.label}</span>
        </span>
      </button>
      {locked ? (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center justify-center gap-1 border-t border-[var(--border)] bg-[var(--surface-inset-bg)] py-1 text-[10px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--card-hover)]"
          aria-label={`Unlock ${theme.label} in the Shop`}
        >
          🪙 {priceCoins !== undefined ? `Unlock — ${priceCoins}` : 'Unlock in Shop'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onPreview}
          className="flex w-full items-center justify-center gap-0.5 border-t border-[var(--border)] bg-[var(--surface-inset-bg)] py-1 text-[10px] font-semibold text-body transition-colors hover:bg-[var(--card-hover)]"
          aria-label={`Preview ${theme.label} theme`}
        >
          <EyeIcon className="h-3 w-3 shrink-0 opacity-80" />
          Preview
        </button>
      )}
    </div>
  )
}
