'use client'

import { useEffect, useRef } from 'react'

import { LeaderboardJoinNote } from '@/components/game-lobby/LeaderboardJoinNote'
import { getRememberedName, subscribeLocalIdentity } from '@/lib/identity-local'

/** Matches the input's `maxLength` — the remembered name may be longer than a player name. */
const NAME_MAX = 10

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
  /**
   * Prefill the name this device used last time. On by default — this form is the join
   * screen for every game outside the poll family, and retyping the same name into every
   * one of them is the exact thing the local identity record exists to stop.
   *
   * Turn it off for a form where an empty field is meaningful (renaming, or claiming a
   * specific pre-imported participant).
   */
  prefillRememberedName?: boolean
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
  prefillRememberedName = true,
}: Props) {
  // Refs, not deps: the subscription must not re-bind on every keystroke.
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // Once per mount, and never after the player touches the field — otherwise clearing the
  // box to type a different name would immediately refill it with the old one.
  const prefilledRef = useRef(false)
  const touchedRef = useRef(false)

  useEffect(() => {
    if (!prefillRememberedName) return
    const fill = () => {
      if (prefilledRef.current || touchedRef.current) return
      // Weakest source by design: only ever fills an EMPTY field, so a room link,
      // tournament name or resumed session always wins.
      if (valueRef.current.trim()) return
      const remembered = getRememberedName()
      if (!remembered) return
      prefilledRef.current = true
      onChangeRef.current(remembered.slice(0, NAME_MAX))
    }
    fill()
    // A signed-in player's name is written by `useProfile` after its fetch resolves, which
    // is later than this effect's first run — without the subscription the field would stay
    // empty for the whole visit even though the name is known.
    return subscribeLocalIdentity(fill)
  }, [prefillRememberedName])

  const handleChange = (next: string) => {
    touchedRef.current = true
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <div>
        {label ? <label className="label-caps block mb-2">{label}</label> : null}
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !disabled && !joining && value.trim() && onSubmit()}
          placeholder={placeholder}
          className="input-field w-full"
          maxLength={NAME_MAX}
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
