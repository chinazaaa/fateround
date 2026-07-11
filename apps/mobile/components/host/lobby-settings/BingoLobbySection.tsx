import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { BINGO_CALL_INTERVAL_OPTIONS } from '@fateround/shared/create-party-games'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type BingoLobbyState = {
  callMode: 'manual' | 'auto'
  callInterval: number
}

export function isBingoLobbyGame(gameType: GameType): boolean {
  return gameType === 'bingo'
}

type Props = {
  value: BingoLobbyState
  onChange: (patch: Partial<BingoLobbyState>) => void
}

export function BingoLobbySection({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Text style={styles.label}>Number calling</Text>
        <SegmentedControl
          value={value.callMode}
          options={[
            { value: 'manual', label: 'Manual', hint: 'You tap to call each number' },
            { value: 'auto', label: 'Automatic', hint: 'Numbers called for you' },
          ]}
          onChange={(v) => onChange({ callMode: v as BingoLobbyState['callMode'] })}
        />
      </View>
      {value.callMode === 'auto' ? (
        <TimerPicker
          label="Seconds between calls"
          value={value.callInterval}
          options={BINGO_CALL_INTERVAL_OPTIONS}
          format={(seconds) => `${seconds}s`}
          onChange={(callInterval) => onChange({ callInterval })}
        />
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.md },
  field: { gap: theme.space.sm },
  label: { color: theme.text, fontSize: 16, fontWeight: '800' },
})
