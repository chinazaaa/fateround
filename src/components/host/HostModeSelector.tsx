'use client'

import { CheckIcon, EyeIcon, PlayIcon } from '@/components/host/host-icons'

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
  spectatorLabel = 'Host only',
  spectatorHint = 'Watch from the Watch tab',
  playerLabel = 'Host + play',
  playerHint = 'Play tab + Manage tab',
  playingNote,
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
  spectatorLabel?: string
  spectatorHint?: string
  playerLabel?: string
  playerHint?: string
  /** Replaces the default "Playing as …" note once the host has joined as a player. */
  playingNote?: React.ReactNode
  /** Render without the outer card + "Host mode" label — for embedding in a settings section. */
  bare?: boolean
}) {
  const Wrapper = bare ? 'section' : 'div'
  return (
    <Wrapper className={bare ? 'space-y-3' : 'glass-card-strong p-5 space-y-3'}>
      {!bare && <p className="label-caps">Host mode</p>}
      <div className="grid grid-cols-2 gap-3">
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

      {mode === 'player' && !joinedPlayerId && (
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
      )}

      {mode === 'player' &&
        joinedPlayerId &&
        (playingNote ?? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] px-3 py-2 text-sm">
            <span className="text-[var(--primary)]">
              <CheckIcon size={14} />
            </span>
            <span className="text-body">
              Playing as <span className="font-semibold">{joinedPlayerName}</span>
            </span>
          </div>
        ))}
    </Wrapper>
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
        'relative rounded-2xl border-2 p-4 text-left transition-all duration-200 disabled:opacity-60',
        active
          ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_7%,var(--card-strong))] shadow-[var(--card-shadow-glow)]'
          : 'border-[var(--border-strong)] hover:bg-[var(--card-hover)]',
      ].join(' ')}
    >
      {active && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-[0_2px_8px_var(--primary-glow)]">
          <CheckIcon size={12} />
        </span>
      )}
      <span
        className={[
          'mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
          active
            ? 'bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]'
            : 'bg-[var(--surface-inset-bg)] text-faint',
        ].join(' ')}
      >
        {icon}
      </span>
      <span className={`block text-base font-bold ${active ? 'text-body' : ''}`}>{label}</span>
      <span className="text-faint text-xs">{hint}</span>
    </button>
  )
}
