import { View, StyleSheet } from 'react-native'
import type { GameType } from '@fateround/shared'
import { formatPollRoundTimer } from '@fateround/shared/create-party-games'
import {
  NPAT_GAME_DURATION_OPTIONS,
  NPAT_MARKING_TIMER_OPTIONS,
  NPAT_TIMER_OPTIONS,
  formatNpatGameDuration,
} from '@fateround/shared/npat'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type ICallOnLobbyState = {
  gameDurationSeconds: number
  timerSeconds: number
  markingTimer: number
}

export function isICallOnLobbyGame(gameType: GameType): boolean {
  return gameType === 'i_call_on'
}

type Props = {
  value: ICallOnLobbyState
  onChange: (patch: Partial<ICallOnLobbyState>) => void
}

export function ICallOnLobbySection({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Game length"
        value={value.gameDurationSeconds}
        options={NPAT_GAME_DURATION_OPTIONS}
        format={formatNpatGameDuration}
        onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
      />
      <TimerPicker
        label="Writing time"
        value={value.timerSeconds}
        options={NPAT_TIMER_OPTIONS}
        format={formatPollRoundTimer}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
      <TimerPicker
        label="Marking time"
        value={value.markingTimer}
        options={NPAT_MARKING_TIMER_OPTIONS}
        format={formatPollRoundTimer}
        onChange={(markingTimer) => onChange({ markingTimer })}
      />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.md },
})
