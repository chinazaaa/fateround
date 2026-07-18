'use client'

import { useState, type ReactNode } from 'react'

/**
 * Body of the host's ⚙ game-settings sheet for an active Whot room — rendered
 * inside the main chrome's single settings sheet (`GameChromeSettings`) via
 * `GameSettingsContext`, mirroring the mobile host settings sheet.
 *
 * Holds an inline "Edit your name" control plus the game's own settings (late-join
 * rules · End game). Players are seen and removed from the roster side-drawer
 * (the header's people button), so there's no player list here.
 */
export function WhotHostSettings({
  hostName,
  onEditName,
  children,
}: {
  /** The host's current display name (seeds the edit field). */
  hostName?: string | null
  /** Persist a new host display name. */
  onEditName?: (name: string) => void
  /** Game settings body: late-join rules · How to play · End game. */
  children?: ReactNode
}) {
  return (
    <div className="space-y-4">
      {onEditName ? <EditNameRow name={hostName ?? ''} onSave={onEditName} /> : null}
      {children}
    </div>
  )
}

function EditNameRow({ name, onSave }: { name: string; onSave: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(name)
          setEditing(true)
        }}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] px-3.5 py-3 text-left transition-colors hover:border-[var(--border-strong)]"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-body">Your name</p>
          <p className="truncate text-xs text-muted">{name || 'Set a display name'}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-[var(--primary)]">Edit</span>
      </button>
    )
  }

  const commit = () => {
    const next = value.trim()
    if (next) onSave(next)
    setEditing(false)
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] px-3.5 py-3">
      <label className="mb-1.5 block text-sm font-semibold text-body">Your name</label>
      <input
        value={value}
        autoFocus
        maxLength={20}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        placeholder="Enter a display name"
        className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-body outline-none focus:border-[var(--primary)]"
      />
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={() => setEditing(false)} className="btn-secondary flex-1 py-2 text-sm">
          Cancel
        </button>
        <button type="button" onClick={commit} className="btn-primary flex-1 py-2 text-sm">
          Save name
        </button>
      </div>
    </div>
  )
}
