import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
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
import { UNO_GAME_DURATION_OPTIONS } from '@fateround/shared/uno'
import { MAHJONG_RULESET_LABELS, MAHJONG_RULESETS } from '@fateround/shared/mahjong-rulesets'
import {
  SCRABBLE_DICTIONARY_OPTIONS,
  SCRABBLE_DICTIONARY_SHORT_LABELS,
} from '@fateround/shared/scrabble-dictionary-meta'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { SelectField } from '@/components/create/SelectField'
import { SettingToggle } from '@/components/create/SettingToggle'
import { TimerPicker } from '@/components/create/TimerPicker'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { boardGameTimerKey, hasGameRoomSettings, type GameRoomSettings } from '@/lib/create-settings/board-games'
import { gameLabel } from '@/lib/mobile-registry'

type Props = {
  gameType: GameType
  room: GameRoomSettings
  /** Currently-picked lobby max_players; Estate Kings 48-space board is only offered when >= 6. */
  maxPlayers?: number | null
  onChange: (patch: Partial<GameRoomSettings>) => void
}

export function GameRoomSettingsPanel({ gameType, room, maxPlayers, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [monopolyAdvancedOpen, setMonopolyAdvancedOpen] = useState(false)
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

        {gameType === 'checkers' || gameType === 'checkers_international' || gameType === 'checkers_nigeria' ? (
          <>
            <TimerPicker
              label="Time per player"
              value={room.timerSeconds}
              options={turnTimerOptionsFor('checkers')}
              format={formatChessClockLabel}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            {gameType === 'checkers_nigeria' ? (
              <View style={styles.toggles}>
                <SettingToggle
                  label="Street Rules"
                  description="Capturing stays optional — decline one and your opponent may huff (remove) the piece instead of moving"
                  value={room.checkersNigeriaStreetRules}
                  onChange={(checkersNigeriaStreetRules) => onChange({ checkersNigeriaStreetRules })}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {gameType === 'ayo' ? (
          <TimerPicker
            label="Time per player"
            value={room.timerSeconds}
            options={turnTimerOptionsFor('ayo')}
            format={formatAyoClockLabel}
            onChange={(timerSeconds) => onChange({ timerSeconds })}
          />
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

        {gameType === 'uno' ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Team-Up (2v2)</Text>
              <SettingToggle
                label="Team-Up mode"
                description="4 players in 2 teams of 2. Teammates sit across and see each other's hands; a team wins the round the moment either partner empties their hand."
                value={room.unoTeamMode}
                onChange={(unoTeamMode) => onChange({ unoTeamMode })}
              />
              {room.unoTeamMode ? <Text style={styles.hint}>4 players (2 teams of 2)</Text> : null}
            </View>
            <TimerPicker
              label="Turn timer"
              value={room.timerSeconds}
              options={turnTimerOptionsFor('uno')}
              format={formatBoardGameTurnTimer}
              onChange={(timerSeconds) => onChange({ timerSeconds })}
            />
            <View style={styles.field}>
              <Text style={styles.label}>Game length</Text>
              <SegmentedControl
                value={String(room.gameDurationSeconds)}
                options={UNO_GAME_DURATION_OPTIONS.map((seconds) => ({
                  value: String(seconds),
                  label: formatSessionDuration(seconds),
                }))}
                onChange={(value) => onChange({ gameDurationSeconds: Number(value) })}
              />
            </View>
            <View style={styles.toggles}>
              <SettingToggle
                label="Wild +4 challenge"
                description="Let the next player challenge a Wild Draw Four"
                value={room.unoWd4Challenge}
                onChange={(unoWd4Challenge) => onChange({ unoWd4Challenge })}
              />
              <SettingToggle
                label="Draw stacking"
                description="Stack a Draw Two on a Draw Two, or a Wild +4 on a Wild +4"
                value={room.unoStacking}
                onChange={(unoStacking) => onChange({ unoStacking })}
              />
              <SettingToggle
                label="0/7 rule"
                description="Playing a 0 passes every hand · playing a 7 swaps hands with a player"
                value={room.unoZeroSeven}
                onChange={(unoZeroSeven) => onChange({ unoZeroSeven })}
              />
              <SettingToggle
                label="Double penalty"
                description="Missed last-card calls draw 4 cards instead of 2"
                value={room.unoUnoPenalty === 4}
                onChange={(on) => onChange({ unoUnoPenalty: on ? 4 : 2 })}
              />
              <SettingToggle
                label="Jump-In"
                description="Hold an exact match for the top card (same colour + number, or same colour + symbol)? Play it instantly, even out of turn."
                value={room.unoJumpIn}
                onChange={(unoJumpIn) => onChange({ unoJumpIn })}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Multi-Play</Text>
              <SegmentedControl
                value={room.unoMultiPlayMode}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'same_color_or_number', label: 'Colour or number' },
                  { value: 'same_color', label: 'Colour only' },
                  { value: 'same_number', label: 'Number only' },
                ]}
                onChange={(value) => onChange({ unoMultiPlayMode: value as GameRoomSettings['unoMultiPlayMode'] })}
              />
              <Text style={styles.hint}>Lay several matching cards in a single turn.</Text>
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
                onChange={(value) => onChange({ scrabbleClockMode: value as GameRoomSettings['scrabbleClockMode'] })}
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
                  label: SCRABBLE_DICTIONARY_SHORT_LABELS[id] ?? id,
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
              <SelectField
                title="Ruleset"
                value={room.mahjongRuleset}
                options={MAHJONG_RULESETS.map((id) => ({
                  value: id,
                  label: MAHJONG_RULESET_LABELS[id].label,
                  hint: MAHJONG_RULESET_LABELS[id].description,
                }))}
                onChange={(value) => onChange({ mahjongRuleset: value as GameRoomSettings['mahjongRuleset'] })}
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
              <Text style={styles.label}>Board size</Text>
              <SegmentedControl
                value={String(room.monopolyBoardSize)}
                options={
                  (maxPlayers ?? 0) >= 6
                    ? [
                        { value: '40', label: '40 spaces' },
                        { value: '48', label: '48 spaces' },
                      ]
                    : [{ value: '40', label: '40 spaces' }]
                }
                onChange={(value) => onChange({ monopolyBoardSize: value === '48' ? 48 : 40 })}
              />
              {(maxPlayers ?? 0) < 6 ? (
                <Text style={styles.hint}>Raise the room cap to at least 6 players to unlock the 48-space board.</Text>
              ) : null}
            </View>
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
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: monopolyAdvancedOpen }}
              style={styles.advancedHeader}
              onPress={() => setMonopolyAdvancedOpen((v) => !v)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Advanced house rules</Text>
                <Text style={styles.hint}>Optional toggles — you can also change these in the host lobby.</Text>
              </View>
              <ChevronArrow open={monopolyAdvancedOpen} color={styles.advancedChevron.color as string} />
            </Pressable>
            {monopolyAdvancedOpen ? (
              <View style={styles.advancedBlock}>
                <SettingToggle
                  label="Double GO Salary"
                  description="Collect $400 (instead of $200) when landing exactly on GO."
                  value={room.monopolyDoubleGoSalary}
                  onChange={(monopolyDoubleGoSalary) => onChange({ monopolyDoubleGoSalary })}
                />
                <SettingToggle
                  label="Forced Auctions"
                  description="If a player declines to buy an unowned property, it must go to auction."
                  value={room.monopolyForcedAuctions}
                  onChange={(monopolyForcedAuctions) => onChange({ monopolyForcedAuctions })}
                />
                <View style={styles.field}>
                  <Text style={styles.subLabel}>Auction timer</Text>
                  <SegmentedControl
                    value={String(room.monopolyAuctionTimerSeconds)}
                    options={[5, 10, 15, 20, 30, 45, 60].map((s) => ({ value: String(s), label: `${s}s` }))}
                    onChange={(v) => {
                      const parsed = Number(v)
                      if (Number.isFinite(parsed)) onChange({ monopolyAuctionTimerSeconds: parsed })
                    }}
                  />
                </View>
                <SettingToggle
                  label="No Rent in NICKED"
                  description="Prevent players in NICKED from collecting rent on their properties."
                  value={room.monopolyNoRentInJail}
                  onChange={(monopolyNoRentInJail) => onChange({ monopolyNoRentInJail })}
                />
                <SettingToggle
                  label="Robin Hood Estate Dividend"
                  description="When a player leaves mid-game, their estate is liquidated and split equally among remaining players."
                  value={room.monopolyEstateDividend}
                  onChange={(monopolyEstateDividend) => onChange({ monopolyEstateDividend })}
                />
                <SettingToggle
                  label="Bank Loans"
                  description="Allow players to borrow emergency funds from the Bank with flat interest and a foreclosure term limit."
                  value={room.monopolyLoansEnabled}
                  onChange={(monopolyLoansEnabled) => onChange({ monopolyLoansEnabled })}
                />
                {room.monopolyLoansEnabled ? (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.subLabel}>Loan interest rate</Text>
                      <SegmentedControl
                        value={String(room.monopolyLoanInterest)}
                        options={[
                          { value: '10', label: '10%' },
                          { value: '15', label: '15%' },
                          { value: '20', label: '20%' },
                          { value: '25', label: '25%' },
                        ]}
                        onChange={(v) => {
                          const parsed = Number(v)
                          if (Number.isFinite(parsed)) onChange({ monopolyLoanInterest: parsed })
                        }}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.subLabel}>Loan term (rounds to repay)</Text>
                      <SegmentedControl
                        value={String(room.monopolyLoanTermRounds)}
                        options={[
                          { value: '2', label: '2 rounds' },
                          { value: '3', label: '3 rounds' },
                          { value: '4', label: '4 rounds' },
                          { value: '5', label: '5 rounds' },
                        ]}
                        onChange={(v) => {
                          const parsed = Number(v)
                          if (Number.isFinite(parsed)) onChange({ monopolyLoanTermRounds: parsed })
                        }}
                      />
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </SurfaceCard>
  )
}

function ChevronArrow({ open, color }: { open: boolean; color: string }) {
  return (
    <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
      <Svg width={16} height={16} viewBox="0 0 20 20" fill="none">
        <Polyline
          points="7 4 13 10 7 16"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
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
    hint: { color: theme.textMuted, fontSize: 12 },
    subLabel: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    advancedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    advancedChevron: { color: theme.textMuted },
    advancedBlock: {
      gap: theme.space.md,
      paddingLeft: theme.space.md,
      borderLeftWidth: 2,
      borderLeftColor: theme.border,
    },
  })
