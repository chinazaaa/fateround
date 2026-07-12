import { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Game, GameType } from '@fateround/shared'
import {
  POLL_ROUND_TIMER_OPTIONS,
  TRIVIA_MAX_ROUNDS,
  TRIVIA_MIN_ROUNDS,
  formatPollRoundTimer,
  hasPartyRoomSettings,
  partyRoundOptions,
  questionRoundPickerOptions,
} from '@fateround/shared/create-party-games'
import { gameSupportsViewerSetting, lateJoinPolicyFromGame, type LateJoinPolicy } from '@fateround/shared/viewers'
import { isLobbyLimitGameType } from '@fateround/shared/lobby-limits'
import { parseMahjongRuleOptions } from '@fateround/shared/mahjong-rulesets'
import { RoundCountPicker } from '@/components/create/RoundCountPicker'
import { TimerPicker } from '@/components/create/TimerPicker'
import { LateJoinPolicyPicker } from '@/components/create/LateJoinPolicyPicker'
import { MaxPlayersPicker } from '@/components/create/MaxPlayersPicker'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { ThemePicker } from '@/components/create/ThemePicker'
import { themesForGameType, type ThemeId } from '@fateround/shared/create-themes'
import {
  patchGameSettings,
  postBingoSettings,
  postCodewordsRandomizeTeams,
  postCodewordsTimers,
  postDescribeItSettings,
  postLobbySettings,
  postTriviaLobbySettings,
  postWordRushSettings,
  type BoardLobbyPatch,
  type LobbySettingsPatch,
} from '@/lib/game-api'
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
import {
  ScrabbleLobbySection,
  isScrabbleLobbyGame,
  type ScrabbleLobbyState,
} from '@/components/host/lobby-settings/ScrabbleLobbySection'
import {
  ICallOnLobbySection,
  isICallOnLobbyGame,
  type ICallOnLobbyState,
} from '@/components/host/lobby-settings/ICallOnLobbySection'
import {
  PollQuestionsSection,
  hasPollQuestionSettings,
  supportsPlayerQuestions,
  type PollQuestionsState,
} from '@/components/host/lobby-settings/PollQuestionsSection'
import {
  BingoLobbySection,
  isBingoLobbyGame,
  type BingoLobbyState,
} from '@/components/host/lobby-settings/BingoLobbySection'
import {
  MahjongLobbySection,
  isMahjongLobbyGame,
  type MahjongLobbyState,
} from '@/components/host/lobby-settings/MahjongLobbySection'
import {
  TeamRoundGamesSection,
  isTeamRoundGame,
  type TeamRoundState,
} from '@/components/host/lobby-settings/TeamRoundGamesSection'
import {
  QuickDrawLobbySection,
  isQuickDrawLobbyGame,
  type QuickDrawLobbyState,
} from '@/components/host/lobby-settings/QuickDrawLobbySection'
import {
  CodewordsLobbySection,
  isCodewordsLobbyGame,
  type CodewordsLobbyState,
} from '@/components/host/lobby-settings/CodewordsLobbySection'
import {
  TriviaLobbySection,
  isTriviaLobbyGame,
  type TriviaLobbyState,
} from '@/components/host/lobby-settings/TriviaLobbySection'
import {
  customContentStateFromGame,
  customContentPayload,
  customContentCount,
} from '@/lib/create-settings/custom-content'
import { isPairGame } from '@fateround/shared/poll-games'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/** Games whose max-players is editable via the shared lobby-settings route. */
const LOBBY_MAX_PLAYERS_GAMES = new Set<GameType>([
  'bingo',
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
  'describe_it',
  'quick_draw',
  'word_rush',
  'crossword',
])

/** Party games that play a single round — no editable "Rounds" control (mirrors web create). */
const ROUNDLESS_GAMES = new Set<GameType>([
  'codewords',
  'bingo',
  'two_truths',
  'word_hunt',
  'sudoku',
  'i_call_on',
  'mafia',
  'crossword',
])

