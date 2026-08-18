import { StyleSheet, Text, View } from 'react-native'
import { UNO_GAME_DURATION_OPTIONS, formatUnoGameDuration, type UnoMultiPlayMode } from '@fateround/shared/uno'
import { turnTimerOptionsFor, formatBoardGameTurnTimer } from '@fateround/shared/create-board-games'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Editable UNO lobby fields — core toggles (WD4 challenge, stacking, 0/7 rule, missed-"UNO"
 * penalty size) plus Phase 2: Jump-In, Multi-Play, and Team-Up 2v2.
 */
export type UnoRulesState = {
  timerSeconds: number
  gameDurationSeconds: number
  wd4Challenge: boolean
  stacking: boolean
  zeroSeven: boolean
  unoPenalty: number
  jumpIn: boolean
  multiPlayMode: UnoMultiPlayMode
  teamMode: boolean
}

const MULTI_PLAY_OPTIONS: { value: UnoMultiPlayMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'same_color_or_number', label: 'Colour or number' },
  { value: 'same_color', label: 'Colour only' },
  { value: 'same_number', label: 'Number only' },
]

type Props = {
  value: UnoRulesState
  onChange: (patch: Partial<UnoRulesState>) => void
}

export function UnoRulesSection({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.wrap}>
      <SettingToggle
        label="Team-Up (2v2)"
        description="4 players in 2 teams of 2 — teammates sit across and share their hands; a team wins the moment either partner empties their hand."
        value={value.teamMode}
        onChange={(teamMode) => onChange({ teamMode })}
      />

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
          label="Draw 4 challenge"
          description="Let the next player challenge a Draw 4 instead of drawing"
          value={value.wd4Challenge}
          onChange={(wd4Challenge) => onChange({ wd4Challenge })}
        />
        <SettingToggle
          label="Stacking"
          description="Stack Draw 2 on Draw 2, Draw 4 on Draw 4"
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
          description="Missed last-card calls draw 4 cards instead of 2"
          value={value.unoPenalty === 4}
          onChange={(on) => onChange({ unoPenalty: on ? 4 : 2 })}
        />
        <SettingToggle
          label="Jump-In"
          description="Hold an exact match for the top card? Play it instantly, even out of turn"
          value={value.jumpIn}
          onChange={(jumpIn) => onChange({ jumpIn })}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Multi-Play</Text>
        <SegmentedControl
          value={value.multiPlayMode}
          options={MULTI_PLAY_OPTIONS}
          onChange={(v) => onChange({ multiPlayMode: v as UnoMultiPlayMode })}
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
