'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useTheme } from '@/components/ThemeProvider'
import { useGameAlertsToggle } from '@/components/NotificationToggle'
import { isSoundMuted, setSoundMuted, subscribeSoundMuted } from '@/lib/sounds'
import { Glyph } from '@/components/icons/Glyph'
import { Sun01Icon, Moon02Icon, VolumeHighIcon, VolumeOffIcon, Notification01Icon } from '@hugeicons/core-free-icons'

/**
 * The shared in-game settings sheet — used by the lobby AND the in-game chrome.
 */
export function HostLobbySettingsSheet({
  open,
  onClose,
  title = 'Settings',
  gameCode,
  resumeToken,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  gameCode?: string | null
  resumeToken?: string | null
  children?: React.ReactNode
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-3.5 space-y-4">
          <ThemeRow />
          <div className="border-t border-[var(--border)] pt-3.5">
            <SoundRow />
          </div>
          {gameCode ? (
            <div className="border-t border-[var(--border)] pt-3.5">
              <GameAlertsRow gameCode={gameCode} resumeToken={resumeToken ?? null} />
            </div>
          ) : null}
        </div>
        {children ? <div className="space-y-4 pt-2">{children}</div> : null}
      </div>
    </Modal>
  )
}

function GameAlertsRow({ gameCode, resumeToken }: { gameCode: string; resumeToken: string | null }) {
  const { available, on, busy, toggle } = useGameAlertsToggle(gameCode, resumeToken)

  if (!available) return null

  return (
    <section className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="fr-glyph text-[var(--primary)] flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
          <Glyph icon={Notification01Icon} size={18} />
        </span>
        <div>
          <p className="text-sm font-bold text-body">Game alerts</p>
          <p className="text-xs text-muted">Get notified when the game starts, restarts, or ends</p>
        </div>
      </div>
      <Switch on={on} onToggle={() => void toggle()} disabled={busy} label="Game alerts" />
    </section>
  )
}

function ThemeRow() {
  const { theme, toggle } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted ? theme === 'dark' : false

  return (
    <section className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="fr-glyph text-[var(--primary)] flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
          <Glyph icon={isDark ? Moon02Icon : Sun01Icon} size={18} />
        </span>
        <div>
          <p className="text-sm font-bold text-body">Appearance</p>
          <p className="text-xs text-muted">{isDark ? 'Dark' : 'Light'} mode</p>
        </div>
      </div>
      <Switch on={isDark} onToggle={toggle} label="Dark mode" />
    </section>
  )
}

function SoundRow() {
  const [muted, setMuted] = useState(false)
  useEffect(() => {
    setMuted(isSoundMuted())
    return subscribeSoundMuted(setMuted)
  }, [])

  return (
    <section className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="fr-glyph text-[var(--primary)] flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
          <Glyph icon={muted ? VolumeOffIcon : VolumeHighIcon} size={18} />
        </span>
        <div>
          <p className="text-sm font-bold text-body">Sound effects</p>
          <p className="text-xs text-muted">{muted ? 'Off' : 'On'} — game sounds and alerts</p>
        </div>
      </div>
      <Switch on={!muted} onToggle={() => setSoundMuted(!muted)} label="Sound effects" />
    </section>
  )
}

function Switch({
  on,
  onToggle,
  label,
  disabled = false,
}: {
  on: boolean
  onToggle: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className={[
        'flex h-7 w-[3.25rem] shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 cursor-pointer disabled:opacity-50',
        on ? 'bg-[var(--primary)]' : 'bg-[var(--surface-inset-bg)] border border-[var(--border-strong)]',
      ].join(' ')}
    >
      <span
        className={[
          'h-6 w-6 rounded-full bg-white shadow transition-transform duration-200',
          on ? 'translate-x-[1.5rem]' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}
