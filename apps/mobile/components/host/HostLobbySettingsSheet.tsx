import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Game, GameType } from '@fateround/shared'
import {
  POLL_ROUND_TIMER_OPTIONS,
  formatPollRoundTimer,
  partyRoundOptions,
} from '@fateround/shared/create-party-games'
import {
  gameSupportsViewerSetting,
  lateJoinPolicyFromGame,
  type LateJoinPolicy,
} from '@fateround/shared/viewers'
import { isLobbyLimitGameType } from '@fateround/shared/lobby-limits'
import { RoundCountPicker } from '@/components/create/RoundCountPicker'
import { TimerPicker } from '@/components/create/TimerPicker'
import { LateJoinPolicyPicker } from '@/components/create/LateJoinPolicyPicker'
import { MaxPlayersPicker } from '@/components/create/MaxPlayersPicker'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { patchGameSettings, postLobbySettings, type BoardLobbyPatch, type LobbySettingsPatch } from '@/lib/game-api'
import { useGamePlayerLimits } from '@/hooks/useGamePlayerLimits'
import {
  CardHouseRulesSection,
  isCardHouseRuleGame,
  type CardHouseRulesState,
} from '@/components/host/lobby-settings/CardHouseRulesSection'
import {
  BoardVariantSection,
  isBoardVariantGame,
  type BoardVariantState,
} from '@/components/host/lobby-settings/BoardVariantSection'
import {
  MafiaLobbySection,
  QuiplashLobbySection,
  isMafiaLobbyGame,
  isQuiplashLobbyGame,
  type MafiaLobbyState,
  type QuiplashLobbyState,
} from '@/components/host/lobby-settings/PartyTimerToggleSections'
import {
  DurationGamesSection,
  isDurationGame,
  type DurationGameState,
} from '@/components/host/lobby-settings/DurationGamesSection'
import { theme } from '@/constants/theme'

/** Games whose max-players is editable via the shared lobby-settings route. */
const LOBBY_MAX_PLAYERS_GAMES = new Set<GameType>([
  'monopoly',
  'yahtzee',
  'whot',
  'crazy_eights',
  'ludo',
  'mahjong',
  'snake_and_ladder',
  'word_hunt',
  'mafia',
  'sudoku',
  'matching_pairs',
  'ayo',
])

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  visible: boolean
  onClose: () => void
  onSaved: () => void
}

/**
 * Edit the settings the server allows changing while a game is still in the lobby
 * (mirrors web's PATCH /api/games/[code]): visibility, rounds, timer, late-join.
 */
