import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { formatBoardGameTurnTimer, turnTimerOptionsFor } from '@fateround/shared/create-board-games'
import { MAHJONG_RULESETS, MAHJONG_RULESET_LABELS } from '@fateround/shared/mahjong-rulesets'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type MahjongLobbyState = {
  timerSeconds: number
  ruleset: string
}

export function isMahjongLobbyGame(gameType: GameType): boolean {
  return gameType === 'mahjong'
}

type Props = {
  value: MahjongLobbyState
  onChange: (patch: Partial<MahjongLobbyState>) => void
}

export function MahjongLobbySection({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Turn timer"
        value={value.timerSeconds}
        options={turnTimerOptionsFor('mahjong')}
        format={formatBoardGameTurnTimer}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
      <View style={styles.field}>
        <Text style={styles.label}>Ruleset</Text>
        <SegmentedControl
          value={value.ruleset}
          options={MAHJONG_RULESETS.map((id) => ({
            value: id,
            label: MAHJONG_RULESET_LABELS[id].label,
            hint: MAHJONG_RULESET_LABELS[id].description,
          }))}
          onChange={(ruleset) => onChange({ ruleset })}
        />
      </View>
      <Text style={styles.note}>Advanced rule options (riichi flags, limits) stay on web for now.</Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.md },
  field: { gap: theme.space.sm },
  label: { color: theme.text, fontSize: 16, fontWeight: '800' },
  note: { color: theme.textFaint, fontSize: 12, lineHeight: 17 },
})
