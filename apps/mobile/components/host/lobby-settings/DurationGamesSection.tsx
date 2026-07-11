import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  MATCHING_PAIRS_GAME_DURATION_OPTIONS,
  SUDOKU_GAME_DURATION_OPTIONS,
  formatMatchingPairsGameDuration,
  formatQuickDrawTurnTimer,
  formatSudokuGameDuration,
} from '@fateround/shared/create-party-games'
import { WORD_HUNT_TIMER_OPTIONS } from '@fateround/shared/word-hunt'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { TimerPicker } from '@/components/create/TimerPicker'
import { theme } from '@/constants/theme'

export type DurationGameState = {
  /** word_hunt / matching_pairs time limit */
  timerSeconds: number
  /** sudoku max time */
  gameDurationSeconds: number
  /** matching_pairs 8×4 grid */
  largeGrid: boolean
}

export function isDurationGame(gameType: GameType): boolean {
  return gameType === 'sudoku' || gameType === 'word_hunt' || gameType === 'matching_pairs'
}

type Props = {
  gameType: GameType
  value: DurationGameState
  onChange: (patch: Partial<DurationGameState>) => void
}

export function DurationGamesSection({ gameType, value, onChange }: Props) {
  if (gameType === 'sudoku') {
    return (
      <TimerPicker
        label="Max time limit"
        value={value.gameDurationSeconds}
        options={SUDOKU_GAME_DURATION_OPTIONS}
        format={formatSudokuGameDuration}
        onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
      />
    )
  }

  if (gameType === 'word_hunt') {
    return (
      <TimerPicker
        label="Time limit"
        value={value.timerSeconds}
        options={WORD_HUNT_TIMER_OPTIONS}
        format={formatQuickDrawTurnTimer}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
    )
  }

  // matching_pairs
  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Time limit"
        value={value.timerSeconds}
        options={MATCHING_PAIRS_GAME_DURATION_OPTIONS}
        format={formatMatchingPairsGameDuration}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
      <View style={styles.field}>
        <Text style={styles.label}>Grid size</Text>
        <SegmentedControl
          value={value.largeGrid ? 'large' : 'standard'}
          options={[
            { value: 'standard', label: 'Standard', hint: '4×4 grid (8 pairs)' },
            { value: 'large', label: 'Large', hint: '8×4 grid (16 pairs)' },
          ]}
          onChange={(v) => onChange({ largeGrid: v === 'large' })}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.md },
  field: { gap: theme.space.sm },
  label: { color: theme.text, fontSize: 16, fontWeight: '800' },
})
