'use client'

import { LeaderboardJoinNote } from '@/components/game-lobby/LeaderboardJoinNote'

type Props = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  joining?: boolean
  submitLabel?: string
  joiningLabel?: string
  placeholder?: string
  label?: string
  hint?: React.ReactNode
  footer?: React.ReactNode
  disabled?: boolean
  // When set, shows a note that winning this game lands the player on the
  // community leaderboard (only if the game type is actually tracked there). May be
  // several entries for role-based games that feed more than one leaderboard row.
  gameType?: string | string[]
  // When the lobby is full, `onJoinAsViewer` (paired with `lobbyFull`) surfaces a
  // secondary "watch instead" action so the player isn't left at a dead end.
  lobbyFull?: boolean
  onJoinAsViewer?: () => void
  watchLabel?: string
}

export function NameJoinForm({
  value,
  onChange,
  onSubmit,
  joining = false,
  submitLabel = 'Join game',
  joiningLabel = 'Joining…',
  placeholder = 'Your name',
  label = 'Your name',
  hint,
  footer,
  disabled = false,
  gameType,
  lobbyFull = false,
  onJoinAsViewer,
  watchLabel = 'Watch instead',
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        {label ? <label className="label-caps block mb-2">{label}</label> : null}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !disabled && !joining && value.trim() && onSubmit()}
          placeholder={placeholder}
          className="input-field w-full"
          maxLength={10}
          autoComplete="name"
        />
      </div>
      {gameType ? <LeaderboardJoinNote gameType={gameType} /> : null}
      {hint ? <div className="text-faint text-xs leading-relaxed">{hint}</div> : null}
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || joining || !value.trim()}
        className="btn-primary w-full"
      >
        {joining ? joiningLabel : submitLabel}
      </button>
      {lobbyFull && onJoinAsViewer ? (
        <div className="space-y-2">
          <p className="text-faint text-xs text-center">
            This game is full — all seats are taken. You can still watch.
          </p>
          <button
            type="button"
            onClick={onJoinAsViewer}
            disabled={disabled || joining || !value.trim()}
            className="btn-secondary w-full"
          >
            {watchLabel}
          </button>
        </div>
      ) : null}
      {footer}
    </div>
  )
}