/** Party games with no round/turn timer on `timer_seconds` (bingo uses a call interval). */
const TIMERLESS_GAMES = new Set<GameType>(['bingo'])

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  visible: boolean
  onClose: () => void
  onSaved: () => void
  /** Opens the host-transfer flow (pick a player to take over hosting). */
  onTransfer?: () => void
}

/**
 * Edit the settings the server allows changing while a game is still in the lobby
 * (mirrors web's PATCH /api/games/[code]): visibility, rounds, timer, late-join.
 */
export function HostLobbySettingsSheet({ gameCode, hostToken, game, visible, onClose, onSaved, onTransfer }: Props) {
  const styles = useThemedStyles(makeStyles)
  const gameType = game.game_type as GameType
  const { limits } = useGamePlayerLimits()
  const isCardGame = isCardHouseRuleGame(gameType)
  const isVariantGame = isBoardVariantGame(gameType)
  const isTeamRound = isTeamRoundGame(gameType)
  const isQuickDraw = isQuickDrawLobbyGame(gameType)
  const isCodewords = isCodewordsLobbyGame(gameType)
  const isMafia = isMafiaLobbyGame(gameType)
  const isQuiplash = isQuiplashLobbyGame(gameType)
  const isDuration = isDurationGame(gameType)
  const isScrabble = isScrabbleLobbyGame(gameType)
  const isICallOn = isICallOnLobbyGame(gameType)
  const showPollQuestions = hasPollQuestionSettings(gameType)
  const isBingo = isBingoLobbyGame(gameType)
  const isMahjong = isMahjongLobbyGame(gameType)
  const isTrivia = isTriviaLobbyGame(gameType)
  const ownsTimer =
    isCardGame ||
    isVariantGame ||
    isMafia ||
    isQuiplash ||
    isDuration ||
    isScrabble ||
    isICallOn ||
    isMahjong ||
    isTeamRound ||
    isQuickDraw ||
    isCodewords
  const roundOptions = partyRoundOptions(gameType)
  // Rounds apply only to multi-round party games — never single-round ones
  // (codewords, bingo, two truths, word hunt, sudoku, i-call-on, mafia) or board
  // games, and not to games that render their own rounds control (team/quick-draw).
  const showRounds =
    hasPartyRoomSettings(gameType) &&
    !ROUNDLESS_GAMES.has(gameType) &&
    !isTeamRound &&
    !isQuickDraw &&
    roundOptions.length > 1 &&
    game.rounds_count != null
  // The universal "time per round" only applies to round-timed party games that
  // don't own their own timer section (poll suite, trivia, two truths, hot seat).
  const showTimer =
    !ownsTimer &&
    hasPartyRoomSettings(gameType) &&
    !TIMERLESS_GAMES.has(gameType) &&
    game.timer_seconds != null &&
    game.timer_seconds > 0
  const showLateJoin = gameSupportsViewerSetting(gameType)
  const showMaxPlayers = isLobbyLimitGameType(gameType) && LOBBY_MAX_PLAYERS_GAMES.has(gameType)
  const themeOptions = themesForGameType(gameType)
  const showTheme = themeOptions.length > 1

  const timerOptions = Array.from(
    new Set<number>([game.timer_seconds ?? 0, ...POLL_ROUND_TIMER_OPTIONS, ...(isTrivia ? [10] : [])])
  )
    .filter((n) => n > 0)
    .sort((a, b) => a - b)

  const [isPublic, setIsPublic] = useState(!!game.is_public)
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const current = game.theme as ThemeId | undefined
    return current && themeOptions.some((o) => o.id === current) ? current : (themeOptions[0]?.id ?? 'default')
  })
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
  const [duration, setDuration] = useState<DurationGameState>(() => ({
    timerSeconds: game.timer_seconds ?? 0,
    gameDurationSeconds: game.game_duration_seconds ?? 0,
    largeGrid: (game.game_duration_seconds ?? 0) >= 16,
  }))
  const [scrabble, setScrabble] = useState<ScrabbleLobbyState>(() => ({
    clockMode: game.scrabble_clock_mode === 'chess' ? 'chess' : 'standard',
    clockSeconds: game.scrabble_clock_seconds ?? 600,
    timerSeconds: game.timer_seconds ?? 0,
    gameDurationSeconds: game.game_duration_seconds ?? 0,
    dictionaryId: game.scrabble_dictionary_id ?? 'enable',
  }))
  const [icallon, setIcallon] = useState<ICallOnLobbyState>(() => ({
    gameDurationSeconds: game.game_duration_seconds ?? 0,
    timerSeconds: game.timer_seconds ?? 0,
    markingTimer: game.operative_timer_seconds ?? 0,
  }))
  const [poll, setPoll] = useState<PollQuestionsState>(() => ({
    pairVoteMode: game.pair_vote_mode === 'any' ? 'any' : 'one_each',
    playerQuestionsEnabled: game.player_questions_enabled ?? true,
    playerQuestionsOrder:
      game.player_questions_order === 'uploaded_first'
        ? 'uploaded_first'
        : game.player_questions_order === 'mixed'
          ? 'mixed'
          : 'players_first',
  }))
  const [bingo, setBingo] = useState<BingoLobbyState>(() => ({
    callMode: game.bingo_call_mode === 'auto' ? 'auto' : 'manual',
    callInterval: game.bingo_call_interval_seconds ?? 5,
  }))
  const [mahjong, setMahjong] = useState<MahjongLobbyState>(() => ({
    timerSeconds: game.timer_seconds ?? 0,
    ruleset: game.mahjong_ruleset ?? 'fate_round',
    ruleOptions: parseMahjongRuleOptions(game.mahjong_rule_options),
  }))
  const [quickDraw, setQuickDraw] = useState<QuickDrawLobbyState>(() => ({
    variant: game.quick_draw_variant === 'guess' ? 'guess' : 'lie',
    playMode: game.quick_draw_play_mode === 'individual' ? 'individual' : 'team',
    numTeams: game.quick_draw_num_teams ?? 2,
    rounds: game.rounds_count ?? 3,
    drawTimer: game.timer_seconds ?? 0,
    titleTimer: game.operative_timer_seconds ?? 0,
    voteTimer: game.game_duration_seconds ?? 0,
  }))
  const [team, setTeam] = useState<TeamRoundState>(() => ({
    mode:
      (gameType === 'word_rush' ? game.word_rush_mode : game.describe_it_mode) === 'individual' ? 'individual' : 'team',
    numTeams: (gameType === 'word_rush' ? game.word_rush_num_teams : game.describe_it_num_teams) ?? 2,
    turnSeconds: game.timer_seconds ?? 0,
    rounds: game.rounds_count ?? 3,
    promptMode: game.word_rush_prompt_mode === 'manual' ? 'manual' : 'automatic',
    difficulty: game.word_rush_difficulty === 'hard' ? 'hard' : 'standard',
  }))
  const [codewords, setCodewords] = useState<CodewordsLobbyState>(() => ({
    spymasterTimer: game.timer_seconds ?? 0,
    operativeTimer: game.operative_timer_seconds ?? 0,
  }))
  const [trivia, setTrivia] = useState<TriviaLobbyState>(() => ({
    category: game.trivia_category === 'tech' ? 'tech' : 'general',
    custom: customContentStateFromGame(game),
  }))
  const triviaPoolCount =
    isTrivia && trivia.custom.source !== 'platform' ? customContentCount('trivia', trivia.custom) : 0
  const triviaRoundOptions = useMemo(() => {
    if (!isTrivia || triviaPoolCount <= 0) return roundOptions
    return questionRoundPickerOptions(Math.min(triviaPoolCount, TRIVIA_MAX_ROUNDS)).filter(
      (n) => n >= TRIVIA_MIN_ROUNDS && n <= TRIVIA_MAX_ROUNDS
    )
  }, [isTrivia, triviaPoolCount, roundOptions])
  useEffect(() => {
    if (triviaRoundOptions.length === 0) return
    if (!triviaRoundOptions.includes(roundsCount)) {
      setRoundsCount(triviaRoundOptions[triviaRoundOptions.length - 1] ?? roundsCount)
    }
  }, [triviaRoundOptions, roundsCount])
  const [shuffling, setShuffling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onShuffle = async () => {
    if (shuffling) return
    setShuffling(true)
    setError(null)
    try {
      await postCodewordsRandomizeTeams(gameCode, hostToken)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not shuffle teams')
    } finally {
      setShuffling(false)
    }
  }

  const save = async () => {
    if (saving) return
    // Visibility / rounds / timer / late-join go through PATCH (works for all games).
    const patch: LobbySettingsPatch = {}
    if (isPublic !== !!game.is_public) patch.is_public = isPublic
    if (showTheme && themeId !== game.theme) patch.theme = themeId
    // Trivia routes rounds/timer through lobby-pool (below) alongside source/category/pool.
    if (showRounds && !isTrivia && roundsCount !== game.rounds_count) patch.rounds_count = roundsCount
    if (showTimer && !isTrivia && timerSeconds !== game.timer_seconds) patch.timer_seconds = timerSeconds
    if (showLateJoin && lateJoin !== lateJoinPolicyFromGame(game)) patch.late_join_policy = lateJoin
    if (isScrabble) {
      if (scrabble.clockMode !== game.scrabble_clock_mode) patch.scrabble_clock_mode = scrabble.clockMode
      if (scrabble.dictionaryId !== game.scrabble_dictionary_id) patch.scrabble_dictionary_id = scrabble.dictionaryId
      if (scrabble.clockMode === 'chess') {
        if (scrabble.clockSeconds !== game.scrabble_clock_seconds) patch.scrabble_clock_seconds = scrabble.clockSeconds
      } else {
        if (scrabble.timerSeconds !== game.timer_seconds) patch.timer_seconds = scrabble.timerSeconds
        if (scrabble.gameDurationSeconds !== game.game_duration_seconds)
          patch.game_duration_seconds = scrabble.gameDurationSeconds
      }
    }
    if (isICallOn) {
      if (icallon.gameDurationSeconds !== game.game_duration_seconds)
        patch.game_duration_seconds = icallon.gameDurationSeconds
      if (icallon.timerSeconds !== game.timer_seconds) patch.timer_seconds = icallon.timerSeconds
      if (icallon.markingTimer !== game.operative_timer_seconds) patch.operative_timer_seconds = icallon.markingTimer
    }
    if (showPollQuestions) {
      if (isPairGame(gameType) && poll.pairVoteMode !== game.pair_vote_mode) patch.pair_vote_mode = poll.pairVoteMode
      if (supportsPlayerQuestions(gameType)) {
        if (poll.playerQuestionsEnabled !== game.player_questions_enabled)
          patch.player_questions_enabled = poll.playerQuestionsEnabled
        if (poll.playerQuestionsOrder !== game.player_questions_order)
          patch.player_questions_order = poll.playerQuestionsOrder
      }
    }

    // Everything else (max players, card house-rules, per-game timers) goes to lobby-settings.
    const board: BoardLobbyPatch = {}
    if (showMaxPlayers && maxPlayers != null && maxPlayers !== game.max_players && gameType !== 'word_rush')
      board.max_players = maxPlayers
    if (isCardGame) {
      if (card.timerSeconds !== game.timer_seconds) board.timer_seconds = card.timerSeconds
      if (card.gameDurationSeconds !== game.game_duration_seconds)
        board.game_duration_seconds = card.gameDurationSeconds
      if (gameType === 'whot') {
        if (card.whotPick3Enabled !== game.whot_pick3_enabled) board.whot_pick3_enabled = card.whotPick3Enabled
        if (card.whotPick2Stacking !== game.whot_pick2_stacking) board.whot_pick2_stacking = card.whotPick2Stacking
        if (card.whotCardsEnabled !== game.whot_cards_enabled) board.whot_cards_enabled = card.whotCardsEnabled
        if (card.whotNumberCallsEnabled !== game.whot_number_calls_enabled)
          board.whot_number_calls_enabled = card.whotNumberCallsEnabled
      } else {
        if (card.crazy8ActionCards !== game.crazy8_action_cards) board.crazy8_action_cards = card.crazy8ActionCards
        if (card.crazy8Jokers !== game.crazy8_jokers) board.crazy8_jokers = card.crazy8Jokers
        if (card.crazy8Pick2Stacking !== game.crazy8_pick2_stacking)
          board.crazy8_pick2_stacking = card.crazy8Pick2Stacking
      }
    }
    if (isMahjong) {
      if (mahjong.timerSeconds !== game.timer_seconds) board.timer_seconds = mahjong.timerSeconds
      if (mahjong.ruleset !== game.mahjong_ruleset) board.mahjong_ruleset = mahjong.ruleset
      if (JSON.stringify(mahjong.ruleOptions) !== JSON.stringify(game.mahjong_rule_options ?? null))
        board.mahjong_rule_options = mahjong.ruleOptions
    }
    if (isQuickDraw) {
      if (quickDraw.variant !== game.quick_draw_variant) board.quick_draw_variant = quickDraw.variant
      if (quickDraw.rounds !== game.rounds_count) board.rounds_count = quickDraw.rounds
      if (quickDraw.drawTimer !== game.timer_seconds) board.timer_seconds = quickDraw.drawTimer
      if (quickDraw.variant === 'guess') {
        if (quickDraw.playMode !== game.quick_draw_play_mode) board.quick_draw_play_mode = quickDraw.playMode
        if (quickDraw.playMode === 'team' && quickDraw.numTeams !== game.quick_draw_num_teams)
          board.quick_draw_num_teams = quickDraw.numTeams
      } else {
        if (quickDraw.titleTimer !== game.operative_timer_seconds) board.operative_timer_seconds = quickDraw.titleTimer
        if (quickDraw.voteTimer !== game.game_duration_seconds) board.game_duration_seconds = quickDraw.voteTimer
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
      if (mafia.detectiveEnabled !== game.mafia_detective_enabled)
        board.mafia_detective_enabled = mafia.detectiveEnabled
      if (mafia.anonymousVotes !== game.mafia_anonymous_votes) board.mafia_anonymous_votes = mafia.anonymousVotes
    }
    if (isQuiplash) {
      if (quiplash.timerSeconds !== game.timer_seconds) board.timer_seconds = quiplash.timerSeconds
      if (quiplash.voteTimer !== game.operative_timer_seconds) board.operative_timer_seconds = quiplash.voteTimer
    }
    if (isDuration) {
      if (gameType === 'sudoku' || gameType === 'crossword') {
        if (duration.gameDurationSeconds !== game.game_duration_seconds)
          board.game_duration_seconds = duration.gameDurationSeconds
      } else if (gameType === 'word_hunt') {
        if (duration.timerSeconds !== game.timer_seconds) board.timer_seconds = duration.timerSeconds
      } else {
        // matching_pairs
        if (duration.timerSeconds !== game.timer_seconds) board.timer_seconds = duration.timerSeconds
        const grid = duration.largeGrid ? 16 : 0
        if (grid !== (game.game_duration_seconds ?? 0)) board.game_duration_seconds = grid
      }
    }

    // Bingo has its own dedicated route.
    const bingoPatch: { bingo_call_mode?: 'manual' | 'auto'; bingo_call_interval_seconds?: number } = {}
    if (isBingo) {
      if (bingo.callMode !== game.bingo_call_mode) bingoPatch.bingo_call_mode = bingo.callMode
      if (bingo.callMode === 'auto' && bingo.callInterval !== game.bingo_call_interval_seconds)
        bingoPatch.bingo_call_interval_seconds = bingo.callInterval
    }

    // Describe It / Word Rush use their own dedicated routes.
    let teamCall: (() => Promise<unknown>) | null = null
    if (isTeamRound) {
      if (gameType === 'describe_it') {
        const p: { mode?: 'team' | 'individual'; numTeams?: number; turnSeconds?: number; rounds?: number } = {}
        if (team.mode !== game.describe_it_mode) p.mode = team.mode
        if (team.mode === 'team' && team.numTeams !== game.describe_it_num_teams) p.numTeams = team.numTeams
        if (team.turnSeconds !== game.timer_seconds) p.turnSeconds = team.turnSeconds
        if (team.rounds !== game.rounds_count) p.rounds = team.rounds
        if (Object.keys(p).length > 0) teamCall = () => postDescribeItSettings(gameCode, hostToken, p)
      } else {
        const p: {
          mode?: 'team' | 'individual'
          promptMode?: 'automatic' | 'manual'
          difficulty?: 'standard' | 'hard'
          numTeams?: number
          turnSeconds?: number
          rounds?: number
          maxPlayers?: number
        } = {}
        if (team.mode !== game.word_rush_mode) p.mode = team.mode
        if (team.promptMode !== game.word_rush_prompt_mode) p.promptMode = team.promptMode
        if (team.difficulty !== game.word_rush_difficulty) p.difficulty = team.difficulty
        if (team.mode === 'team' && team.numTeams !== game.word_rush_num_teams) p.numTeams = team.numTeams
        if (team.turnSeconds !== game.timer_seconds) p.turnSeconds = team.turnSeconds
        if (team.rounds !== game.rounds_count) p.rounds = team.rounds
        if (showMaxPlayers && maxPlayers != null && maxPlayers !== game.max_players) p.maxPlayers = maxPlayers
        if (Object.keys(p).length > 0) teamCall = () => postWordRushSettings(gameCode, hostToken, p)
      }
    }

    // Codewords timers use their own route.
    const cwPatch: { spymasterTimerSeconds?: number; operativeTimerSeconds?: number } = {}
    if (isCodewords) {
      if (codewords.spymasterTimer !== game.timer_seconds) cwPatch.spymasterTimerSeconds = codewords.spymasterTimer
      if (codewords.operativeTimer !== game.operative_timer_seconds)
        cwPatch.operativeTimerSeconds = codewords.operativeTimer
    }

    // Trivia — source / category / custom-or-library pool / timer / rounds all
    // go through the dedicated lobby-pool route (mirrors web saveLobbySettings).
    let triviaCall: (() => Promise<unknown>) | null = null
    if (isTrivia) {
      const usesCustomPool = trivia.custom.source !== 'platform'
      if (usesCustomPool) {
        const count = customContentCount('trivia', trivia.custom)
        if (count === 0) {
          setError(trivia.custom.source === 'library' ? 'Pick a library pack' : 'Upload at least one question')
          return
        }
        if (count < roundsCount) {
          setError(`Need at least ${roundsCount} questions for ${roundsCount} rounds`)
          return
        }
      }
      const tp: {
        question_source?: string
        trivia_category?: string
        timer_seconds?: number
        rounds_count?: number
        custom_questions?: unknown[]
      } = {}
      const nextSource = usesCustomPool ? 'custom' : 'platform'
      if (nextSource !== (game.question_source ?? 'platform')) tp.question_source = nextSource
      const currentCategory = game.trivia_category === 'tech' ? 'tech' : 'general'
      if (trivia.category !== currentCategory) tp.trivia_category = trivia.category
      if (usesCustomPool) {
        const built = customContentPayload('trivia', trivia.custom)
        if (Array.isArray(built.custom_questions)) tp.custom_questions = built.custom_questions
      }
      if (showTimer && timerSeconds !== game.timer_seconds) tp.timer_seconds = timerSeconds
      if (showRounds && roundsCount !== game.rounds_count) tp.rounds_count = roundsCount
      if (Object.keys(tp).length > 0) triviaCall = () => postTriviaLobbySettings(gameCode, hostToken, tp)
    }

    const hasBoard = Object.keys(board).length > 0
    const hasBingo = Object.keys(bingoPatch).length > 0
    const hasCw = Object.keys(cwPatch).length > 0
    if (Object.keys(patch).length === 0 && !hasBoard && !hasBingo && !teamCall && !hasCw && !triviaCall) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (Object.keys(patch).length > 0) await patchGameSettings(gameCode, hostToken, patch)
      if (hasBoard) await postLobbySettings(gameCode, hostToken, board)
      if (hasBingo) await postBingoSettings(gameCode, hostToken, bingoPatch)
      if (teamCall) await teamCall()
      if (hasCw) await postCodewordsTimers(gameCode, hostToken, cwPatch)
      if (triviaCall) await triviaCall()
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

            {showTheme ? <ThemePicker gameType={gameType} value={themeId} onChange={setThemeId} /> : null}

            {showMaxPlayers ? (
              <View style={styles.field}>
                <Text style={styles.label}>Max players</Text>
                <MaxPlayersPicker gameType={gameType} value={maxPlayers} limits={limits} onChange={setMaxPlayers} />
              </View>
            ) : null}

            {showRounds ? (
              <RoundCountPicker
                label="Rounds"
                value={roundsCount}
                options={triviaRoundOptions}
                onChange={setRoundsCount}
              />
            ) : null}

            {showTimer ? (
              <TimerPicker
                label={isTrivia ? 'Time per question' : 'Time per round'}
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
              <QuiplashLobbySection value={quiplash} onChange={(p) => setQuiplash((prev) => ({ ...prev, ...p }))} />
            ) : null}

            {isDuration ? (
              <DurationGamesSection
                gameType={gameType}
                value={duration}
                onChange={(p) => setDuration((prev) => ({ ...prev, ...p }))}
              />
            ) : null}

            {isScrabble ? (
              <ScrabbleLobbySection value={scrabble} onChange={(p) => setScrabble((prev) => ({ ...prev, ...p }))} />
            ) : null}

            {isICallOn ? (
              <ICallOnLobbySection value={icallon} onChange={(p) => setIcallon((prev) => ({ ...prev, ...p }))} />
            ) : null}

            {showPollQuestions ? (
              <PollQuestionsSection
                gameType={gameType}
                value={poll}
                onChange={(p) => setPoll((prev) => ({ ...prev, ...p }))}
              />
            ) : null}

            {isBingo ? (
              <BingoLobbySection value={bingo} onChange={(p) => setBingo((prev) => ({ ...prev, ...p }))} />
            ) : null}

            {isMahjong ? (
              <MahjongLobbySection value={mahjong} onChange={(p) => setMahjong((prev) => ({ ...prev, ...p }))} />
            ) : null}

            {isTeamRound ? (
              <TeamRoundGamesSection
                gameType={gameType}
                value={team}
                onChange={(p) => setTeam((prev) => ({ ...prev, ...p }))}
              />
            ) : null}

            {isQuickDraw ? (
              <QuickDrawLobbySection value={quickDraw} onChange={(p) => setQuickDraw((prev) => ({ ...prev, ...p }))} />
            ) : null}

            {isCodewords ? (
              <CodewordsLobbySection
                value={codewords}
                onChange={(p) => setCodewords((prev) => ({ ...prev, ...p }))}
                canShuffle={game.codewords_randomize_teams === true}
                shuffling={shuffling}
                onShuffle={() => void onShuffle()}
              />
            ) : null}

            {isTrivia ? (
              <TriviaLobbySection
                value={trivia}
                roundsCount={roundsCount}
                onChange={(p) => setTrivia((prev) => ({ ...prev, ...p }))}
              />
            ) : null}

            {showLateJoin ? (
              <View style={styles.field}>
                <Text style={styles.label}>Late join</Text>
                <LateJoinPolicyPicker gameType={gameType} value={lateJoin} onChange={setLateJoin} />
              </View>
            ) : null}

            {onTransfer ? (
              <Pressable style={styles.transferBtn} onPress={onTransfer}>
                <Text style={styles.transferText}>Transfer host to another player</Text>
              </Pressable>
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
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
    transferBtn: {
      marginTop: theme.space.sm,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    transferText: { color: theme.textSecondary, fontWeight: '700', fontSize: 15 },
  })
