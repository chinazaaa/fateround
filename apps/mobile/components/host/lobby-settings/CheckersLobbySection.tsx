import { StyleSheet, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { formatChessClockLabel, turnTimerOptionsFor } from '@fateround/shared/create-board-games'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type CheckersLobbyState = {
  timerSeconds: number
  /** Nigerian Draughts only — opt-in "Street Rules" (huffing) house rule. */
  checkersNigeriaStreetRules: boolean
}

export function isCheckersLobbyGame(gameType: GameType): boolean {
  return gameType === 'checkers' || gameType === 'checkers_international' || gameType === 'checkers_nigeria'
}

type Props = {
  gameType: GameType
  value: CheckersLobbyState
  onChange: (patch: Partial<CheckersLobbyState>) => void
}

export function CheckersLobbySection({ gameType, value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Time per player"
        value={value.timerSeconds}
        options={turnTimerOptionsFor('checkers')}
        format={formatChessClockLabel}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />
      {gameType === 'checkers_nigeria' ? (
        <View style={styles.toggles}>
          <SettingToggle
            label="Street Rules"
            description="Capturing stays optional — decline one and your opponent may huff (remove) the piece instead of moving"
            value={value.checkersNigeriaStreetRules}
            onChange={(checkersNigeriaStreetRules) => onChange({ checkersNigeriaStreetRules })}
          />
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    toggles: { gap: theme.space.xs },
  })
