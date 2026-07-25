import { StyleSheet, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import {
  PING_PONG_POINTS_OPTIONS,
  PING_PONG_GAME_DURATION_OPTIONS,
  formatPingPongDuration,
} from '@fateround/shared/ping-pong'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type PingPongLobbyState = {
  pointsToWin: number
  gameDurationSeconds: number
}

export function isPingPongLobbyGame(gameType: GameType): boolean {
  return gameType === 'ping_pong'
}

type Props = {
  value: PingPongLobbyState
  onChange: (patch: Partial<PingPongLobbyState>) => void
}

export function PingPongLobbySection({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Points to win"
        value={value.pointsToWin}
        options={PING_PONG_POINTS_OPTIONS}
        format={(pts) => `${pts} pts`}
        onChange={(pointsToWin) => onChange({ pointsToWin })}
      />
      <TimerPicker
        label="Match timer"
        value={value.gameDurationSeconds}
        options={PING_PONG_GAME_DURATION_OPTIONS}
        format={formatPingPongDuration}
        onChange={(gameDurationSeconds) => onChange({ gameDurationSeconds })}
      />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
  })
