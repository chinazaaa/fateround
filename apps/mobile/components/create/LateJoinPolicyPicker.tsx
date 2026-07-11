import type { GameType } from '@fateround/shared'
import type { LateJoinPolicy } from '@fateround/shared/viewers'
import {
  clampLateJoinPolicyForGameType,
  gameAllowsLatePlayerJoin,
  gameSupportsViewerSetting,
} from '@fateround/shared/viewers'
import { SegmentedControl, type SegmentOption } from '@/components/create/SegmentedControl'

const LATE_JOIN_OPTIONS: SegmentOption<LateJoinPolicy>[] = [
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
    label: 'Watch & play',
    hint: 'Late joiners choose to watch or join as a player',
  },
]

type Props = {
  gameType: GameType
  value: LateJoinPolicy
  onChange: (value: LateJoinPolicy) => void
}

export function LateJoinPolicyPicker({ gameType, value, onChange }: Props) {
  if (!gameSupportsViewerSetting(gameType)) return null

  const options = gameAllowsLatePlayerJoin(gameType)
    ? LATE_JOIN_OPTIONS
    : LATE_JOIN_OPTIONS.filter((option) => option.value !== 'viewers_and_players')

  const effective = clampLateJoinPolicyForGameType(value, gameType)

  return <SegmentedControl value={effective} options={options} onChange={onChange} />
}
