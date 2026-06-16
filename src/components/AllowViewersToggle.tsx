'use client'

import { SegmentedControl } from '@/components/ui/CreateWizard'
import type { LateJoinPolicy } from '@/lib/viewers'

export function LateJoinPolicyToggle({
  value,
  onChange,
  disabled,
}: {
  value: LateJoinPolicy
  onChange: (value: LateJoinPolicy) => void
  disabled?: boolean
}) {
  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : undefined}>
      <SegmentedControl
        value={value}
        onChange={(v) => onChange(v as LateJoinPolicy)}
        options={[
          {
            value: 'lobby_only',
            label: 'Lobby only',
            hint: 'No one can join after the game starts',
          },
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
        ]}
      />
    </div>
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
