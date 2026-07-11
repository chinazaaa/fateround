import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  SCRABBLE_CLOCK_OPTIONS,
  SCRABBLE_GAME_DURATION_OPTIONS,
  formatScrabbleClockMinutes,
  formatSessionDuration,
  turnTimerOptionsFor,
} from '@fateround/shared/create-board-games'
import { SCRABBLE_DICTIONARY_LABELS, SCRABBLE_DICTIONARY_OPTIONS } from '@fateround/shared/scrabble-dictionary-meta'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { TimerPicker } from '@/components/create/TimerPicker'
import { theme } from '@/constants/theme'

export type ScrabbleLobbyState = {
  clockMode: 'standard' | 'chess'
  clockSeconds: number
  timerSeconds: number
  gameDurationSeconds: number
  dictionaryId: string
}

export function isScrabbleLobbyGame(gameType: GameType): boolean {
  return gameType === 'scrabble'
}

type Props = {
  value: ScrabbleLobbyState
  onChange: (patch: Partial<ScrabbleLobbyState>) => void
}

export function ScrabbleLobbySection({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>Game mode</Text>
        <SegmentedControl
          value={value.clockMode}
          options={[
            { value: 'standard', label: 'Normal', hint: 'Per-turn timer + optional game length cap' },
            { value: 'chess', label: 'Chess clock', hint: 'Per-player time bank — run out and you spectate' },
          ]}
          onChange={(v) => onChange({ clockMode: v as ScrabbleLobbyState['clockMode'] })}
        />
      </View>

      {value.clockMode === 'chess' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Time per player</Text>
          <SegmentedControl
            value={String(value.clockSeconds)}
            options={SCRABBLE_CLOCK_OPTIONS.map((s) => ({ value: String(s), label: formatScrabbleClockMinutes(s) }))}
            onChange={(v) => onChange({ clockSeconds: Number(v) })}
          />
        </View>
      ) : (
        <>
          <TimerPicker
            label="Time per turn"
            value={value.timerSeconds}
            options={turnTimerOptionsFor('scrabble')}
            format={(seconds) => (seconds ? `${seconds / 60} min` : 'No timer')}
            onChange={(timerSeconds) => onChange({ timerSeconds })}
          />
          <View style={styles.field}>
            <Text style={styles.label}>Game length</Text>
            <SegmentedControl
              value={String(value.gameDurationSeconds)}
              options={SCRABBLE_GAME_DURATION_OPTIONS.map((s) => ({ value: String(s), label: formatSessionDuration(s) }))}
              onChange={(v) => onChange({ gameDurationSeconds: Number(v) })}
            />
          </View>
        </>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>Dictionary</Text>
        <SegmentedControl
          value={value.dictionaryId}
          options={SCRABBLE_DICTIONARY_OPTIONS.map((id) => ({
            value: id,
            label: SCRABBLE_DICTIONARY_LABELS[id].split(' · ')[0] ?? id,
          }))}
          onChange={(v) => onChange({ dictionaryId: v })}
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
