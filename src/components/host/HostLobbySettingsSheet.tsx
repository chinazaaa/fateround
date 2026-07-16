'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { isSoundMuted, setSoundMuted, subscribeSoundMuted } from '@/lib/sounds'

/**
 * The lobby's ⚙ settings sheet — mirrors the mobile app-level SettingsSheet's Sound row,
 * then any game-specific settings the host passes in as `children` (theme picker, edit
 * questions, transfer host, …). Light/dark lives in the lobby top bar (like the app
 * header), not here.
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
        <SoundRow />
        {children ? <div className="space-y-4 border-t border-[var(--border)] pt-6">{children}</div> : null}
      </div>
    </Modal>
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
