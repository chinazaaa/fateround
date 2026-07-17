'use client'

import { useState } from 'react'
import { CheckIcon, EyeIcon, PencilIcon, PlayIcon } from '@/components/host/host-icons'

/**
 * Lobby host-mode selector: "Host only" (watch) vs "Host + play" (join as a player).
 * Pure UI — localStorage persistence and the waiting-only / spectator→manage rules stay
 * in each game's view. Used while the game is in the lobby; lock it once started.
 */
export function HostModeSelector({
  mode,
  onChange,
  disabled = false,
  joinedPlayerId,
  joinedPlayerName,
  joinName,
  onJoinNameChange,
  onJoin,
  joining = false,
  onEditName,
  spectatorLabel = 'Host only',
  spectatorHint = 'Watch from the Watch tab',
  playerLabel = 'Host + play',
  playerHint = 'Play tab + Manage tab',
  playingNote,
  renderJoinForm,
  bare = false,
}: {
  mode: 'spectator' | 'player'
  onChange: (mode: 'spectator' | 'player') => void
  disabled?: boolean
  joinedPlayerId?: string | null
  joinedPlayerName?: string
  joinName: string
  onJoinNameChange: (name: string) => void
  onJoin: () => void
  joining?: boolean
  /** When set, the "Playing as …" note shows an Edit button to rename the host's seat. */
  onEditName?: (name: string) => void | Promise<void>
  spectatorLabel?: string
  spectatorHint?: string
  playerLabel?: string
  playerHint?: string
  /** Replaces the default "Playing as …" note once the host has joined as a player. */
  playingNote?: React.ReactNode
  /** Replaces the default name input with a game-specific join form (e.g. token picker). */
  renderJoinForm?: React.ReactNode
  /** Render without the outer card + "Host mode" label — for embedding in a settings section. */
  bare?: boolean
}) {
  const Wrapper = bare ? 'section' : 'div'
  return (
    <Wrapper className={bare ? 'space-y-2.5' : 'glass-card-strong p-4 space-y-2.5'}>
      {!bare && <p className="label-caps">Host mode</p>}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <HostModeOption
          active={mode === 'spectator'}
          disabled={disabled}
          onClick={() => onChange('spectator')}
          icon={<EyeIcon size={18} />}
          label={spectatorLabel}
          hint={spectatorHint}
        />
        <HostModeOption
          active={mode === 'player'}
          disabled={disabled}
          onClick={() => onChange('player')}
          icon={<PlayIcon size={18} />}
          label={playerLabel}
          hint={playerHint}
        />
      </div>

      {mode === 'player' &&
        !joinedPlayerId &&
        (renderJoinForm ?? (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={joinName}
              onChange={(e) => onJoinNameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onJoin()}
              placeholder="Your name"
              className="input-field flex-1"
              maxLength={40}
              disabled={disabled}
            />
            <button
              type="button"
              onClick={onJoin}
              disabled={disabled || !joinName.trim() || joining}
              className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
            >
              {joining ? 'Joining…' : 'Join'}
            </button>
          </div>
        ))}

      {mode === 'player' && joinedPlayerId && (
        <div className="space-y-2">
          {playingNote ?? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] px-3 py-2 text-sm">
              <span className="text-[var(--primary)]">
                <CheckIcon size={14} />
              </span>
              <span className="text-body">
                Playing as <span className="font-semibold">{joinedPlayerName}</span>
              </span>
            </div>
          )}
          {onEditName && <HostEditNameRow name={joinedPlayerName ?? ''} onEditName={onEditName} disabled={disabled} />}
        </div>
      )}
    </Wrapper>
  )
}

/**
 * "Edit your name" affordance shown under the "Playing as …" note. Collapsed to a
 * subtle button; expands to an inline input + Save/Cancel. Rendered separately from
 * playingNote so it appears for every game regardless of a custom note.
 */
function HostEditNameRow({
  name,
  onEditName,
  disabled,
}: {
  name: string
  onEditName: (name: string) => void | Promise<void>
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)

  const startEditing = () => {
    setDraft(name)
    setEditing(true)
  }

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      await onEditName(trimmed)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder="Your name"
          className="input-field flex-1"
          maxLength={40}
          disabled={saving}
          autoFocus
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !draft.trim()}
          className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="btn-ghost btn-fit shrink-0 px-3 py-2.5 text-sm"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] disabled:opacity-60"
    >
      <PencilIcon size={13} />
      Edit your name
    </button>
  )
}

function HostModeOption({
  active,
  disabled,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={[
        'relative flex items-center gap-2.5 rounded-2xl border-2 px-3 py-2.5 text-left transition-all duration-200 disabled:opacity-60',
        active
          ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_7%,var(--card-strong))] shadow-[var(--card-shadow-glow)]'
          : 'border-[var(--border-strong)] hover:bg-[var(--card-hover)]',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors',
          active
            ? 'bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]'
            : 'bg-[var(--surface-inset-bg)] text-faint',
        ].join(' ')}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-bold leading-tight ${active ? 'text-body' : ''}`}>{label}</span>
        <span className="text-faint text-xs leading-tight">{hint}</span>
      </span>
      {active && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-[0_2px_8px_var(--primary-glow)]">
          <CheckIcon size={10} />
        </span>
      )}
    </button>
  )
}
