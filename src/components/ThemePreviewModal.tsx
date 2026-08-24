'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useTheme } from '@/components/ThemeProvider'
import type { Theme } from '@/lib/theme-cookie'
import { themeStyleVars, type ThemeConfig } from '@/lib/themes'
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

function SudokuScene({ theme }: { theme: ThemeConfig }) {
  // Compact 4x4 mini-grid, dashed 2x2 sub-boxes, mixture of givens and
  // blanks — reads as "sudoku" at a glance without pretending to be a
  // solvable 9x9 puzzle in a preview.
  const cells: (number | null)[] = [1, null, 3, 4, null, 4, null, 2, 3, null, 4, null, 4, 2, null, 3]
  return (
    <div className="glass-card-strong p-4 space-y-3">
      <p className="text-sm font-semibold text-center text-body">Round 1 — solve the grid</p>
      <div
        className="mx-auto grid aspect-square w-40 grid-cols-4 gap-px rounded-lg p-1"
        style={{ background: theme.preview.text, border: `2px solid ${theme.preview.text}` }}
      >
        {cells.map((v, i) => (
          <div
            key={i}
            className="flex items-center justify-center text-sm font-bold"
            style={{ background: theme.preview.bg, color: theme.preview.text }}
          >
            {v ?? ''}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-center text-muted">2:14 · 3 hints left</p>
    </div>
  )
}

function WhotScene({ theme }: { theme: ThemeConfig }) {
  // Fan of three Whot-style cards + a face-up top card. Uses theme accent
  // as the card face so the reskin comes through even without a full
  // globals.css block for this slug.
  const hand = [
    { shape: '●', label: '5' },
    { shape: '■', label: '10' },
    { shape: '★', label: '20' },
  ]
  return (
    <div className="glass-card-strong p-4 space-y-3">
      <p className="text-sm font-semibold text-center text-body">Your turn — play a card</p>
      <div className="relative mx-auto flex h-24 items-end justify-center">
        {hand.map((card, i) => (
          <div
            key={i}
            className="absolute flex h-24 w-16 flex-col justify-between rounded-lg border p-1.5 shadow-md"
            style={{
              background: theme.preview.bg,
              borderColor: theme.preview.text,
              color: theme.preview.accent,
              transform: `translateX(${(i - 1) * 28}px) rotate(${(i - 1) * 6}deg)`,
              zIndex: i,
            }}
          >
            <span className="text-[10px] font-bold leading-none">{card.label}</span>
            <span className="text-center text-2xl leading-none">{card.shape}</span>
            <span className="rotate-180 text-[10px] font-bold leading-none">{card.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LudoScene({ theme }: { theme: ThemeConfig }) {
  // Four home yards + the classic cross of the Ludo track. Colors are
  // fixed to the traditional palette (red/green/yellow/blue) so it reads
  // as Ludo regardless of theme; the frame/track use the theme palette.
  const yards = ['#dc2626', '#16a34a', '#eab308', '#2563eb']
  return (
    <div className="glass-card-strong p-4 space-y-3">
      <p className="text-sm font-semibold text-center text-body">Roll to move · 🎲 4</p>
      <div
        className="mx-auto grid aspect-square w-40 grid-cols-3 gap-0.5 rounded-lg p-1"
        style={{ background: theme.preview.text, border: `2px solid ${theme.preview.text}` }}
      >
        {[0, 1, 2, 3].map((idx) => {
          const positions = [0, 2, 6, 8]
          const gridPos = positions[idx]
          return (
            <div
              key={`yard-${idx}`}
              className="flex items-center justify-center rounded"
              style={{ background: yards[idx], gridArea: `${Math.floor(gridPos / 3) + 1} / ${(gridPos % 3) + 1}` }}
            >
              <span className="text-lg">●</span>
            </div>
          )
        })}
        <div className="flex items-center justify-center" style={{ background: theme.preview.bg, gridArea: '1 / 2' }}>
          <span className="text-xs" style={{ color: theme.preview.accent }}>
            ▲
          </span>
        </div>
        <div className="flex items-center justify-center" style={{ background: theme.preview.bg, gridArea: '2 / 1' }}>
          <span className="text-xs" style={{ color: theme.preview.accent }}>
            ◀
          </span>
        </div>
        <div
          className="flex items-center justify-center rounded"
          style={{ background: theme.preview.accent, gridArea: '2 / 2' }}
        >
          <span className="text-sm font-bold" style={{ color: theme.preview.bg }}>
            ★
          </span>
        </div>
        <div className="flex items-center justify-center" style={{ background: theme.preview.bg, gridArea: '2 / 3' }}>
          <span className="text-xs" style={{ color: theme.preview.accent }}>
            ▶
          </span>
        </div>
        <div className="flex items-center justify-center" style={{ background: theme.preview.bg, gridArea: '3 / 2' }}>
          <span className="text-xs" style={{ color: theme.preview.accent }}>
            ▼
          </span>
        </div>
      </div>
    </div>
  )
}

function MonopolyScene({ theme }: { theme: ThemeConfig }) {
  // Board corner + a strip of three property tiles with the theme accent
  // as their color-band — matches how the Monopoly board actually looks
  // more than a generic KMK card would.
  const props = [
    { name: 'Ikoyi', price: '₦300' },
    { name: 'Lekki', price: '₦320' },
    { name: 'V.I.', price: '₦350' },
  ]
  return (
    <div className="glass-card-strong p-4 space-y-3">
      <p className="text-sm font-semibold text-center text-body">Your turn — 🎲 7</p>
      <div
        className="mx-auto grid w-full grid-cols-4 gap-0.5 rounded-lg p-1"
        style={{ background: theme.preview.text, border: `2px solid ${theme.preview.text}` }}
      >
        <div
          className="flex aspect-square flex-col items-center justify-center rounded text-[9px] font-bold"
          style={{ background: theme.preview.bg, color: theme.preview.text }}
        >
          GO
          <span className="text-base leading-none" style={{ color: theme.preview.accent }}>
            ⇐
          </span>
        </div>
        {props.map((p) => (
          <div
            key={p.name}
            className="flex aspect-square flex-col overflow-hidden rounded"
            style={{ background: theme.preview.bg }}
          >
            <div className="h-2 w-full" style={{ background: theme.preview.accent }} />
            <div className="flex flex-1 flex-col items-center justify-center px-0.5 text-center">
              <span className="text-[8px] font-bold leading-tight" style={{ color: theme.preview.text }}>
                {p.name}
              </span>
              <span className="text-[8px] leading-tight" style={{ color: theme.preview.text }}>
                {p.price}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function KissMarryKillScene() {
  // The original preview scene — used for themes on games that don't have
  // a dedicated mini-scene above (default/generic app-wide themes shown
  // on Fate Round-style vote games).
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

/** Pick the game-shaped mini-scene for the theme's owning game. Falls back
 *  to the Kiss/Marry/Kill scene for app-wide themes shown on Fate Round
 *  vote games, or when the owning game type has no dedicated preview. */
function GameScene({ theme, gameType }: { theme: ThemeConfig; gameType?: string }) {
  switch (gameType) {
    case 'sudoku':
      return <SudokuScene theme={theme} />
    case 'whot':
      return <WhotScene theme={theme} />
    case 'ludo':
      return <LudoScene theme={theme} />
    case 'monopoly':
      return <MonopolyScene theme={theme} />
    default:
      return <KissMarryKillScene />
  }
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

        <GameScene theme={theme} gameType={gameType} />
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
