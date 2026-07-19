'use client'

import { SegmentedControl } from '@/components/ui/CreateWizard'
import { Field } from '@/components/ui/PageShell'
import { gameAllowsLatePlayerJoin, clampLateJoinPolicyForGameType, type LateJoinPolicy } from '@/lib/viewers'
import type { GameType } from '@/types'

const LATE_JOIN_OPTIONS: {
  value: LateJoinPolicy
  label: string
  hint: string
}[] = [
  // "Lobby only" removed from the UI — games are now either view-only or view+play.
  // {
  //   value: 'lobby_only',
  //   label: 'Lobby only',
  //   hint: 'No one can join after the game starts',
  // },
  {
    value: 'viewers_only',
    label: 'Viewers only',
    hint: 'Late joiners can watch live — not play',
  },
  {
    value: 'viewers_and_players',
    label: 'Viewers & players',
    hint: 'Late joiners choose to watch or join as a player',
  },
]

export function LateJoinPolicyToggle({
  value,
  onChange,
  disabled,
  gameType,
}: {
  value: LateJoinPolicy
  onChange: (value: LateJoinPolicy) => void
  disabled?: boolean
  gameType?: GameType
}) {
  // View-only games (board games etc.) have no view+play choice to make now that
  // "Lobby only" is gone — there's nothing to toggle, so render nothing.
  if (gameType && !gameAllowsLatePlayerJoin(gameType)) return null

  const options = LATE_JOIN_OPTIONS

  const effectiveValue = gameType ? clampLateJoinPolicyForGameType(value, gameType) : value

  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : undefined}>
      <SegmentedControl value={effectiveValue} onChange={(v) => onChange(v as LateJoinPolicy)} options={options} />
    </div>
  )
}

/**
 * The "Late joiners" labeled field used on the create screen. Hides itself
 * entirely for view-only games, since those have no view-vs-play choice to make.
 */
export function LateJoinField({
  value,
  onChange,
  gameType,
}: {
  value: LateJoinPolicy
  onChange: (value: LateJoinPolicy) => void
  gameType?: GameType
}) {
  if (gameType && !gameAllowsLatePlayerJoin(gameType)) return null
  return (
    <Field label="Late joiners">
      <LateJoinPolicyToggle value={value} onChange={onChange} gameType={gameType} />
    </Field>
  )
}

/** @deprecated Use LateJoinPolicyToggle */
export function AllowViewersToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <LateJoinPolicyToggle
      value={value ? 'viewers_and_players' : 'lobby_only'}
      onChange={(policy) => onChange(policy !== 'lobby_only')}
      disabled={disabled}
    />
  )
}
