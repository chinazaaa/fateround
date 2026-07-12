import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { CODEWORDS_TIMER_OPTIONS, formatPollRoundTimer } from '@fateround/shared/create-party-games'
import { TimerPicker } from '@/components/create/TimerPicker'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type CodewordsLobbyState = {
  spymasterTimer: number
  operativeTimer: number
}

export function isCodewordsLobbyGame(gameType: GameType): boolean {
  return gameType === 'codewords'
}

type FirstTeam = 'random' | 'red' | 'blue'

const FIRST_TEAM_OPTIONS: { value: FirstTeam; label: string }[] = [
  { value: 'random', label: '🎲 Random' },
  { value: 'red', label: '🔴 Red' },
  { value: 'blue', label: '🔵 Blue' },
]

type Props = {
  value: CodewordsLobbyState
  onChange: (patch: Partial<CodewordsLobbyState>) => void
  canShuffle: boolean
  shuffling: boolean
  onShuffle: () => void
  firstTeam?: FirstTeam
  onFirstTeamChange?: (team: FirstTeam) => void
}

export function CodewordsLobbySection({
  value,
  onChange,
  canShuffle,
  shuffling,
  onShuffle,
  firstTeam = 'random',
  onFirstTeamChange,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
      {onFirstTeamChange ? (
        <View style={styles.field}>
          <Text style={styles.label}>Goes first</Text>
          <SegmentedControl value={firstTeam} options={FIRST_TEAM_OPTIONS} onChange={onFirstTeamChange} />
        </View>
      ) : null}
      <TimerPicker
        label="Spymaster timer"
        value={value.spymasterTimer}
        options={CODEWORDS_TIMER_OPTIONS}
        format={formatPollRoundTimer}
        onChange={(spymasterTimer) => onChange({ spymasterTimer })}
      />
      <TimerPicker
        label="Operative timer"
        value={value.operativeTimer}
        options={CODEWORDS_TIMER_OPTIONS}
        format={formatPollRoundTimer}
        onChange={(operativeTimer) => onChange({ operativeTimer })}
      />
      {canShuffle ? (
        <Pressable style={[styles.shuffle, shuffling && styles.disabled]} disabled={shuffling} onPress={onShuffle}>
          <Text style={styles.shuffleText}>{shuffling ? 'Shuffling…' : '🔀 Shuffle teams & roles'}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.md },
  field: { gap: 6 },
  label: { color: theme.text, fontSize: 15, fontWeight: '600' },
  shuffle: {
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shuffleText: { color: theme.textSecondary, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
})
