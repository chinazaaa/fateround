import { StyleSheet, Text, View } from 'react-native'
import { UNO_GAME_DURATION_OPTIONS, formatUnoGameDuration } from '@fateround/shared/uno'
import { turnTimerOptionsFor, formatBoardGameTurnTimer } from '@fateround/shared/create-board-games'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Editable UNO lobby fields — PHASE 1 (core) toggles only: WD4 challenge, stacking,
 * the 0/7 rule, and the missed-"UNO" call penalty size. Multi-Play / Team-Up / Jump-In
 * are Phase 2 and have no control here (see packages/shared/src/uno.ts header note).
 */
export type UnoRulesState = {
  timerSeconds: number
  gameDurationSeconds: number
  wd4Challenge: boolean
  stacking: boolean
  zeroSeven: boolean
  unoPenalty: number
}

type Props = {
  value: UnoRulesState
  onChange: (patch: Partial<UnoRulesState>) => void
}

export function UnoRulesSection({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Turn timer"
        value={value.timerSeconds}
        options={turnTimerOptionsFor('uno')}
        format={formatBoardGameTurnTimer}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />

      <View style={styles.field}>
        <Text style={styles.label}>Game length</Text>
        <SegmentedControl
          value={String(value.gameDurationSeconds)}
          options={UNO_GAME_DURATION_OPTIONS.map((seconds) => ({
            value: String(seconds),
            label: formatUnoGameDuration(seconds),
          }))}
          onChange={(v) => onChange({ gameDurationSeconds: Number(v) })}
        />
      </View>

      <Text style={styles.label}>House rules</Text>
      <View style={styles.toggles}>
        <SettingToggle
          label="Wild Draw Four challenge"
          description="Let the next player challenge a Wild Draw Four instead of drawing"
          value={value.wd4Challenge}
          onChange={(wd4Challenge) => onChange({ wd4Challenge })}
        />
        <SettingToggle
          label="Stacking"
          description="Stack Draw Two on Draw Two, Wild Draw Four on Wild Draw Four"
          value={value.stacking}
          onChange={(stacking) => onChange({ stacking })}
        />
        <SettingToggle
          label="0 / 7 rule"
          description="0 passes every hand on, 7 swaps hands with a player"
          value={value.zeroSeven}
          onChange={(zeroSeven) => onChange({ zeroSeven })}
        />
        <SettingToggle
          label="Double penalty"
          description="Missed UNO calls draw 4 cards instead of 2"
          value={value.unoPenalty === 4}
          onChange={(on) => onChange({ unoPenalty: on ? 4 : 2 })}
        />
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    field: { gap: theme.space.sm },
    label: { color: theme.text, fontSize: 16, fontWeight: '800' },
    toggles: { gap: theme.space.sm },
  })