export function HostLobbySettingsSheet({ gameCode, hostToken, game, visible, onClose, onSaved }: Props) {
  const gameType = game.game_type as GameType
  const { limits } = useGamePlayerLimits()
  const isCardGame = isCardHouseRuleGame(gameType)
  const isVariantGame = isBoardVariantGame(gameType)
  const isMafia = isMafiaLobbyGame(gameType)
  const isQuiplash = isQuiplashLobbyGame(gameType)
  const ownsTimer = isCardGame || isVariantGame || isMafia || isQuiplash
  const roundOptions = partyRoundOptions(gameType)
  const showRounds = roundOptions.length > 1 && game.rounds_count != null
  // Games with their own section render their own timer(s).
  const showTimer = !ownsTimer && game.timer_seconds != null && game.timer_seconds > 0
  const showLateJoin = gameSupportsViewerSetting(gameType)
  const showMaxPlayers = isLobbyLimitGameType(gameType) && LOBBY_MAX_PLAYERS_GAMES.has(gameType)

  const timerOptions = Array.from(
    new Set<number>([game.timer_seconds ?? 0, ...POLL_ROUND_TIMER_OPTIONS])
  )
    .filter((n) => n > 0)
    .sort((a, b) => a - b)

  const [isPublic, setIsPublic] = useState(!!game.is_public)
  const [roundsCount, setRoundsCount] = useState(game.rounds_count ?? roundOptions[0] ?? 1)
  const [timerSeconds, setTimerSeconds] = useState(game.timer_seconds ?? POLL_ROUND_TIMER_OPTIONS[0])
  const [lateJoin, setLateJoin] = useState<LateJoinPolicy>(lateJoinPolicyFromGame(game))
  const [maxPlayers, setMaxPlayers] = useState<number | null>(game.max_players ?? null)
  const [card, setCard] = useState<CardHouseRulesState>(() => ({
    timerSeconds: game.timer_seconds ?? 0,
    gameDurationSeconds: game.game_duration_seconds ?? 0,
    whotPick3Enabled: game.whot_pick3_enabled ?? true,
    whotPick2Stacking: game.whot_pick2_stacking ?? true,
    whotCardsEnabled: game.whot_cards_enabled ?? true,
    whotNumberCallsEnabled: game.whot_number_calls_enabled ?? true,
    crazy8ActionCards: game.crazy8_action_cards ?? true,
    crazy8Jokers: game.crazy8_jokers ?? false,
    crazy8Pick2Stacking: game.crazy8_pick2_stacking ?? true,
  }))
  const [variant, setVariant] = useState<BoardVariantState>(() => ({
    timerSeconds: game.timer_seconds ?? 0,
    ludoVariant: game.ludo_variant === 'traditional' ? 'traditional' : 'modern',
    ayoVariant: game.ayo_variant === 'oware' ? 'oware' : 'traditional',
  }))
  const [mafia, setMafia] = useState<MafiaLobbyState>(() => ({
    timerSeconds: game.timer_seconds ?? 0,
    doctorEnabled: game.mafia_doctor_enabled ?? true,
    detectiveEnabled: game.mafia_detective_enabled ?? true,
    anonymousVotes: game.mafia_anonymous_votes ?? true,
  }))
  const [quiplash, setQuiplash] = useState<QuiplashLobbyState>(() => ({
    timerSeconds: game.timer_seconds ?? 0,
    voteTimer: game.operative_timer_seconds ?? 0,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (saving) return
    // Visibility / rounds / timer / late-join go through PATCH (works for all games).
    const patch: LobbySettingsPatch = {}
    if (isPublic !== !!game.is_public) patch.is_public = isPublic
    if (showRounds && roundsCount !== game.rounds_count) patch.rounds_count = roundsCount
    if (showTimer && timerSeconds !== game.timer_seconds) patch.timer_seconds = timerSeconds
    if (showLateJoin && lateJoin !== lateJoinPolicyFromGame(game)) patch.late_join_policy = lateJoin

    // Everything else (max players, card house-rules, per-game timers) goes to lobby-settings.
    const board: BoardLobbyPatch = {}
    if (showMaxPlayers && maxPlayers != null && maxPlayers !== game.max_players) board.max_players = maxPlayers
    if (isCardGame) {
      if (card.timerSeconds !== game.timer_seconds) board.timer_seconds = card.timerSeconds
      if (card.gameDurationSeconds !== game.game_duration_seconds) board.game_duration_seconds = card.gameDurationSeconds
      if (gameType === 'whot') {
        if (card.whotPick3Enabled !== game.whot_pick3_enabled) board.whot_pick3_enabled = card.whotPick3Enabled
        if (card.whotPick2Stacking !== game.whot_pick2_stacking) board.whot_pick2_stacking = card.whotPick2Stacking
        if (card.whotCardsEnabled !== game.whot_cards_enabled) board.whot_cards_enabled = card.whotCardsEnabled
        if (card.whotNumberCallsEnabled !== game.whot_number_calls_enabled)
          board.whot_number_calls_enabled = card.whotNumberCallsEnabled
      } else {
        if (card.crazy8ActionCards !== game.crazy8_action_cards) board.crazy8_action_cards = card.crazy8ActionCards
        if (card.crazy8Jokers !== game.crazy8_jokers) board.crazy8_jokers = card.crazy8Jokers
        if (card.crazy8Pick2Stacking !== game.crazy8_pick2_stacking) board.crazy8_pick2_stacking = card.crazy8Pick2Stacking
      }
    }
    if (isVariantGame) {
      if (variant.timerSeconds !== game.timer_seconds) board.timer_seconds = variant.timerSeconds
      if (gameType === 'ludo' && variant.ludoVariant !== game.ludo_variant) board.ludo_variant = variant.ludoVariant
      if (gameType === 'ayo' && variant.ayoVariant !== game.ayo_variant) board.ayo_variant = variant.ayoVariant
    }
    if (isMafia) {
      if (mafia.timerSeconds !== game.timer_seconds) board.timer_seconds = mafia.timerSeconds
      if (mafia.doctorEnabled !== game.mafia_doctor_enabled) board.mafia_doctor_enabled = mafia.doctorEnabled
      if (mafia.detectiveEnabled !== game.mafia_detective_enabled) board.mafia_detective_enabled = mafia.detectiveEnabled
      if (mafia.anonymousVotes !== game.mafia_anonymous_votes) board.mafia_anonymous_votes = mafia.anonymousVotes
    }
    if (isQuiplash) {
      if (quiplash.timerSeconds !== game.timer_seconds) board.timer_seconds = quiplash.timerSeconds
      if (quiplash.voteTimer !== game.operative_timer_seconds) board.operative_timer_seconds = quiplash.voteTimer
    }

    const hasBoard = Object.keys(board).length > 0
    if (Object.keys(patch).length === 0 && !hasBoard) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (Object.keys(patch).length > 0) await patchGameSettings(gameCode, hostToken, patch)
      if (hasBoard) await postLobbySettings(gameCode, hostToken, board)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Lobby settings</Text>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.field}>
              <Text style={styles.label}>Visibility</Text>
              <SegmentedControl
                value={isPublic ? 'public' : 'private'}
                options={[
                  { value: 'private', label: '🔒 Private', hint: 'Only people with the code can join.' },
                  { value: 'public', label: '🌐 Public', hint: 'Anyone can find this game in Browse.' },
                ]}
                onChange={(v) => setIsPublic(v === 'public')}
              />
            </View>

            {showMaxPlayers ? (
              <View style={styles.field}>
                <Text style={styles.label}>Max players</Text>
                <MaxPlayersPicker
                  gameType={gameType}
                  value={maxPlayers}
                  limits={limits}
                  onChange={setMaxPlayers}
                />
              </View>
            ) : null}

            {showRounds ? (
              <RoundCountPicker
                label="Rounds"
                value={roundsCount}
                options={roundOptions}
                onChange={setRoundsCount}
              />
            ) : null}

            {showTimer ? (
              <TimerPicker
                label="Time per round"
                value={timerSeconds}
                options={timerOptions}
                format={formatPollRoundTimer}
                onChange={setTimerSeconds}
              />
            ) : null}

            {isCardGame ? (
              <CardHouseRulesSection
                gameType={gameType}
                value={card}
                onChange={(p) => setCard((prev) => ({ ...prev, ...p }))}
              />
            ) : null}

            {isVariantGame ? (
              <BoardVariantSection
                gameType={gameType}
                value={variant}
                onChange={(p) => setVariant((prev) => ({ ...prev, ...p }))}
              />
            ) : null}

            {isMafia ? (
              <MafiaLobbySection value={mafia} onChange={(p) => setMafia((prev) => ({ ...prev, ...p }))} />
            ) : null}

            {isQuiplash ? (
              <QuiplashLobbySection
                value={quiplash}
                onChange={(p) => setQuiplash((prev) => ({ ...prev, ...p }))}
              />
            ) : null}

            {showLateJoin ? (
              <View style={styles.field}>
                <Text style={styles.label}>Late join</Text>
                <LateJoinPolicyPicker gameType={gameType} value={lateJoin} onChange={setLateJoin} />
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.secondary, styles.flex]} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, styles.flex, saving && styles.disabled]}
              disabled={saving}
              onPress={() => void save()}
            >
              <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: theme.space.lg,
    gap: theme.space.md,
    maxHeight: '85%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center' },
  title: { color: theme.text, fontSize: 20, fontWeight: '800' },
  body: { gap: theme.space.lg, paddingBottom: theme.space.md },
  field: { gap: theme.space.sm },
  label: { color: theme.text, fontSize: 16, fontWeight: '800' },
  error: { color: theme.error, fontSize: 13 },
  actions: { flexDirection: 'row', gap: theme.space.sm },
  flex: { flex: 1 },
  primary: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondary: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { color: theme.textSecondary, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
})
