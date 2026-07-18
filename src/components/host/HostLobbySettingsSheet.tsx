'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useTheme } from '@/components/ThemeProvider'
import { isSoundMuted, setSoundMuted, subscribeSoundMuted } from '@/lib/sounds'

/**
 * The shared in-game ⚙ settings sheet — used by the lobby AND the in-game chrome
 * (via GameChromeSettings). Holds the app-level controls (light/dark, sound), then
 * any caller-supplied settings as `children` (theme picker, transfer host, edit
 * questions, …). Light/dark lives here (not a floating toggle) so the in-game
 * chrome stays clean and nothing overlaps the top bar.
 */
export function HostLobbySettingsSheet({
  open,
  onClose,
  title = 'Settings',
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children?: React.ReactNode
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-6">
        <ThemeRow />
        <SoundRow />
        {children ? <div className="space-y-4 border-t border-[var(--border)] pt-6">{children}</div> : null}
      </div>
    </Modal>
  )
}

function ThemeRow() {
  const { theme, toggle } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted ? theme === 'dark' : false

  return (
    <section className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
          {isDark ? <MoonIcon /> : <SunIcon />}
        </span>
        <div>
          <p className="text-sm font-semibold text-body">Appearance</p>
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
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
          {muted ? <SpeakerOffIcon /> : <SpeakerIcon />}
        </span>
        <div>
          <p className="text-sm font-semibold text-body">Sound effects</p>
          <p className="text-xs text-muted">{muted ? 'Off' : 'On'} — game sounds and alerts</p>
        </div>
      </div>
      <Switch on={!muted} onToggle={() => setSoundMuted(!muted)} label="Sound effects" />
    </section>
  )
}

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={[
        'flex h-7 w-[3.25rem] shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
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

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function SpeakerOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}
