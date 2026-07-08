'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useTheme } from '@/components/ThemeProvider'
import type { Theme } from '@/lib/theme-cookie'
import { themeStyleVars, type ThemeConfig } from '@/lib/themes'

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

function ThemeSampleRoom({ theme, siteMode }: { theme: ThemeConfig; siteMode: Theme }) {
  const hasRoomVars = Object.keys(theme.cssVars).length > 0
  const roomStyle = themeStyleVars(theme.id)

  return (
    <div
      className="rounded-2xl overflow-hidden border border-[var(--border)] shadow-lg"
      style={roomStyle}
      data-theme={hasRoomVars ? undefined : siteMode}
      data-game-theme={theme.id === 'default' ? undefined : theme.id}
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
          <p className="text-2xl leading-none">{theme.emoji}</p>
          <h3 className="text-lg font-black tracking-tight gradient-title">Friday Night</h3>
          <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-inset-bg)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Kiss Marry Kill
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
      </div>
    </div>
  )
}

export function ThemePreviewModal({
  theme,
  open,
  onClose,
  onSelect,
}: {
  theme: ThemeConfig | null
  open: boolean
  onClose: () => void
  onSelect?: (themeId: ThemeConfig['id']) => void
}) {
  const { theme: siteTheme } = useTheme()
  const [previewMode, setPreviewMode] = useState<Theme>(siteTheme)
  const isAdaptiveTheme =
    theme?.id === 'default' || theme?.id === 'pirate' || theme?.id === 'arctic' || theme?.id === 'naija'

  useEffect(() => {
    if (open) setPreviewMode(siteTheme)
  }, [open, siteTheme, theme?.id])

  if (!theme) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${theme.emoji} ${theme.label}`}
      subtitle={
        isAdaptiveTheme
          ? theme.id === 'pirate'
            ? 'Pirate theme has both Light Mode (Day Chart) and Dark Mode (Night Sea)'
            : theme.id === 'arctic'
              ? 'Arctic theme has both Light Mode (Polar Day) and Dark Mode (Polar Night)'
              : theme.id === 'naija'
                ? 'Naija theme has both Light Mode (Balogun Sun) and Dark Mode (Wuse Night)'
                : 'Default follows your site light or dark appearance'
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
        <ThemeSampleRoom theme={theme} siteMode={previewMode} />
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
}: {
  theme: ThemeConfig
  selected: boolean
  onClick: () => void
  onPreview: () => void
}) {
  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border transition-all ${
        selected
          ? 'border-[var(--primary)] shadow-[0_0_0_1px_var(--primary)]'
          : 'border-[var(--border)] hover:border-[var(--border-strong)]'
      }`}
    >
      <button type="button" onClick={onClick} className="flex w-full flex-col items-center gap-1 px-1.5 pt-2 pb-1.5">
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
        <span className="w-full truncate text-center text-[11px] font-medium leading-tight text-body">
          {theme.emoji} {theme.label}
        </span>
      </button>
      <button
        type="button"
        onClick={onPreview}
        className="flex w-full items-center justify-center gap-0.5 border-t border-[var(--border)] bg-[var(--surface-inset-bg)] py-1 text-[10px] font-semibold text-body transition-colors hover:bg-[var(--card-hover)]"
        aria-label={`Preview ${theme.label} theme`}
      >
        <EyeIcon className="h-3 w-3 shrink-0 opacity-80" />
        Preview
      </button>
    </div>
  )
}
