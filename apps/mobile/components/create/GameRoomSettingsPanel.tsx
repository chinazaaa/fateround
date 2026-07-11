import { StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { CRAZY8_GAME_DURATION_OPTIONS } from '@fateround/shared/crazy-eights'
import {
  CHESS_BOARD_THEME_OPTIONS,
  CHESS_PIECE_SET_OPTIONS,
  formatAyoClockLabel,
  formatBoardGameTurnTimer,
  formatChessClockLabel,
  formatScrabbleClockMinutes,
  formatSessionDuration,
  LUDO_VARIANT_OPTIONS,
  MONOPOLY_GAME_DURATION_OPTIONS,
  SCRABBLE_CLOCK_OPTIONS,
  SCRABBLE_GAME_DURATION_OPTIONS,
  turnTimerOptionsFor,
} from '@fateround/shared/create-board-games'
import { WHOT_GAME_DURATION_OPTIONS } from '@fateround/shared/whot'
import { MAHJONG_RULESET_LABELS, MAHJONG_RULESETS } from '@fateround/shared/mahjong-rulesets'
import {
  SCRABBLE_DICTIONARY_LABELS,
  SCRABBLE_DICTIONARY_OPTIONS,
} from '@fateround/shared/scrabble-dictionary-meta'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import {
  AYO_VARIANT_OPTIONS,
  boardGameTimerKey,
  hasGameRoomSettings,
  type GameRoomSettings,
} from '@/lib/create-settings/board-games'
import { gameLabel } from '@/lib/mobile-registry'

type Props = {
  gameType: GameType
  room: GameRoomSettings
  onChange: (patch: Partial<GameRoomSettings>) => void
}

export function GameRoomSettingsPanel({ gameType, room, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  if (!hasGameRoomSettings(gameType)) return null

  const timerKey = boardGameTimerKey(gameType)
  const title = `${gameLabel(gameType)} room`

  return (
    <SurfaceCard>
      <View style={styles.wrap}>
        <Text style={styles.heading}>{title}</Text>

        {gameType === 'ludo' ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Rules</Text>
              <SegmentedControl
                value={room.ludoVariant}
                options={LUDO_VARIANT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  hint: option.hint,
                }))}
                onChange={(value) => onChange({ ludoVariant: value as GameRoomSettings['ludoVariant'] })}
              />
            </View>
            {timerKey ? (
              <TimerPicker
                label="Turn timer"
                value={room.timerSeconds}
                options={turnTimerOptionsFor(timerKey)}
                format={formatBoardGameTurnTimer}
                onChange={(timerSeconds) => onChange({ timerSeconds })}
              />
            ) : null}
          </>
        ) : null}

        {gameType === 'snake_and_ladder' || gameType === 'yahtzee' || gameType === 'tic_tac_toe' ? (
          timerKey ? (
            <TimerPicker
              label="Turn timer"
              value={room.timerSeconds}
              options={turnTimerOptionsFor(timerKey)}
              format={formatBoardGameTurnTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
          ) : null
        ) : null}

        {gameType === 'chess' ? (
          <>
            <TimerPicker
              label="Time per player"
              value={room.timerSeconds}
              options={turnTimerOptionsFor('chess')}
              format={formatChessClockLabel}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Board</Text>
              <SegmentedControl
                value={room.chessBoardTheme}
                options={CHESS_BOARD_THEME_OPTIONS.map((option) => ({
                  value: option.id,
                  label: option.label,
                }))}
                onChange={(chessBoardTheme) => onChange({ chessBoardTheme })}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Pieces</Text>
              <SegmentedControl
                value={room.chessPieceSet}
                options={CHESS_PIECE_SET_OPTIONS.map((option) => ({
                  value: option.id,
                  label: option.label,
                }))}
                onChange={(chessPieceSet) => onChange({ chessPieceSet })}
              />
            </View>
          </>
        ) : null}

        {gameType === 'checkers' ? (
          <TimerPicker
            label="Time per player"
            value={room.timerSeconds}
            options={turnTimerOptionsFor('checkers')}
            format={formatChessClockLabel}
            onChange={(timerSeconds) => onChange({ timerSeconds })}
          />
        ) : null}

        {gameType === 'ayo' ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Rules</Text>
              <SegmentedControl
                value={room.ayoVariant}
                options={AYO_VARIANT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onChange={(value) => onChange({ ayoVariant: value as GameRoomSettings['ayoVariant'] })}
              />
            </View>
            <TimerPicker
              label="Time per player"
              value={room.timerSeconds}
              options={turnTimerOptionsFor('ayo')}
              format={formatAyoClockLabel}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
          </>
        ) : null}

        {gameType === 'whot' ? (
          <>
            <TimerPicker
              label="Turn timer"
              value={room.timerSeconds}
              options={turnTimerOptionsFor('whot')}
              format={formatBoardGameTurnTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Game length</Text>
              <SegmentedControl
                value={String(room.gameDurationSeconds)}
                options={WHOT_GAME_DURATION_OPTIONS.map((seconds) => ({
                  value: String(seconds),
                  label: formatSessionDuration(seconds),
                }))}
                onChange={(value) => onChange({ gameDurationSeconds: Number(value) })}
              />
            </View>
            <View style={styles.toggles}>
              <SettingToggle
                label="Pick 3"
                description="Play the Pick 3 draw penalty on 5s"
                value={room.whotPick3Enabled}
                onChange={(whotPick3Enabled) => onChange({ whotPick3Enabled })}
              />
              <SettingToggle
                label="Stack Pick 2"
                description="Defend a Pick 2 with your own 2"
                value={room.whotPick2Stacking}
                onChange={(whotPick2Stacking) => onChange({ whotPick2Stacking })}
              />
              <SettingToggle
                label="WHOT cards"
                description="Include WHOT wild cards in the deck"
                value={room.whotCardsEnabled}
                onChange={(whotCardsEnabled) => onChange({ whotCardsEnabled })}
              />
              <SettingToggle
                label="Numbers on WHOT"
                description="Call a number when playing WHOT"
                value={room.whotNumberCallsEnabled}
                onChange={(whotNumberCallsEnabled) => onChange({ whotNumberCallsEnabled })}
                disabled={!room.whotCardsEnabled}
              />
            </View>
          </>
        ) : null}

        {gameType === 'crazy_eights' ? (
          <>
            <TimerPicker
              label="Turn timer"
              value={room.timerSeconds}
              options={turnTimerOptionsFor('crazy_eights')}
              format={formatBoardGameTurnTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Game length</Text>
              <SegmentedControl
                value={String(room.gameDurationSeconds)}
                options={CRAZY8_GAME_DURATION_OPTIONS.map((seconds) => ({
                  value: String(seconds),
                  label: formatSessionDuration(seconds),
                }))}
                onChange={(value) => onChange({ gameDurationSeconds: Number(value) })}
              />
            </View>
            <View style={styles.toggles}>
              <SettingToggle
                label="Action cards"
                description="2 / J / Q / A effects (8 stays wild either way)"
                value={room.crazy8ActionCards}
                onChange={(crazy8ActionCards) => onChange({ crazy8ActionCards })}
              />
              <SettingToggle
                label="Jokers"
                description="Include 2 jokers (wild + draw 5)"
                value={room.crazy8Jokers}
                onChange={(crazy8Jokers) => onChange({ crazy8Jokers })}
              />
              <SettingToggle
                label="Stack Pick 2"
                description="Defend a Pick 2 with your own 2"
                value={room.crazy8Pick2Stacking}
                onChange={(crazy8Pick2Stacking) => onChange({ crazy8Pick2Stacking })}
              />
            </View>
          </>
        ) : null}

        {gameType === 'scrabble' ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Game mode</Text>
              <SegmentedControl
                value={room.scrabbleClockMode}
                options={[
                  { value: 'standard', label: 'Normal', hint: 'Per-turn timer + optional game length cap' },
                  { value: 'chess', label: 'Chess clock', hint: 'Per-player time bank — run out and you spectate' },
                ]}
                onChange={(value) =>
                  onChange({ scrabbleClockMode: value as GameRoomSettings['scrabbleClockMode'] })
                }
              />
            </View>
            {room.scrabbleClockMode === 'chess' ? (
              <View style={styles.field}>
                <Text style={styles.label}>Time per player</Text>
                <SegmentedControl
                  value={String(room.scrabbleClockSeconds)}
                  options={SCRABBLE_CLOCK_OPTIONS.map((seconds) => ({
                    value: String(seconds),
                    label: formatScrabbleClockMinutes(seconds),
                  }))}
                  onChange={(value) => onChange({ scrabbleClockSeconds: Number(value) })}
                />
              </View>
            ) : (
              <>
                <TimerPicker
                  label="Time per turn"
                  value={room.timerSeconds}
                  options={turnTimerOptionsFor('scrabble')}
                  format={(seconds) => (seconds ? `${seconds / 60} min` : 'No timer')}
                  onChange={(timerSeconds) => onChange({ timerSeconds })}
                />
                <View style={styles.field}>
                  <Text style={styles.label}>Game length</Text>
                  <SegmentedControl
                    value={String(room.gameDurationSeconds)}
                    options={SCRABBLE_GAME_DURATION_OPTIONS.map((seconds) => ({
                      value: String(seconds),
                      label: formatSessionDuration(seconds),
                    }))}
                    onChange={(value) => onChange({ gameDurationSeconds: Number(value) })}
                  />
                </View>
              </>
            )}
            <View style={styles.field}>
              <Text style={styles.label}>Dictionary</Text>
              <SegmentedControl
                value={room.scrabbleDictionaryId}
                options={SCRABBLE_DICTIONARY_OPTIONS.map((id) => ({
                  value: id,
                  label: SCRABBLE_DICTIONARY_LABELS[id].split(' · ')[0] ?? id,
                }))}
                onChange={(value) =>
                  onChange({ scrabbleDictionaryId: value as GameRoomSettings['scrabbleDictionaryId'] })
                }
              />
            </View>
          </>
        ) : null}

        {gameType === 'mahjong' ? (
          <>
            <TimerPicker
              label="Turn timer"
              value={room.timerSeconds}
              options={turnTimerOptionsFor('mahjong')}
              format={formatBoardGameTurnTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Ruleset</Text>
              <SegmentedControl
                value={room.mahjongRuleset}
                options={MAHJONG_RULESETS.map((id) => ({
                  value: id,
                  label: MAHJONG_RULESET_LABELS[id].label,
                  hint: MAHJONG_RULESET_LABELS[id].description,
                }))}
                onChange={(value) =>
                  onChange({ mahjongRuleset: value as GameRoomSettings['mahjongRuleset'] })
                }
              />
            </View>
          </>
        ) : null}

        {gameType === 'monopoly' ? (
          <>
            <TimerPicker
              label="Turn timer"
              value={room.timerSeconds}
              options={turnTimerOptionsFor('monopoly')}
              format={formatBoardGameTurnTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Game length</Text>
              <SegmentedControl
                value={String(room.gameDurationSeconds)}
                options={MONOPOLY_GAME_DURATION_OPTIONS.map((seconds) => ({
                  value: String(seconds),
                  label: formatSessionDuration(seconds),
                }))}
                onChange={(value) => onChange({ gameDurationSeconds: Number(value) })}
              />
            </View>
          </>
        ) : null}
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.md },
  heading: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
  },
  field: { gap: theme.space.sm },
  label: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '800',
  },
  toggles: { gap: theme.space.sm },
})
