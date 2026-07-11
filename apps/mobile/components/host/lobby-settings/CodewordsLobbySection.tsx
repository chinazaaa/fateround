import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { CODEWORDS_TIMER_OPTIONS, formatPollRoundTimer } from '@fateround/shared/create-party-games'
import { TimerPicker } from '@/components/create/TimerPicker'
import { theme } from '@/constants/theme'

export type CodewordsLobbyState = {
  spymasterTimer: number
  operativeTimer: number
}

export function isCodewordsLobbyGame(gameType: GameType): boolean {
  return gameType === 'codewords'
}

type Props = {
  value: CodewordsLobbyState
  onChange: (patch: Partial<CodewordsLobbyState>) => void
  canShuffle: boolean
  shuffling: boolean
  onShuffle: () => void
}

export function CodewordsLobbySection({ value, onChange, canShuffle, shuffling, onShuffle }: Props) {
  return (
    <View style={styles.wrap}>
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

const styles = StyleSheet.create({
  wrap: { gap: theme.space.md },
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
