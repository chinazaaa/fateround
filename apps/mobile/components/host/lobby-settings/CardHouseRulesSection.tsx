import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { CRAZY8_GAME_DURATION_OPTIONS } from '@fateround/shared/crazy-eights'
import { WHOT_GAME_DURATION_OPTIONS } from '@fateround/shared/whot'
import {
  formatBoardGameTurnTimer,
  formatSessionDuration,
  turnTimerOptionsFor,
} from '@fateround/shared/create-board-games'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import { theme } from '@/constants/theme'

/** Editable card-game lobby fields (Whot / Crazy Eights) — routed via lobby-settings. */
export type CardHouseRulesState = {
  timerSeconds: number
  gameDurationSeconds: number
  whotPick3Enabled: boolean
  whotPick2Stacking: boolean
  whotCardsEnabled: boolean
  whotNumberCallsEnabled: boolean
  crazy8ActionCards: boolean
  crazy8Jokers: boolean
  crazy8Pick2Stacking: boolean
}

export function isCardHouseRuleGame(gameType: GameType): boolean {
  return gameType === 'whot' || gameType === 'crazy_eights'
}

type Props = {
  gameType: GameType
  value: CardHouseRulesState
  onChange: (patch: Partial<CardHouseRulesState>) => void
}

export function CardHouseRulesSection({ gameType, value, onChange }: Props) {
  const isWhot = gameType === 'whot'
  const durationOptions = isWhot ? WHOT_GAME_DURATION_OPTIONS : CRAZY8_GAME_DURATION_OPTIONS

  return (
    <View style={styles.wrap}>
      <TimerPicker
        label="Turn timer"
        value={value.timerSeconds}
        options={turnTimerOptionsFor(isWhot ? 'whot' : 'crazy_eights')}
        format={formatBoardGameTurnTimer}
        onChange={(timerSeconds) => onChange({ timerSeconds })}
      />

      <View style={styles.field}>
        <Text style={styles.label}>Game length</Text>
        <SegmentedControl
          value={String(value.gameDurationSeconds)}
          options={durationOptions.map((seconds) => ({
            value: String(seconds),
            label: formatSessionDuration(seconds),
          }))}
          onChange={(v) => onChange({ gameDurationSeconds: Number(v) })}
        />
      </View>

      <Text style={styles.label}>House rules</Text>
      <View style={styles.toggles}>
        {isWhot ? (
          <>
            <SettingToggle
              label="Pick 3"
              description="Play the Pick 3 draw penalty on 5s"
              value={value.whotPick3Enabled}
              onChange={(whotPick3Enabled) => onChange({ whotPick3Enabled })}
            />
            <SettingToggle
              label="Stack Pick 2"
              description="Defend a Pick 2 with your own 2"
              value={value.whotPick2Stacking}
              onChange={(whotPick2Stacking) => onChange({ whotPick2Stacking })}
            />
            <SettingToggle
              label="WHOT cards"
              description="Include WHOT wild cards in the deck"
              value={value.whotCardsEnabled}
              onChange={(whotCardsEnabled) => onChange({ whotCardsEnabled })}
            />
            <SettingToggle
              label="Numbers on WHOT"
              description="Call a number when playing WHOT"
              value={value.whotNumberCallsEnabled}
              onChange={(whotNumberCallsEnabled) => onChange({ whotNumberCallsEnabled })}
              disabled={!value.whotCardsEnabled}
            />
          </>
        ) : (
          <>
            <SettingToggle
              label="Action cards"
              description="2 / J / Q / A effects (8 stays wild either way)"
              value={value.crazy8ActionCards}
              onChange={(crazy8ActionCards) => onChange({ crazy8ActionCards })}
            />
            <SettingToggle
              label="Jokers"
              description="Include 2 jokers (wild + draw 5)"
              value={value.crazy8Jokers}
              onChange={(crazy8Jokers) => onChange({ crazy8Jokers })}
            />
            <SettingToggle
              label="Stack Pick 2"
              description="Defend a Pick 2 with your own 2"
              value={value.crazy8Pick2Stacking}
              onChange={(crazy8Pick2Stacking) => onChange({ crazy8Pick2Stacking })}
            />
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.md },
  field: { gap: theme.space.sm },
  label: { color: theme.text, fontSize: 16, fontWeight: '800' },
  toggles: { gap: theme.space.sm },
})
