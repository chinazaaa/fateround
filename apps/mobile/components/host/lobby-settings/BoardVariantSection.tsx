import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  LUDO_VARIANT_OPTIONS,
  formatAyoClockLabel,
  formatBoardGameTurnTimer,
  turnTimerOptionsFor,
} from '@fateround/shared/create-board-games'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type BoardVariantState = {
  timerSeconds: number
  ludoVariant: 'modern' | 'traditional'
  ayoVariant: 'traditional' | 'oware'
}

export function isBoardVariantGame(gameType: GameType): boolean {
  return gameType === 'ludo' || gameType === 'ayo'
}

type Props = {
  gameType: GameType
  value: BoardVariantState
  onChange: (patch: Partial<BoardVariantState>) => void
}

export function BoardVariantSection({ gameType, value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const isLudo = gameType === 'ludo'

  return (
    <View style={styles.wrap}>
      {isLudo ? (
        <View style={styles.field}>
          <Text style={styles.label}>Rules</Text>
          <SegmentedControl
            value={value.ludoVariant}
            options={LUDO_VARIANT_OPTIONS.map((o) => ({ value: o.value, label: o.label, hint: o.hint }))}
            onChange={(v) => onChange({ ludoVariant: v as BoardVariantState['ludoVariant'] })}
          />
        </View>
      ) : null}

      <TimerPicker
        label={isLudo ? 'Turn timer' : 'Time per player'}
        value={value.timerSeconds}
        options={turnTimerOptionsFor(isLudo ? 'ludo' : 'ayo')}
        format={isLudo ? formatBoardGameTurnTimer : formatAyoClockLabel}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    field: { gap: theme.space.sm },
    label: { color: theme.text, fontSize: 16, fontWeight: '800' },
  })
