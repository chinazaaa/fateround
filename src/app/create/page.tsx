'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type {
  ParticipantGender,
  ParticipantMode,
  GameType,
  DescribeItMode,
  PairVoteMode,
  QuestionSource,
  ThemeId,
  WstQuoteSource,
  PlayerQuestionsOrder,
  TriviaCategory,
  TriviaQuestion,
} from '@/types'
import { THEMES } from '@/lib/themes'
import { ThemePreviewCard, ThemePreviewModal } from '@/components/ThemePreviewModal'
import {
  type ParticipantInput,
  parseParticipantsForGame,
  parseExcelParticipants,
  mergeParticipants,
  countByGender,
  hasEnoughForRounds,
  genderLabel,
  participantModeOptions,
  participantImportStepHint,
  participantClaimRosterHint,
  participantUploadHint,
  participantsNeedGenderForGame,
  participantSampleFile,
} from '@/lib/participants'
import {
  roundPoolSize,
  isLobbyGame,
  isAnonymousMessagesGame,
  isSecretMessageGame,
  isBingoGame,
  isCodewordsGame,
  isTriviaGame,
  isTwoTruthsGame,
  isMonopolyGame,
  isWouldYouRather,
  isNeverHaveIEver,
  isPickANumber,
  isThisOrThat,
  isMostLikelyTo,
  isWhoSaidThis,
  isHotSeat,
  isAnonymousGame,
  parseGameType,
  isPairGame,
  isCustomGame,
  pairVoteModeOptions,
  gameHowItWorks,
  isYahtzeeGame,
  isWhotGame,
  isCrazyEightsGame,
  isLudoGame,
  isSnakeAndLadderGame,
  isTicTacToeGame,
  isChessGame,
  isScrabbleGame,
  isDescribeItGame,
  isICallOnGame,
  isSudokuGame,
  isWordHuntGame,
} from '@/lib/game-types'
import { BOARD_THEMES, PIECE_SETS, pieceGlyph } from '@/lib/chess-appearance'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import { NHIE_QUESTION_COUNT } from '@/lib/never-have-i-ever-questions'
import { PAN_MIN_POOL, PAN_QUESTION_COUNT } from '@/lib/pick-a-number-questions'
import { clampPanRounds, PAN_MAX_ROUNDS, panRoundPickerOptions } from '@/lib/pick-a-number'
import {
  parseWyrQuestionRows,
  parseThisOrThatQuestionRows,
  parseOrSplitQuestion,
  parseMltQuestionRows,
  parseExcelWyrQuestions,
  parseExcelThisOrThatQuestions,
  parseExcelMltQuestions,
  parseTriviaQuestionImport,
  formatTriviaImportSummary,
  parseExcelTriviaQuestionImport,
  parseExcelTriviaQuestions,
  mergeWyrQuestions,
  mergeMltQuestions,
  mergeTriviaQuestions,
  mergeCodewordsWords,
  parseCodewordsWordRows,
  parseExcelCodewordsWords,
  questionSampleFile,
  questionUploadHint,
  questionSourceOptions,
  questionRoundPickerOptions,
  clampLobbyQuestionRounds,
  CODEWORDS_MIN_CUSTOM_POOL,
} from '@/lib/custom-questions'
import { playerQuestionsOrderOptions, parsePlayerQuestionsOrder } from '@/lib/player-question-pool'
import { isPeoplePollGame, playerNameSubmissionHint } from '@/lib/player-participant-pool'
import { CustomSlotBuilder } from '@/components/CustomSlotBuilder'
import { GenderRoundModeControl } from '@/components/GenderRoundModeControl'
import { customPairVoteModeOptions } from '@/lib/custom-game'
import { supportsGenderToggle, defaultGenderBasedForType } from '@/lib/gender-based'
import type { CustomSlotsConfig } from '@/types'
import { GameTypeModal } from '@/components/GameTypeModal'
import { GameTypeCard } from '@/components/GameTypeCard'
import { PageShell, BackBtn, Field, Chip, Toggle, PrimaryBtn } from '@/components/ui/PageShell'
import { StepIndicator, SettingsGroup, StickyActionBar, SegmentedControl, ChipGrid } from '@/components/ui/CreateWizard'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { LateJoinPolicyToggle } from '@/components/AllowViewersToggle'
import { gameSupportsViewerSetting, clampLateJoinPolicyForGameType, type LateJoinPolicy } from '@/lib/viewers'
import { getParticipantCustomContentHint, getQuestionCustomContentHint } from '@/lib/custom-content-hints'
import { CustomContentAiTip } from '@/components/ui/CustomContentAiTip'
import { clampHotSeatMaxCap, hotSeatMaxCapUpperBound, HOT_SEAT_MIN_PLAYERS } from '@/lib/hot-seat'
import { ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS } from '@/lib/anonymous-messages'
import {
  BINGO_CALL_INTERVAL_OPTIONS,
  BINGO_DEFAULT_CALL_INTERVAL,
  BINGO_DEFAULT_CALL_MODE,
  BINGO_DEFAULT_MAX_PLAYERS,
  type BingoCallMode,
} from '@/lib/bingo'
import {
  CODEWORDS_DEFAULT_MAX_PLAYERS,
  CODEWORDS_DEFAULT_SPYMASTER_TIMER,
  CODEWORDS_DEFAULT_OPERATIVE_TIMER,
  CODEWORDS_TIMER_OPTIONS,
} from '@/lib/codewords'
import { TRIVIA_DEFAULT_MAX_PLAYERS, TRIVIA_DEFAULT_ROUNDS, TRIVIA_DEFAULT_TIMER } from '@/lib/trivia'
import { TTL_DEFAULT_MAX_PLAYERS, TTL_DEFAULT_TIMER, TTL_TIMER_OPTIONS } from '@/lib/two-truths'
import {
  MONOPOLY_DEFAULT_MAX_PLAYERS,
  MONOPOLY_GAME_DURATION_OPTIONS,
  formatMonopolyGameDuration,
} from '@/lib/monopoly'
import { MONOPOLY_DEFAULT_TURN_TIMER } from '@/lib/supabase-selects'
import { SCRABBLE_GAME_DURATION_OPTIONS, formatScrabbleGameDuration } from '@/lib/scrabble'
import {
  SCRABBLE_DICTIONARY_OPTIONS,
  SCRABBLE_DICTIONARY_LABELS,
  SCRABBLE_DICTIONARY_BLURBS,
  SCRABBLE_DEFAULT_DICTIONARY,
  type ScrabbleDictionaryId,
} from '@/lib/scrabble-dictionary-meta'
import { YAHTZEE_DEFAULT_MAX_PLAYERS } from '@/lib/yahtzee'
import { WHOT_DEFAULT_MAX_PLAYERS, WHOT_GAME_DURATION_OPTIONS, formatWhotGameDuration } from '@/lib/whot'
import {
  CRAZY8_DEFAULT_MAX_PLAYERS,
  CRAZY8_GAME_DURATION_OPTIONS,
  formatCrazyEightsGameDuration,
} from '@/lib/crazy-eights'
import { turnTimerOptionsFor, formatBoardGameTurnTimer } from '@/lib/board-game-lobby-settings'
import { LUDO_DEFAULT_MAX_PLAYERS } from '@/lib/ludo'
import { SNAKE_LADDER_DEFAULT_MAX_PLAYERS } from '@/lib/snake-and-ladder'
import {
  formatNpatGameDuration,
  NPAT_DEFAULT_GAME_DURATION,
  NPAT_DEFAULT_MARKING_TIMER,
  NPAT_DEFAULT_MAX_PLAYERS,
  NPAT_DEFAULT_TIMER,
  NPAT_GAME_DURATION_OPTIONS,
  NPAT_MARKING_TIMER_OPTIONS,
  NPAT_TIMER_OPTIONS,
} from '@/lib/npat'
import { WORD_HUNT_DEFAULT_MAX_PLAYERS, WORD_HUNT_DEFAULT_TIMER, WORD_HUNT_TIMER_OPTIONS } from '@/lib/word-hunt'
import {
  DESCRIBE_IT_DEFAULT_ROUNDS,
  DESCRIBE_IT_DEFAULT_TURN_SECONDS,
  DESCRIBE_IT_MIN_PLAYERS,
  DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL,
  DESCRIBE_IT_ROUND_OPTIONS,
  DESCRIBE_IT_TEAM_OPTIONS,
  DESCRIBE_IT_TURN_OPTIONS,
} from '@/lib/describe-it'
import { parseDescribeItWords, parseExcelDescribeItWords } from '@/lib/describe-it-words'
import { getCodeDefaultLimits, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { TriviaTimerPicker } from '@/components/trivia/TriviaTimerPicker'
import { TRIVIA_QUESTION_COUNT } from '@/lib/trivia-questions'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { PlayerInviteCard } from '@/components/PlayerInviteCard'
import { playerGameUrl, shareOrigin } from '@/lib/site'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { scrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { useToast } from '@/components/ui/Toast'
import { ELIMINATION_COMPATIBLE_TYPES } from '@/types/elimination'

interface Settings {
  title: string
  rounds_count: number
  timer_seconds: number
  anonymous: boolean
  auto_reveal: boolean
  auto_submit_behavior: 'random' | 'no_answer'
  participant_mode: ParticipantMode
  pair_vote_mode: PairVoteMode
  game_type: GameType
  theme: ThemeId
  participant_filter: 'all' | 'joined'
  gender_based: boolean
  describe_it_num_teams: number
  describe_it_mode: DescribeItMode
}

type Step = 'settings' | 'participants' | 'done'
type ParticipantTab = 'upload' | 'manual'
type QuestionTab = 'upload' | 'manual'

function CreateGameInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const [step, setStep] = useState<Step>('settings')
  const [showGameTypes, setShowGameTypes] = useState(false)
  const [previewTheme, setPreviewTheme] = useState<(typeof THEMES)[number] | null>(null)
  const [participantTab, setParticipantTab] = useState<ParticipantTab>('upload')
  const [settings, setSettings] = useState<Settings>({
    title: '',
    rounds_count: 3,
    timer_seconds: 30,
    anonymous: true,
    auto_reveal: true,
    auto_submit_behavior: 'no_answer',
    participant_mode: 'import',
    pair_vote_mode: 'one_each',
    game_type: 'monopoly',
    theme: 'default',
    participant_filter: 'all' as 'all' | 'joined',
    gender_based: true,
    describe_it_num_teams: 2,
    describe_it_mode: 'team',
  })
  const [describeItWords, setDescribeItWords] = useState('')
  const [describeItUploadError, setDescribeItUploadError] = useState<string | null>(null)
  const describeItFileRef = useRef<HTMLInputElement>(null)
  const [participants, setParticipants] = useState<ParticipantInput[]>([])
  const [nameInput, setNameInput] = useState('')
  const [defaultGender, setDefaultGender] = useState<ParticipantGender>('female')
  const [loading, setLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [result, setResult] = useState<{ gameCode: string; hostToken: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const questionsFileRef = useRef<HTMLInputElement>(null)
  const [bulkPaste, setBulkPaste] = useState('')
  const [questionSource, setQuestionSource] = useState<QuestionSource>('platform')
  const [playerQuestionsEnabled, setPlayerQuestionsEnabled] = useState(true)
  const [playerQuestionsOrder, setPlayerQuestionsOrder] = useState<PlayerQuestionsOrder>('players_first')
  const [aiQuestionsEnabled, setAiQuestionsEnabled] = useState(false)
  const [aiQuestionsRatio, setAiQuestionsRatio] = useState<'all_ai' | 'mostly_ai' | 'half' | 'mostly_platform'>('half')
  const [aiQuestionsTheme, setAiQuestionsTheme] = useState('')
  const [aiQuestionsCustomPrompt, setAiQuestionsCustomPrompt] = useState('')
  const [aiQuestionsApiKey, setAiQuestionsApiKey] = useState('')
  const [questionTab, setQuestionTab] = useState<QuestionTab>('upload')
  const [customWyrQuestions, setCustomWyrQuestions] = useState<WyrQuestion[]>([])
  const [customMltQuestions, setCustomMltQuestions] = useState<string[]>([])
  const [questionsUploadError, setQuestionsUploadError] = useState<string | null>(null)
  const [wyrOptionA, setWyrOptionA] = useState('')
  const [wyrOptionB, setWyrOptionB] = useState('')
  const [mltQuestionInput, setMltQuestionInput] = useState('')
  const [panRoundsInput, setPanRoundsInput] = useState('5')
  const [questionsBulkPaste, setQuestionsBulkPaste] = useState('')
  const [wstQuoteSource, setWstQuoteSource] = useState<WstQuoteSource>('player')
  const [customSlots, setCustomSlots] = useState<CustomSlotsConfig | null>(null)
  const [anonymousMaxPlayers, setAnonymousMaxPlayers] = useState(ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS)
  const [bingoMaxPlayers, setBingoMaxPlayers] = useState(BINGO_DEFAULT_MAX_PLAYERS)
  const [bingoCallMode, setBingoCallMode] = useState<BingoCallMode>(BINGO_DEFAULT_CALL_MODE)
  const [bingoCallInterval, setBingoCallInterval] = useState(BINGO_DEFAULT_CALL_INTERVAL)
  const [codewordsMaxPlayers, setCodewordsMaxPlayers] = useState(CODEWORDS_DEFAULT_MAX_PLAYERS)
  const [codewordsOperativeTimer, setCodewordsOperativeTimer] = useState(CODEWORDS_DEFAULT_OPERATIVE_TIMER)
  const [codewordsPlayerPicks, setCodewordsPlayerPicks] = useState(true)
  const [lateJoinPolicy, setLateJoinPolicy] = useState<LateJoinPolicy>('viewers_only')
  const [codewordsRandomizeTeams, setCodewordsRandomizeTeams] = useState(false)
  const [customCodewordsWords, setCustomCodewordsWords] = useState<string[]>([])
  const [codewordsWordInput, setCodewordsWordInput] = useState('')
  const [codewordsBulkPaste, setCodewordsBulkPaste] = useState('')
  const codewordsFileRef = useRef<HTMLInputElement>(null)
  const [triviaCategory, setTriviaCategory] = useState<TriviaCategory>('general')
  const [triviaMaxPlayers, setTriviaMaxPlayers] = useState(TRIVIA_DEFAULT_MAX_PLAYERS)
  const [ttlMaxPlayers, setTtlMaxPlayers] = useState(TTL_DEFAULT_MAX_PLAYERS)
  const [monopolyMaxPlayers, setMonopolyMaxPlayers] = useState(MONOPOLY_DEFAULT_MAX_PLAYERS)
  const [monopolyGameDuration, setMonopolyGameDuration] = useState(0)
  const [scrabbleGameDuration, setScrabbleGameDuration] = useState(0)
  const [scrabbleDictionary, setScrabbleDictionary] = useState<ScrabbleDictionaryId>(SCRABBLE_DEFAULT_DICTIONARY)
  const [chessBoardTheme, setChessBoardTheme] = useState('classic')
  const [chessPieceSet, setChessPieceSet] = useState('classic')
  const [yahtzeeMaxPlayers, setYahtzeeMaxPlayers] = useState(YAHTZEE_DEFAULT_MAX_PLAYERS)
  const [whotMaxPlayers, setWhotMaxPlayers] = useState(WHOT_DEFAULT_MAX_PLAYERS)
  const [whotGameDuration, setWhotGameDuration] = useState(0)
  const [whotPick3Enabled, setWhotPick3Enabled] = useState(true)
  const [whotPick2Stacking, setWhotPick2Stacking] = useState(true)
  const [whotCardsEnabled, setWhotCardsEnabled] = useState(true)
  const [whotNumberCallsEnabled, setWhotNumberCallsEnabled] = useState(true)
  const [crazy8MaxPlayers, setCrazy8MaxPlayers] = useState(CRAZY8_DEFAULT_MAX_PLAYERS)
  const [crazy8GameDuration, setCrazy8GameDuration] = useState(0)
  const [crazy8ActionCards, setCrazy8ActionCards] = useState(true)
  const [crazy8Jokers, setCrazy8Jokers] = useState(false)
  const [crazy8Pick2Stacking, setCrazy8Pick2Stacking] = useState(true)
  const [ludoMaxPlayers, setLudoMaxPlayers] = useState(LUDO_DEFAULT_MAX_PLAYERS)
  const [snakeLadderMaxPlayers, setSnakeLadderMaxPlayers] = useState(SNAKE_LADDER_DEFAULT_MAX_PLAYERS)
  const [npatMaxPlayers, setNpatMaxPlayers] = useState(NPAT_DEFAULT_MAX_PLAYERS)
  const [sudokuMaxPlayers, setSudokuMaxPlayers] = useState(20)
  const [wordHuntMaxPlayers, setWordHuntMaxPlayers] = useState(WORD_HUNT_DEFAULT_MAX_PLAYERS)
  const [wordHuntTimer, setWordHuntTimer] = useState(WORD_HUNT_DEFAULT_TIMER)
  const [npatGameDuration, setNpatGameDuration] = useState(NPAT_DEFAULT_GAME_DURATION)
  const [npatMarkingTimer, setNpatMarkingTimer] = useState(NPAT_DEFAULT_MARKING_TIMER)
  const [eliminationEnabled, setEliminationEnabled] = useState(false)
  const [eliminationMode, setEliminationMode] = useState<'per-round' | 'lives'>('per-round')
  const [eliminationRule, setEliminationRule] = useState<'bottom-n' | 'score-threshold'>('bottom-n')
  const [eliminateCount, setEliminateCount] = useState(1)
  const [scoreThreshold, setScoreThreshold] = useState(50)
  const [startingLives, setStartingLives] = useState(3)
  const [customTriviaQuestions, setCustomTriviaQuestions] = useState<TriviaQuestion[]>([])
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [libraryPackQuestions, setLibraryPackQuestions] = useState<unknown[]>([])
  const [libraryPacks, setLibraryPacks] = useState<
    { id: string; title: string; author_name: string; question_count: number }[]
  >([])
  const [libraryPacksLoading, setLibraryPacksLoading] = useState(false)
  const [libraryPackSearch, setLibraryPackSearch] = useState('')
  const [lobbyLimits, setLobbyLimits] = useState<GamePlayerLimitsMap | null>(null)
  const effectiveLimits = lobbyLimits ?? getCodeDefaultLimits()

  useEffect(() => {
    fetch('/api/game-limits')
      .then((res) => res.json())
      .then((data: { limits?: GamePlayerLimitsMap }) => {
        if (data.limits) setLobbyLimits(data.limits)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (questionSource !== 'library') return
    const gameTypeMap: Record<string, string> = {
      would_you_rather: 'would_you_rather',
      most_likely_to: 'most_likely_to',
      trivia: 'trivia',
      this_or_that: 'this_or_that',
      never_have_i_ever: 'never_have_i_ever',
    }
    const gt = gameTypeMap[settings.game_type]
    if (!gt) return
    setLibraryPackSearch('')
    setLibraryPacksLoading(true)
    fetch(`/api/library?game_type=${gt}&page_size=100`)
      .then((r) => r.json())
      .then((d) => setLibraryPacks(d.packs ?? []))
      .finally(() => setLibraryPacksLoading(false))
  }, [questionSource, settings.game_type])

  const selectLibraryPack = async (id: string) => {
    setSelectedPackId(id)
    const res = await fetch(`/api/library/${id}`)
    const data = await res.json()
    if (data.pack?.questions) {
      setLibraryPackQuestions(data.pack.questions)
      if (isTriviaGame(settings.game_type)) setCustomTriviaQuestions(data.pack.questions as TriviaQuestion[])
      else if (isWouldYouRather(settings.game_type) || isThisOrThat(settings.game_type))
        setCustomWyrQuestions(data.pack.questions as WyrQuestion[])
      else setCustomMltQuestions(data.pack.questions as string[])
    }
  }

  useEffect(() => {
    if (!lobbyLimits) return
    const clamp = (type: keyof GamePlayerLimitsMap, value: number) =>
      Math.min(lobbyLimits[type].max, Math.max(lobbyLimits[type].min, value))
    setAnonymousMaxPlayers((v) => clamp('anonymous_messages', v))
    setBingoMaxPlayers((v) => clamp('bingo', v))
    setCodewordsMaxPlayers((v) => clamp('codewords', v))
    setTriviaMaxPlayers((v) => clamp('trivia', v))
    setTtlMaxPlayers((v) => clamp('two_truths', v))
    setMonopolyMaxPlayers((v) => clamp('monopoly', v))
    setYahtzeeMaxPlayers((v) => clamp('yahtzee', v))
    setWhotMaxPlayers((v) => clamp('whot', v))
    setCrazy8MaxPlayers((v) => clamp('crazy_eights', v))
    setLudoMaxPlayers((v) => clamp('ludo', v))
    setSnakeLadderMaxPlayers((v) => clamp('snake_and_ladder', v))
    setNpatMaxPlayers((v) => clamp('i_call_on', v))
  }, [lobbyLimits])

  useEffect(() => {
    setLateJoinPolicy((prev) => clampLateJoinPolicyForGameType(prev, settings.game_type))
  }, [settings.game_type])

  useEffect(() => {
    const typeParam = searchParams.get('type')
    if (typeParam) {
      const type = parseGameType(typeParam)
      setSettings((prev) => ({
        ...prev,
        game_type: type,
        ...(isLobbyGame(type) ? { participant_mode: 'joiners', anonymous: true } : {}),
        ...(isAnonymousMessagesGame(type)
          ? { participant_mode: 'joiners' as const, anonymous: true, rounds_count: 1 }
          : {}),
        ...(isSecretMessageGame(type)
          ? { participant_mode: 'joiners' as const, anonymous: true, rounds_count: 1 }
          : {}),
        ...(isBingoGame(type) ? { participant_mode: 'joiners' as const, anonymous: true, rounds_count: 1 } : {}),
        ...(isCodewordsGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              timer_seconds: CODEWORDS_DEFAULT_SPYMASTER_TIMER,
            }
          : {}),
        ...(isTriviaGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: TRIVIA_DEFAULT_ROUNDS,
              timer_seconds: TRIVIA_DEFAULT_TIMER,
            }
          : {}),
        ...(isTwoTruthsGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              timer_seconds: TTL_DEFAULT_TIMER,
            }
          : {}),
        ...(isMonopolyGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              timer_seconds: MONOPOLY_DEFAULT_TURN_TIMER,
            }
          : {}),
        ...(isYahtzeeGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
            }
          : {}),
        ...(isWhotGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
            }
          : {}),
        ...(isCrazyEightsGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
            }
          : {}),
        ...(isLudoGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
            }
          : {}),
        ...(isSnakeAndLadderGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              timer_seconds: 30,
            }
          : {}),
        ...(isTicTacToeGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
            }
          : {}),
        ...(isChessGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              // Cumulative per-player clock (chess.com style). Default 10 minutes each.
              timer_seconds: 600,
            }
          : {}),
        ...(isScrabbleGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              // Optional per-turn timer; default off.
              timer_seconds: 0,
            }
          : {}),
        ...(isDescribeItGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: DESCRIBE_IT_DEFAULT_ROUNDS,
              timer_seconds: DESCRIBE_IT_DEFAULT_TURN_SECONDS,
              describe_it_num_teams: 2,
              describe_it_mode: 'team' as const,
            }
          : {}),
        ...(isWhoSaidThis(type)
          ? {
              participant_mode: 'import' as const,
              anonymous: true,
              participant_filter: 'joined' as const,
            }
          : isHotSeat(type)
            ? {
                participant_mode: 'joiners' as const,
                anonymous: true,
                participant_filter: 'all' as const,
                rounds_count: HOT_SEAT_MIN_PLAYERS,
              }
            : isMostLikelyTo(type)
              ? { participant_mode: 'voters' as const }
              : {}),
      }))
    }
    const packParam = searchParams.get('pack')
    if (packParam) {
      setQuestionSource('library')
      setSelectedPackId(packParam)
      fetch(`/api/library/${packParam}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.pack?.questions) return
          const gt = d.pack.game_type
          if (gt === 'trivia') setCustomTriviaQuestions(d.pack.questions as TriviaQuestion[])
          else if (gt === 'would_you_rather') setCustomWyrQuestions(d.pack.questions as WyrQuestion[])
          else setCustomMltQuestions(d.pack.questions as string[])
          setLibraryPackQuestions(d.pack.questions)
        })
        .catch(() => {})
    }
  }, [searchParams])

  const genderCounts = countByGender(participants)
  const isJoinersMode = settings.participant_mode === 'joiners'
  const isWyr = isWouldYouRather(settings.game_type)
  const isNhie = isNeverHaveIEver(settings.game_type)
  const isPan = isPickANumber(settings.game_type)

  useEffect(() => {
    if (isPan) setPanRoundsInput(String(settings.rounds_count))
  }, [settings.game_type]) // eslint-disable-line react-hooks/exhaustive-deps -- sync draft when switching game type
  const isTot = isThisOrThat(settings.game_type)
  const isBinaryLobby = isWyr || isTot || isNhie
  const isMlt = isMostLikelyTo(settings.game_type)
  const isTrivia = isTriviaGame(settings.game_type)
  const isTwoTruths = isTwoTruthsGame(settings.game_type)
  const isMonopoly = isMonopolyGame(settings.game_type)
  const isYahtzee = isYahtzeeGame(settings.game_type)
  const isWhot = isWhotGame(settings.game_type)
  useEffect(() => {
    if (!whotCardsEnabled) setWhotNumberCallsEnabled(false)
  }, [whotCardsEnabled])
  const isCrazy8 = isCrazyEightsGame(settings.game_type)
  const isLudo = isLudoGame(settings.game_type)
  const isSnakeLadder = isSnakeAndLadderGame(settings.game_type)
  const isTicTacToe = isTicTacToeGame(settings.game_type)
  const isChess = isChessGame(settings.game_type)
  const isScrabble = isScrabbleGame(settings.game_type)
  const isDescribeIt = isDescribeItGame(settings.game_type)
  const isNpat = isICallOnGame(settings.game_type)
  const isSudoku = isSudokuGame(settings.game_type)
  const isWordHunt = isWordHuntGame(settings.game_type)
  const showViewerToggle = gameSupportsViewerSetting(settings.game_type)
  const isWst = isWhoSaidThis(settings.game_type)
  const isHotSeatGame = isHotSeat(settings.game_type)
  const isPanGame = isPan
  const hotSeatCreateCapUpper = isHotSeatGame ? hotSeatMaxCapUpperBound(0, participants.length) : 20
  const panRoundOptions = panRoundPickerOptions(PAN_MAX_ROUNDS)
  const isPair = isPairGame(settings.game_type)
  const isCustom = isCustomGame(settings.game_type)
  const isEliminationCompatible = ELIMINATION_COMPATIBLE_TYPES.includes(
    settings.game_type as (typeof ELIMINATION_COMPATIBLE_TYPES)[number]
  )
  const isCustomTwoSlot = isCustom && (customSlots?.slots.length ?? 0) === 2
  const supportsGender = supportsGenderToggle(settings.game_type)
  const participantOpts = {
    genderBased: settings.gender_based,
    customSlots: customSlots,
  }
  const questionCustomHint = getQuestionCustomContentHint(settings.game_type)
  const participantCustomHint = getParticipantCustomContentHint(settings.game_type, participantOpts)
  const needsGender = participantsNeedGenderForGame(settings.game_type, participantOpts)
  const minPool = isCustom && customSlots ? customSlots.slots.length : roundPoolSize(settings.game_type)
  const canCreateImport =
    participants.length >= minPool && hasEnoughForRounds(participants, settings.game_type, participantOpts)
  const canCreateJoiners = !!settings.title.trim()
  const isLobbyQuestions = isBinaryLobby || isMlt || isTrivia || isPan
  const isPeoplePoll = isPeoplePollGame(settings.game_type)
  const isPeoplePollVoters = isPeoplePoll && settings.participant_mode === 'voters'
  const isPlayerSubmissions = (isLobbyQuestions && !isTrivia) || isPeoplePollVoters
  const customQuestionCount = isTrivia
    ? customTriviaQuestions.length
    : isWyr || isTot
      ? customWyrQuestions.length
      : isMlt || isNhie || isPan
        ? customMltQuestions.length
        : 0
  const questionCap =
    (questionSource === 'custom' || questionSource === 'library') && customQuestionCount > 0
      ? customQuestionCount
      : isTot
        ? customQuestionCount
        : isTrivia
          ? TRIVIA_QUESTION_COUNT
          : isWyr
            ? WYR_QUESTION_COUNT
            : isNhie
              ? NHIE_QUESTION_COUNT
              : isPan
                ? PAN_QUESTION_COUNT
                : isMlt
                  ? MLT_QUESTION_COUNT
                  : 10
  const mltRoundOptions = questionRoundPickerOptions(questionCap)
  const wyrRoundOptions = questionRoundPickerOptions(questionCap)
  const wstRoundOptions = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20].filter((n) => n <= Math.max(participants.length, 2))
  const roundOptions = isPan
    ? panRoundOptions
    : isBinaryLobby
      ? wyrRoundOptions
      : isMlt
        ? mltRoundOptions
        : isTrivia
          ? questionRoundPickerOptions(questionCap)
          : isWst
            ? wstRoundOptions
            : [2, 3, 4, 5, 6, 8, 10]
  const hasEnoughCustomQuestions =
    (isTot && customQuestionCount >= settings.rounds_count && customQuestionCount > 0) ||
    (questionSource === 'platform' && !isTot && !isPan) ||
    (isPan && questionSource === 'platform') ||
    (isPan && questionSource === 'custom' && customQuestionCount >= PAN_MIN_POOL && customQuestionCount > 0) ||
    (isLobbyQuestions && !isTot && !isPan && customQuestionCount >= settings.rounds_count && customQuestionCount > 0) ||
    (questionSource === 'library' &&
      libraryPackQuestions.length >= settings.rounds_count &&
      libraryPackQuestions.length > 0)
  const canCreateQuickLobby = !!settings.title.trim() && hasEnoughCustomQuestions

  const customSlotsValid =
    !isCustom || (customSlots && customSlots.slots.length >= 2 && customSlots.slots.every((s) => s.label.trim()))

  const isAnonymousRoom = isAnonymousMessagesGame(settings.game_type)
  const isSecretMessage = isSecretMessageGame(settings.game_type)
  const isBingo = isBingoGame(settings.game_type)
  const isCodewords = isCodewordsGame(settings.game_type)
  const isMessageBoard = isAnonymousRoom || isSecretMessage
  const isQuickLobby =
    isMessageBoard ||
    isBingo ||
    isCodewords ||
    isTwoTruths ||
    isMonopoly ||
    isYahtzee ||
    isWhot ||
    isCrazy8 ||
    isLudo ||
    isSnakeLadder ||
    isTicTacToe ||
    isChess ||
    isScrabble ||
    isDescribeIt ||
    isNpat ||
    isSudoku ||
    isWordHunt
  const isTriviaQuickCreate = isTrivia
  const needsParticipantStep =
    !isQuickLobby && !isTriviaQuickCreate && !isBinaryLobby && !(isMlt && isJoinersMode) && !isJoinersMode
  const wizardSteps = needsParticipantStep ? ['Setup', 'People'] : ['Setup']
  const stepIndex = step === 'participants' ? 2 : 1

  useEffect(() => {
    if (step === 'done') scrollHostViewToTop()
  }, [step])

  useEffect(() => {
    if (isPan) return
    if (
      (questionSource === 'custom' || questionSource === 'library') &&
      customQuestionCount > 0 &&
      settings.rounds_count > customQuestionCount
    ) {
      setSettings((prev) => ({ ...prev, rounds_count: customQuestionCount }))
    }
  }, [customQuestionCount, questionSource, settings.rounds_count, isPan])

  const selectGameType = (type: GameType) => {
    setCustomSlots(null)
    setWstQuoteSource('player')
    setQuestionSource(isThisOrThat(type) ? 'custom' : 'platform')
    setPlayerQuestionsEnabled(true)
    setPlayerQuestionsOrder('players_first')
    setCustomWyrQuestions([])
    setCustomMltQuestions([])
    setCustomTriviaQuestions([])
    setSelectedPackId(null)
    setLibraryPackQuestions([])
    setTriviaCategory('general')
    setQuestionsUploadError(null)
    if (isICallOnGame(type)) {
      setNpatGameDuration(NPAT_DEFAULT_GAME_DURATION)
      setNpatMarkingTimer(NPAT_DEFAULT_MARKING_TIMER)
    }
    setSettings({
      ...settings,
      game_type: type,
      ...(isLobbyGame(type) ? { participant_mode: 'joiners', anonymous: true } : {}),
      ...(isAnonymousMessagesGame(type)
        ? { participant_mode: 'joiners' as const, anonymous: true, rounds_count: 1 }
        : {}),
      ...(isSecretMessageGame(type) ? { participant_mode: 'joiners' as const, anonymous: true, rounds_count: 1 } : {}),
      ...(isBingoGame(type) ? { participant_mode: 'joiners' as const, anonymous: true, rounds_count: 1 } : {}),
      ...(isCodewordsGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: CODEWORDS_DEFAULT_SPYMASTER_TIMER,
          }
        : {}),
      ...(isTriviaGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: TRIVIA_DEFAULT_ROUNDS,
            timer_seconds: TRIVIA_DEFAULT_TIMER,
          }
        : {}),
      ...(isTwoTruthsGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: TTL_DEFAULT_TIMER,
          }
        : {}),
      ...(isMonopolyGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: MONOPOLY_DEFAULT_TURN_TIMER,
          }
        : {}),
      ...(isYahtzeeGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 0,
          }
        : {}),
      ...(isWhotGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 0,
          }
        : {}),
      ...(isCrazyEightsGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 0,
          }
        : {}),
      ...(isLudoGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 60,
          }
        : {}),
      ...(isSnakeAndLadderGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 30,
          }
        : {}),
      ...(isChessGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            // Cumulative per-player clock (chess.com style). Default 10 minutes each.
            timer_seconds: 600,
          }
        : {}),
      ...(isICallOnGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: NPAT_DEFAULT_TIMER,
          }
        : {}),
      ...(isSudokuGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
          }
        : {}),
      ...(isWordHuntGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: WORD_HUNT_DEFAULT_TIMER,
          }
        : {}),
      ...(isWhoSaidThis(type)
        ? {
            participant_mode: 'import' as const,
            anonymous: true,
            participant_filter: 'joined' as const,
          }
        : isPickANumber(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 5,
            }
          : isHotSeat(type)
            ? {
                participant_mode: 'joiners' as const,
                anonymous: true,
                participant_filter: 'all' as const,
                rounds_count: HOT_SEAT_MIN_PLAYERS,
              }
            : isMostLikelyTo(type)
              ? { participant_mode: 'voters' as const }
              : {}),
      ...(isCustomGame(type)
        ? { participant_mode: 'import' as const, gender_based: defaultGenderBasedForType(type) }
        : {}),
      ...(supportsGenderToggle(type) && !isCustomGame(type) ? { gender_based: defaultGenderBasedForType(type) } : {}),
    })
  }

  const addParticipantsFromRows = (rows: ParticipantInput[]) => {
    if (rows.length === 0) return 0
    setParticipants((prev) => mergeParticipants(prev, rows))
    return rows.length
  }

  const addParticipant = () => {
    const name = nameInput.trim()
    if (!name) return
    addParticipantsFromRows([{ name, gender: defaultGender }])
    setNameInput('')
    inputRef.current?.focus()
  }

  const addBulkParticipants = () => {
    if (!bulkPaste.trim()) return
    setUploadError(null)
    const rows = parseParticipantsForGame(bulkPaste, settings.game_type, participantOpts)
    if (rows.length === 0) {
      setUploadError(needsGender ? 'Use two columns: name and gender (e.g. Sarah,female)' : 'Add one name per line')
      return
    }
    addParticipantsFromRows(rows)
    setBulkPaste('')
  }

  const handleNamePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!/[\n\r\t,;]/.test(text)) return
    e.preventDefault()
    const rows = parseParticipantsForGame(text, settings.game_type, participantOpts)
    if (rows.length > 0) {
      addParticipantsFromRows(rows)
      setNameInput('')
    } else if (needsGender) {
      const names = text
        .split(/[\n\r\t,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      addParticipantsFromRows(names.map((name) => ({ name, gender: defaultGender })))
      setNameInput('')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploadError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()

    try {
      if (ext === 'csv') {
        const text = await file.text()
        const rows = parseParticipantsForGame(text, settings.game_type, participantOpts)
        if (rows.length === 0) {
          setUploadError(
            needsGender
              ? 'No valid rows found. First column: name. Second column: gender (male/female).'
              : 'No valid rows found. Add one name per line.'
          )
          return
        }
        addParticipantsFromRows(rows)
        return
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        const rows = await parseExcelParticipants(buffer, settings.game_type, participantOpts)
        if (rows.length === 0) {
          setUploadError(
            needsGender
              ? 'No valid rows found. First column: name. Second column: gender (male/female).'
              : 'No valid rows found. Add one name per line.'
          )
          return
        }
        addParticipantsFromRows(rows)
        return
      }

      setUploadError('Please upload a .csv or .xlsx file')
    } catch {
      setUploadError(
        needsGender
          ? 'Could not read that file. Try the sample CSV (name + gender).'
          : 'Could not read that file. Try the sample CSV (names only).'
      )
    }
  }

  const removeParticipant = (i: number) => setParticipants((prev) => prev.filter((_, idx) => idx !== i))

  const addCustomQuestionsFromRows = (wyrRows: WyrQuestion[], mltRows: string[], triviaRows: TriviaQuestion[] = []) => {
    if ((isWyr || isTot) && wyrRows.length > 0) {
      setCustomWyrQuestions((prev) => mergeWyrQuestions(prev, wyrRows))
    }
    if (isMlt && mltRows.length > 0) {
      setCustomMltQuestions((prev) => mergeMltQuestions(prev, mltRows))
    }
    if ((isNhie || isPan) && mltRows.length > 0) {
      setCustomMltQuestions((prev) => mergeMltQuestions(prev, mltRows))
    }
    if (isTrivia && triviaRows.length > 0) {
      setCustomTriviaQuestions((prev) => mergeTriviaQuestions(prev, triviaRows))
    }
  }

  const addManualQuestion = () => {
    setQuestionsUploadError(null)
    if (isWyr) {
      const optionA = wyrOptionA.trim()
      const optionB = wyrOptionB.trim()
      if (!optionA || !optionB) return
      addCustomQuestionsFromRows([{ optionA, optionB }], [])
      setWyrOptionA('')
      setWyrOptionB('')
      return
    }
    if (isTot) {
      const parsed = parseOrSplitQuestion(mltQuestionInput)
      if (!parsed) {
        setQuestionsUploadError('Use “Coffee or Tea?” format with “ or ” between options')
        return
      }
      addCustomQuestionsFromRows([parsed], [])
      setMltQuestionInput('')
      return
    }
    if (isMlt || isNhie || isPan) {
      const question = mltQuestionInput.trim()
      if (!question) return
      addCustomQuestionsFromRows([], [question])
      setMltQuestionInput('')
    }
  }

  const addBulkQuestions = () => {
    if (!questionsBulkPaste.trim()) return
    setQuestionsUploadError(null)
    if (isWyr) {
      const rows = parseWyrQuestionRows(questionsBulkPaste)
      if (rows.length === 0) {
        setQuestionsUploadError('Use two columns: option_a and option_b')
        return
      }
      addCustomQuestionsFromRows(rows, [])
    } else if (isTot) {
      const rows = parseThisOrThatQuestionRows(questionsBulkPaste)
      if (rows.length === 0) {
        setQuestionsUploadError('Add one question per line (e.g. Coffee or Tea?)')
        return
      }
      addCustomQuestionsFromRows(rows, [])
    } else if (isMlt || isNhie || isPan) {
      const rows = parseMltQuestionRows(questionsBulkPaste)
      if (rows.length === 0) {
        setQuestionsUploadError('Add one question per line')
        return
      }
      addCustomQuestionsFromRows([], rows)
    } else if (isTrivia) {
      const result = parseTriviaQuestionImport(questionsBulkPaste, triviaCategory)
      if (result.questions.length === 0) {
        setQuestionsUploadError('Use: question, option_a, option_b, option_c, option_d, correct')
        return
      }
      addCustomQuestionsFromRows([], [], result.questions)
    }
    setQuestionsBulkPaste('')
  }

  const handleQuestionsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setQuestionsUploadError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()

    try {
      if (ext === 'csv') {
        const text = await file.text()
        if (isWyr) {
          const rows = parseWyrQuestionRows(text)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Use option_a and option_b columns.')
            return
          }
          addCustomQuestionsFromRows(rows, [])
        } else if (isTot) {
          const rows = parseThisOrThatQuestionRows(text)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Use one question per line (e.g. Coffee or Tea?).')
            return
          }
          addCustomQuestionsFromRows(rows, [])
        } else if (isMlt || isNhie || isPan) {
          const rows = parseMltQuestionRows(text)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Add one question per line.')
            return
          }
          addCustomQuestionsFromRows([], rows)
        } else if (isTrivia) {
          const result = parseTriviaQuestionImport(text, triviaCategory)
          if (result.questions.length === 0) {
            setQuestionsUploadError('No valid rows. Use question, options, and correct answer columns.')
            return
          }
          setCustomTriviaQuestions(result.questions)
          setQuestionsUploadError(formatTriviaImportSummary(result))
        }
        return
      }

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer()
        if (isWyr) {
          const rows = await parseExcelWyrQuestions(buffer)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Use option_a and option_b columns.')
            return
          }
          addCustomQuestionsFromRows(rows, [])
        } else if (isTot) {
          const rows = await parseExcelThisOrThatQuestions(buffer)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Use one question per line (e.g. Coffee or Tea?).')
            return
          }
          addCustomQuestionsFromRows(rows, [])
        } else if (isMlt || isNhie || isPan) {
          const rows = await parseExcelMltQuestions(buffer)
          if (rows.length === 0) {
            setQuestionsUploadError('No valid rows. Add one question per line.')
            return
          }
          addCustomQuestionsFromRows([], rows)
        } else if (isTrivia) {
          const result = await parseExcelTriviaQuestionImport(buffer, triviaCategory)
          if (result.questions.length === 0) {
            setQuestionsUploadError('No valid rows. Use question, options, and correct answer columns.')
            return
          }
          setCustomTriviaQuestions(result.questions)
          setQuestionsUploadError(formatTriviaImportSummary(result))
        }
        return
      }

      setQuestionsUploadError('Please upload a .csv or .xlsx file')
    } catch {
      setQuestionsUploadError('Could not read that file. Try the sample CSV.')
    }
  }

  const removeCustomQuestion = (index: number) => {
    if (isWyr || isTot) setCustomWyrQuestions((prev) => prev.filter((_, i) => i !== index))
    if (isMlt || isNhie || isPan) setCustomMltQuestions((prev) => prev.filter((_, i) => i !== index))
    if (isTrivia) setCustomTriviaQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  const createGame = async () => {
    if (loading) return
    if (isQuickLobby) {
      if (!settings.title.trim()) return
      if (isCodewords && questionSource === 'custom' && customCodewordsWords.length < CODEWORDS_MIN_CUSTOM_POOL) return
    } else if (isTriviaQuickCreate) {
      if (!canCreateQuickLobby) return
    } else if (isJoinersMode ? !canCreateJoiners : !canCreateImport) return
    setLoading(true)
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          ...(isWordHunt ? { timer_seconds: wordHuntTimer } : {}),
          rounds_count: isWst ? Math.max(participants.length, 2) : settings.rounds_count,
          question_source: isCodewords
            ? questionSource
            : isDescribeIt
              ? questionSource === 'custom' && parseDescribeItWords(describeItWords).length > 0
                ? 'custom'
                : 'platform'
              : isTot
                ? 'custom'
                : isLobbyQuestions
                  ? questionSource === 'library'
                    ? 'custom'
                    : questionSource
                  : 'platform',
          custom_questions: isCodewords
            ? questionSource === 'custom'
              ? customCodewordsWords
              : null
            : isDescribeIt
              ? questionSource === 'custom' && parseDescribeItWords(describeItWords).length > 0
                ? parseDescribeItWords(describeItWords)
                : null
              : isLobbyQuestions && (isTot || questionSource === 'custom' || questionSource === 'library')
                ? isWyr || isTot
                  ? customWyrQuestions
                  : isTrivia
                    ? customTriviaQuestions
                    : customMltQuestions
                : null,
          trivia_category: isTrivia ? triviaCategory : undefined,
          describe_it_mode: isDescribeIt ? settings.describe_it_mode : undefined,
          participants: isJoinersMode ? [] : participants,
          wst_quote_source: isWst ? wstQuoteSource : undefined,
          custom_slots: isCustom ? customSlots : null,
          gender_based: supportsGender ? settings.gender_based : undefined,
          player_questions_enabled: isPlayerSubmissions ? playerQuestionsEnabled : undefined,
          player_questions_order: isPlayerSubmissions ? playerQuestionsOrder : undefined,
          ai_questions_enabled: isLobbyQuestions && !isTrivia ? aiQuestionsEnabled : undefined,
          ai_questions_config:
            isLobbyQuestions && !isTrivia && aiQuestionsEnabled
              ? {
                  ratio: aiQuestionsRatio,
                  ...(aiQuestionsTheme ? { theme: aiQuestionsTheme } : {}),
                  ...(aiQuestionsCustomPrompt ? { customPrompt: aiQuestionsCustomPrompt } : {}),
                }
              : undefined,
          max_players: isAnonymousRoom
            ? anonymousMaxPlayers
            : isBingo
              ? bingoMaxPlayers
              : isCodewords
                ? codewordsMaxPlayers
                : isTrivia
                  ? triviaMaxPlayers
                  : isTwoTruths
                    ? ttlMaxPlayers
                    : isMonopoly
                      ? monopolyMaxPlayers
                      : isYahtzee
                        ? yahtzeeMaxPlayers
                        : isWhot
                          ? whotMaxPlayers
                          : isCrazy8
                            ? crazy8MaxPlayers
                            : isLudo
                              ? ludoMaxPlayers
                              : isSnakeLadder
                                ? snakeLadderMaxPlayers
                                : isNpat
                                  ? npatMaxPlayers
                                  : isSudoku
                                    ? sudokuMaxPlayers
                                    : isWordHunt
                                      ? wordHuntMaxPlayers
                                      : undefined,
          operative_timer_seconds: isCodewords ? codewordsOperativeTimer : isNpat ? npatMarkingTimer : undefined,
          codewords_player_picks: isCodewords ? codewordsPlayerPicks : undefined,
          codewords_late_join: isCodewords ? lateJoinPolicy === 'viewers_and_players' : undefined,
          codewords_randomize_teams: isCodewords ? codewordsRandomizeTeams : undefined,
          allow_viewers: gameSupportsViewerSetting(settings.game_type) ? lateJoinPolicy !== 'lobby_only' : undefined,
          allow_late_players: gameSupportsViewerSetting(settings.game_type)
            ? lateJoinPolicy === 'viewers_and_players'
            : undefined,
          late_join_policy: gameSupportsViewerSetting(settings.game_type) ? lateJoinPolicy : undefined,
          bingo_call_mode: isBingo ? bingoCallMode : undefined,
          bingo_call_interval_seconds: isBingo ? bingoCallInterval : undefined,
          game_duration_seconds: isMonopoly
            ? monopolyGameDuration
            : isWhot
              ? whotGameDuration
              : isCrazy8
                ? crazy8GameDuration
                : isNpat
                  ? npatGameDuration
                  : isScrabble
                    ? scrabbleGameDuration
                    : undefined,
          whot_pick3_enabled: isWhot ? whotPick3Enabled : undefined,
          whot_pick2_stacking: isWhot ? whotPick2Stacking : undefined,
          whot_cards_enabled: isWhot ? whotCardsEnabled : undefined,
          whot_number_calls_enabled: isWhot ? whotNumberCallsEnabled : undefined,
          crazy8_action_cards: isCrazy8 ? crazy8ActionCards : undefined,
          crazy8_jokers: isCrazy8 ? crazy8Jokers : undefined,
          crazy8_pick2_stacking: isCrazy8 ? crazy8Pick2Stacking : undefined,
          scrabble_dictionary_id: isScrabble ? scrabbleDictionary : undefined,
          chess_board_theme: isChess ? chessBoardTheme : undefined,
          chess_piece_set: isChess ? chessPieceSet : undefined,
          elimination_config:
            eliminationEnabled && isEliminationCompatible
              ? eliminationMode === 'per-round'
                ? {
                    mode: 'per-round' as const,
                    rule: eliminationRule,
                    ...(eliminationRule === 'bottom-n'
                      ? { eliminateCount: Math.min(10, Math.max(1, Math.trunc(eliminateCount) || 1)) }
                      : { threshold: Math.max(0, Math.trunc(scoreThreshold) || 0) }),
                  }
                : {
                    mode: 'lives' as const,
                    startingLives: Math.min(10, Math.max(1, Math.trunc(startingLives) || 1)),
                    livesLostRule: 'bottom-n' as const,
                    eliminateCount: Math.min(10, Math.max(1, Math.trunc(eliminateCount) || 1)),
                  }
              : undefined,
        }),
      })
      const data = await res.json()
      if (data.gameCode) {
        setResult(data)
        setStep('done')
        const roomParam = searchParams.get('room')
        const memberParam = searchParams.get('member')
        if (roomParam) {
          fetch(`/api/rooms/${roomParam}/games`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameCode: data.gameCode, memberCode: memberParam ?? '' }),
          }).catch(() => {})
        }
      } else {
        toast.error(data.error || 'Failed to create game')
      }
    } finally {
      setLoading(false)
    }
  }

  if (step === 'settings') {
    return (
      <>
        <PageShell>
          <BackBtn onClick={() => router.push('/')} label="Home" />

          {needsParticipantStep && <StepIndicator steps={wizardSteps} current={stepIndex} />}

          <div>
            <p className="label-caps mb-1">New game</p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title-subtle">Create Game</h1>
          </div>

          {/* Essentials */}
          <div className="glass-card-strong p-5 space-y-4">
            <Field label="Game name" action={<GameRulesLink gameType={settings.game_type} variant="subtle" />}>
              <input
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="Friday Night KMS"
                autoFocus
                className="input-field"
              />
            </Field>

            <Field label="Game mode">
              <GameTypeCard type={settings.game_type} compact selected onClick={() => setShowGameTypes(true)} />
            </Field>
          </div>

          {/* Theme */}
          <div className="glass-card p-5 space-y-3">
            <p className="label-caps">Theme</p>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {THEMES.map((t) => (
                <ThemePreviewCard
                  key={t.id}
                  theme={t}
                  selected={settings.theme === t.id}
                  onClick={() => setSettings({ ...settings, theme: t.id })}
                  onPreview={() => setPreviewTheme(t)}
                />
              ))}
            </div>
          </div>

          {/* Rules */}
          <div className="glass-card p-5 space-y-5">
            {isSecretMessage ? (
              <SettingsGroup title="Your board">
                <p className="text-faint text-sm leading-relaxed">
                  Your link goes live as soon as you create it. Share it on Instagram, WhatsApp, or anywhere — anyone
                  can send you a message without signing up. Only you see the inbox on your host panel. Close the board
                  anytime to stop new messages; reopening clears the inbox for a fresh start.
                </p>
              </SettingsGroup>
            ) : isAnonymousRoom ? (
              <SettingsGroup title="Session">
                <Field
                  label={`Max players (${effectiveLimits.anonymous_messages.min}–${effectiveLimits.anonymous_messages.max})`}
                >
                  <select
                    value={anonymousMaxPlayers}
                    onChange={(e) => setAnonymousMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(
                      effectiveLimits.anonymous_messages.min,
                      effectiveLimits.anonymous_messages.max
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Late joiners">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} />
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Players join with one tap and get a random lobby name shown on their messages. The cap applies to the
                  lobby before start. With &quot;Allow viewers&quot;, people can watch after the session starts
                  (read-only). players can read but not send. Once over 1,000 messages, the oldest 100 are removed every
                  5 minutes during the session. Sessions last up to 15 minutes — all messages are deleted when the
                  session ends.
                </p>
              </SettingsGroup>
            ) : isBingo ? (
              <SettingsGroup title="Bingo room">
                <Field label={`Max players (${effectiveLimits.bingo.min}–${effectiveLimits.bingo.max})`}>
                  <select
                    value={bingoMaxPlayers}
                    onChange={(e) => setBingoMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.bingo.min, effectiveLimits.bingo.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Number calling">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setBingoCallMode('manual')}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        bingoCallMode === 'manual'
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Manual</span>
                      <span className="text-faint text-xs sm:text-sm">You tap to call each number</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBingoCallMode('auto')}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        bingoCallMode === 'auto'
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Automatic</span>
                      <span className="text-faint text-xs sm:text-sm">Numbers called for you</span>
                    </button>
                  </div>
                </Field>
                {bingoCallMode === 'auto' && (
                  <Field label="Seconds between calls">
                    <select
                      value={bingoCallInterval}
                      onChange={(e) => setBingoCallInterval(Number(e.target.value))}
                      className="input-field w-full"
                    >
                      {BINGO_CALL_INTERVAL_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s} seconds
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {showViewerToggle && (
                  <Field label="Late joiners">
                    <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} />
                  </Field>
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Players join with their name and get a unique 5×5 card. Called squares turn blue on their card; they
                  tap blue to mark green, then tap BINGO when they complete a line.
                  {bingoCallMode === 'auto'
                    ? ' Numbers are called automatically — no tapping required from the host.'
                    : ' You call numbers B1–O75 from the host panel.'}
                </p>
              </SettingsGroup>
            ) : isTwoTruths ? (
              <SettingsGroup title="Two Truths & a Lie">
                <Field label={`Max players (${effectiveLimits.two_truths.min}–${effectiveLimits.two_truths.max})`}>
                  <select
                    value={ttlMaxPlayers}
                    onChange={(e) => setTtlMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.two_truths.min, effectiveLimits.two_truths.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Guess timer (per round)">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    {TTL_TIMER_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s} seconds
                      </option>
                    ))}
                  </select>
                </Field>
                {showViewerToggle && (
                  <Field label="Late joiners">
                    <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} />
                  </Field>
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Everyone writes two truths and one lie in the lobby. Each round spotlights one player — the rest guess
                  which statement is the lie. Correct guesses earn points; fool the room for bonus points.
                </p>
              </SettingsGroup>
            ) : isMonopoly ? (
              <SettingsGroup title="Monopoly room">
                <Field label={`Max players (${effectiveLimits.monopoly.min}–${effectiveLimits.monopoly.max})`}>
                  <select
                    value={monopolyMaxPlayers}
                    onChange={(e) => setMonopolyMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.monopoly.min, effectiveLimits.monopoly.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Turn timer">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    <option value={0}>No timer</option>
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                    <option value={90}>90 seconds</option>
                  </select>
                </Field>
                <Field label="Game length">
                  <select
                    value={monopolyGameDuration}
                    onChange={(e) => setMonopolyGameDuration(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {MONOPOLY_GAME_DURATION_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {formatMonopolyGameDuration(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Late joiners">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="monopoly" />
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Players join with their name and start on GO with £1,500. Take turns rolling dice, buying properties,
                  paying rent, and drawing cards. Last player standing wins! If someone stalls, their turn
                  auto-resolves. Set a game length to end automatically — the richest player wins when time runs out.
                </p>
              </SettingsGroup>
            ) : isYahtzee ? (
              <SettingsGroup title="Yahtzee room">
                <Field label={`Max players (${effectiveLimits.yahtzee.min}–${effectiveLimits.yahtzee.max})`}>
                  <select
                    value={yahtzeeMaxPlayers}
                    onChange={(e) => setYahtzeeMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.yahtzee.min, effectiveLimits.yahtzee.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Turn timer">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    <option value={0}>No timer</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                    <option value={90}>90 seconds</option>
                    <option value={120}>2 minutes</option>
                  </select>
                </Field>
                <Field label="Late joiners">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="yahtzee" />
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Play solo or with up to six friends. Take turns rolling 5 dice, holding what you want, and scoring an
                  unused category on your sheet. Highest total score at the end wins!
                </p>
              </SettingsGroup>
            ) : isWhot ? (
              <SettingsGroup title="Whot room">
                <Field label={`Max players (${effectiveLimits.whot.min}–${effectiveLimits.whot.max})`}>
                  <select
                    value={whotMaxPlayers}
                    onChange={(e) => setWhotMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.whot.min, effectiveLimits.whot.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Turn timer">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    {turnTimerOptionsFor('whot').map((s) => (
                      <option key={s} value={s}>
                        {formatBoardGameTurnTimer(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Game length">
                  <select
                    value={whotGameDuration}
                    onChange={(e) => setWhotGameDuration(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {WHOT_GAME_DURATION_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {formatWhotGameDuration(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Late joiners">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="whot" />
                </Field>
                <Field label="House rules">
                  <div className="space-y-2">
                    <Toggle
                      label="Pick 3"
                      description="Include 5 cards and the Pick 3 draw penalty"
                      value={whotPick3Enabled}
                      onChange={setWhotPick3Enabled}
                    />
                    <Toggle
                      label="Stack Pick 2"
                      description="On: defend a Pick 2 with your own 2 (next player draws more). Off: you must draw it."
                      value={whotPick2Stacking}
                      onChange={setWhotPick2Stacking}
                    />
                    <Toggle
                      label="WHOT cards"
                      description="Include WHOT wild cards in the deck"
                      value={whotCardsEnabled}
                      onChange={setWhotCardsEnabled}
                    />
                    <div className={whotCardsEnabled ? undefined : 'opacity-50 pointer-events-none'}>
                      <Toggle
                        label="Numbers on WHOT"
                        description="Let players call a number (not just a shape) when playing WHOT"
                        value={whotNumberCallsEnabled}
                        onChange={setWhotNumberCallsEnabled}
                      />
                    </div>
                  </div>
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Nigerian card classic — match shape or number
                  {whotCardsEnabled ? ', play WHOT to call the next match' : ''}. Pick 2
                  {whotPick3Enabled ? ' and Pick 3 stacks are separate' : ' is active'}. First to empty their hand wins!
                  With a game length set, time running out ends the game — whoever has the lowest total on the cards
                  left in their hand wins.
                </p>
              </SettingsGroup>
            ) : isCrazy8 ? (
              <SettingsGroup title="Crazy Eights room">
                <Field label={`Max players (${effectiveLimits.crazy_eights.min}–${effectiveLimits.crazy_eights.max})`}>
                  <select
                    value={crazy8MaxPlayers}
                    onChange={(e) => setCrazy8MaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.crazy_eights.min, effectiveLimits.crazy_eights.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Turn timer">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    {turnTimerOptionsFor('crazy_eights').map((s) => (
                      <option key={s} value={s}>
                        {formatBoardGameTurnTimer(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Game length">
                  <select
                    value={crazy8GameDuration}
                    onChange={(e) => setCrazy8GameDuration(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {CRAZY8_GAME_DURATION_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {formatCrazyEightsGameDuration(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Late joiners">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="crazy_eights" />
                </Field>
                <Field label="House rules">
                  <div className="space-y-2">
                    <Toggle
                      label="Action cards"
                      description="Enable 2 (Pick Two), J & A (Skip), Q (Reverse). Off: only the 8 is wild."
                      value={crazy8ActionCards}
                      onChange={setCrazy8ActionCards}
                    />
                    <Toggle
                      label="Jokers"
                      description="Add 2 Jokers — wild cards that make the next player draw 5"
                      value={crazy8Jokers}
                      onChange={setCrazy8Jokers}
                    />
                    <div className={crazy8ActionCards ? undefined : 'opacity-50 pointer-events-none'}>
                      <Toggle
                        label="Stack Pick 2"
                        description="On: defend a 2 with your own 2 (next player draws more). Off: you must draw it."
                        value={crazy8Pick2Stacking}
                        onChange={setCrazy8Pick2Stacking}
                      />
                    </div>
                  </div>
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  The worldwide card classic — match the top card by rank or suit. Play an 8 anytime to name the next
                  suit{crazy8ActionCards ? '; 2 makes them draw, J & A skip, Q reverses' : ''}. First to empty their
                  hand wins! With a game length set, time running out ends the game — whoever has the lowest total on
                  the cards left in their hand wins.
                </p>
              </SettingsGroup>
            ) : isLudo ? (
              <SettingsGroup title="Ludo room">
                <Field label={`Max players (${effectiveLimits.ludo.min}–${effectiveLimits.ludo.max})`}>
                  <select
                    value={ludoMaxPlayers}
                    onChange={(e) => setLudoMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.ludo.min, effectiveLimits.ludo.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Turn timer">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    <option value={0}>No timer</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                    <option value={90}>90 seconds</option>
                  </select>
                </Field>
                <Field label="Late joiners">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="ludo" />
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Classic Ludo — roll two dice to enter, race around the board, capture opponents, and block with pairs.
                  Exact rolls needed to finish. First to get all four pieces home wins!
                </p>
              </SettingsGroup>
            ) : isSnakeLadder ? (
              <SettingsGroup title="Snake & Ladder room">
                <Field
                  label={`Max players (${effectiveLimits.snake_and_ladder.min}–${effectiveLimits.snake_and_ladder.max})`}
                >
                  <select
                    value={snakeLadderMaxPlayers}
                    onChange={(e) => setSnakeLadderMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.snake_and_ladder.min, effectiveLimits.snake_and_ladder.max).map(
                      (n) => (
                        <option key={n} value={n}>
                          {n} players
                        </option>
                      )
                    )}
                  </select>
                </Field>
                <Field label="Turn timer">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    <option value={0}>No timer</option>
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                    <option value={90}>90 seconds</option>
                  </select>
                </Field>
                <Field label="Late joiners">
                  <LateJoinPolicyToggle
                    value={lateJoinPolicy}
                    onChange={setLateJoinPolicy}
                    gameType="snake_and_ladder"
                  />
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Classic Snakes &amp; Ladders — roll one die, climb the ladders, dodge the snakes. Roll a 6 to go
                  again. First to land on 100 exactly wins!
                </p>
              </SettingsGroup>
            ) : isTicTacToe ? (
              <SettingsGroup title="Tic-Tac-Toe room">
                <p className="text-faint text-sm">Exactly 2 players — the host can join as one of them.</p>
                <Field label="Turn timer">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    <option value={0}>No timer</option>
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </Field>
                <Field label="Late joiners">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="tic_tac_toe" />
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Ultimate Tic-Tac-Toe — nine small boards in one big grid. Your move sends your opponent to the
                  matching board; win three boards in a row to win it all.
                </p>
              </SettingsGroup>
            ) : isChess ? (
              <SettingsGroup title="Chess room">
                <p className="text-faint text-sm">Exactly 2 players — the host can join as one of them.</p>
                <Field label="Time per player">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    <option value={0}>No timer</option>
                    <option value={180}>3 minutes each</option>
                    <option value={300}>5 minutes each</option>
                    <option value={600}>10 minutes each</option>
                  </select>
                </Field>
                <Field label="Late joiners">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="chess" />
                </Field>
                <Field label="Board">
                  <div className="flex flex-wrap gap-2">
                    {BOARD_THEMES.map((theme) => {
                      const active = theme.id === chessBoardTheme
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => setChessBoardTheme(theme.id)}
                          title={theme.name}
                          aria-label={`${theme.name} board`}
                          aria-pressed={active}
                          className={[
                            'h-9 w-9 rounded-md overflow-hidden grid grid-cols-2 grid-rows-2 transition-transform',
                            active
                              ? 'ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--card)] scale-105'
                              : 'ring-1 ring-[var(--border)] hover:scale-105',
                          ].join(' ')}
                        >
                          <span style={{ backgroundColor: theme.light }} />
                          <span style={{ backgroundColor: theme.dark }} />
                          <span style={{ backgroundColor: theme.dark }} />
                          <span style={{ backgroundColor: theme.light }} />
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <Field label="Pieces">
                  <div className="flex flex-wrap gap-2">
                    {PIECE_SETS.map((set) => {
                      const active = set.id === chessPieceSet
                      return (
                        <button
                          key={set.id}
                          type="button"
                          onClick={() => setChessPieceSet(set.id)}
                          title={set.name}
                          aria-label={`${set.name} pieces`}
                          aria-pressed={active}
                          className={[
                            'flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-transform',
                            active
                              ? 'ring-2 ring-[var(--primary)] scale-105'
                              : 'ring-1 ring-[var(--border)] hover:scale-105',
                          ].join(' ')}
                          style={{ backgroundColor: '#b58863' }}
                        >
                          <span className="leading-none text-xl flex gap-0.5">
                            <span style={{ color: set.white.color, textShadow: set.white.shadow }}>
                              {pieceGlyph(set, 'w', 'n')}
                            </span>
                            <span style={{ color: set.black.color, textShadow: set.black.shadow }}>
                              {pieceGlyph(set, 'b', 'n')}
                            </span>
                          </span>
                          <span className="text-[10px] font-semibold text-white/90 leading-none">{set.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-faint mt-1 text-xs">
                    Your default look — players can switch their own board in-game.
                  </p>
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Classic chess — White moves first, standard rules, checkmate to win. Each player gets their own clock
                  that only ticks on their turn; the first to run out of time loses.
                </p>
              </SettingsGroup>
            ) : isScrabble ? (
              <SettingsGroup title="Scrabble room">
                <p className="text-faint text-sm">2–4 players — the host can join as one of them.</p>
                <Field label="Time per turn">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    <option value={0}>No timer</option>
                    <option value={60}>1 minute</option>
                    <option value={180}>3 minutes</option>
                    <option value={300}>5 minutes</option>
                  </select>
                </Field>
                <Field label="Game length">
                  <select
                    value={scrabbleGameDuration}
                    onChange={(e) => setScrabbleGameDuration(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {SCRABBLE_GAME_DURATION_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {formatScrabbleGameDuration(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Dictionary">
                  <select
                    value={scrabbleDictionary}
                    onChange={(e) => setScrabbleDictionary(e.target.value as ScrabbleDictionaryId)}
                    className="input-field w-full"
                  >
                    {SCRABBLE_DICTIONARY_OPTIONS.map((id) => (
                      <option key={id} value={id}>
                        {SCRABBLE_DICTIONARY_LABELS[id]}
                      </option>
                    ))}
                  </select>
                  <p className="text-faint mt-1 text-xs">{SCRABBLE_DICTIONARY_BLURBS[scrabbleDictionary]}</p>
                </Field>
                <Field label="Late joiners">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="scrabble" />
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Build words on a 15×15 board, hit the premium squares, and outscore everyone. Every word is checked
                  against a real dictionary; highest score when the tiles run out wins. Set a game length so it
                  can&apos;t run for hours.
                </p>
              </SettingsGroup>
            ) : isDescribeIt ? (
              <SettingsGroup title="Text Charades room">
                <p className="text-faint text-sm">
                  {settings.describe_it_mode === 'individual'
                    ? `Players take turns describing a word while everyone races to guess. ${DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL}+ players.`
                    : `Players join with a name and split into teams. ${DESCRIBE_IT_MIN_PLAYERS}+ players.`}
                </p>
                <Field label="Mode">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, describe_it_mode: 'team' })}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        settings.describe_it_mode !== 'individual'
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Teams</span>
                      <span className="text-faint text-xs sm:text-sm">Teams race to guess</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, describe_it_mode: 'individual' })}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        settings.describe_it_mode === 'individual'
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Individual</span>
                      <span className="text-faint text-xs sm:text-sm">Solo — fastest guess wins</span>
                    </button>
                  </div>
                </Field>
                {settings.describe_it_mode !== 'individual' && (
                  <Field label="Teams">
                    <select
                      value={settings.describe_it_num_teams}
                      onChange={(e) => setSettings({ ...settings, describe_it_num_teams: Number(e.target.value) })}
                      className="input-field w-full"
                    >
                      {DESCRIBE_IT_TEAM_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n} teams
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field
                  label={
                    settings.describe_it_mode === 'individual'
                      ? 'Rounds (everyone describes once per round)'
                      : 'Rounds (each team plays once per round)'
                  }
                >
                  <select
                    value={settings.rounds_count}
                    onChange={(e) => setSettings({ ...settings, rounds_count: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    {DESCRIBE_IT_ROUND_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} rounds
                      </option>
                    ))}
                  </select>
                  {settings.describe_it_mode === 'individual' && (
                    <p className="text-faint text-[11px] pt-1">
                      Total turns = players × rounds. E.g. 6 players × {settings.rounds_count} rounds ={' '}
                      {6 * settings.rounds_count} turns — the lobby shows the exact count once everyone joins.
                    </p>
                  )}
                </Field>
                <Field label="Time per turn">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    {DESCRIBE_IT_TURN_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n === 60 ? '1 minute' : n === 120 ? '2 minutes' : `${n} seconds`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Words">
                  <SegmentedControl
                    value={questionSource === 'custom' ? 'custom' : 'platform'}
                    onChange={(v) => setQuestionSource(v as QuestionSource)}
                    options={[
                      { value: 'platform', label: 'Platform', hint: 'Use our built-in word bank.' },
                      { value: 'custom', label: 'Your own', hint: 'Add your own words or upload a file.' },
                    ]}
                  />
                </Field>

                {questionCustomHint && <CustomContentAiTip hint={questionCustomHint} />}

                {questionSource === 'custom' && (
                  <div className="space-y-4 pt-1">
                    <SegmentedControl
                      value={questionTab}
                      onChange={setQuestionTab}
                      options={[
                        { value: 'upload', label: 'Upload file', hint: questionUploadHint('describe_it') },
                        { value: 'manual', label: 'Add manually', hint: 'Type or paste one word per line.' },
                      ]}
                    />

                    {questionTab === 'upload' ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => describeItFileRef.current?.click()}
                            className="btn-secondary !py-3"
                          >
                            Choose file
                          </button>
                          <a
                            href={questionSampleFile('describe_it').href}
                            download={questionSampleFile('describe_it').download}
                            className="btn-secondary !py-3 text-center no-underline flex items-center justify-center"
                          >
                            Sample CSV
                          </a>
                        </div>
                        <input
                          ref={describeItFileRef}
                          type="file"
                          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (!file) return
                            setDescribeItUploadError(null)
                            const ext = file.name.split('.').pop()?.toLowerCase()
                            try {
                              const rows =
                                ext === 'csv'
                                  ? parseDescribeItWords(await file.text())
                                  : ext === 'xlsx' || ext === 'xls'
                                    ? await parseExcelDescribeItWords(await file.arrayBuffer())
                                    : []
                              if (rows.length === 0) {
                                setDescribeItUploadError('No words found. Use one word per line or row.')
                                return
                              }
                              // Merge with whatever's already loaded, de-duplicated.
                              setDescribeItWords((prev) =>
                                parseDescribeItWords(`${prev}\n${rows.join('\n')}`).join('\n')
                              )
                            } catch {
                              setDescribeItUploadError('Could not read that file. Try a .csv or .xlsx.')
                            }
                          }}
                        />
                        <p className="text-faint text-xs text-center">{questionUploadHint('describe_it')}</p>
                      </div>
                    ) : (
                      <textarea
                        value={describeItWords}
                        onChange={(e) => setDescribeItWords(e.target.value)}
                        placeholder="pizza&#10;rainbow&#10;astronaut"
                        rows={5}
                        className="input-field w-full resize-none font-medium text-sm"
                      />
                    )}

                    {describeItUploadError && <p className="text-red-400 text-sm">{describeItUploadError}</p>}

                    {questionTab === 'upload' && parseDescribeItWords(describeItWords).length > 0 && (
                      <div className="surface-inset border border-theme rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto">
                        <p className="text-muted text-xs uppercase tracking-wider">
                          Loaded ({parseDescribeItWords(describeItWords).length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {parseDescribeItWords(describeItWords).map((w, i) => (
                            <span
                              key={`${w}-${i}`}
                              className="inline-flex items-center gap-1 rounded-md border border-theme bg-[var(--surface-inset-bg)] px-2 py-1 text-xs"
                            >
                              {w}
                              <button
                                type="button"
                                onClick={() =>
                                  setDescribeItWords(
                                    parseDescribeItWords(describeItWords)
                                      .filter((_, idx) => idx !== i)
                                      .join('\n')
                                  )
                                }
                                className="text-faint hover:text-red-300"
                                aria-label={`Remove ${w}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <Field label="Late joiners">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="describe_it" />
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  {settings.describe_it_mode === 'individual'
                    ? 'Everyone takes turns describing one word while the rest race to guess it. Guessers score by speed and the describer scores per correct guess — highest total on the leaderboard wins.'
                    : 'Teams race the clock: a describer gives clues for secret words while teammates type guesses. Every correct guess scores a point — most words across all rounds wins.'}{' '}
                  Add your own words to use those first (the built-in bank only tops up if you run out); leave it blank
                  for the built-in bank.
                </p>
              </SettingsGroup>
            ) : isNpat ? (
              <SettingsGroup title="I Call On room">
                <Field label={`Max players (${effectiveLimits.i_call_on.min}–${effectiveLimits.i_call_on.max})`}>
                  <select
                    value={npatMaxPlayers}
                    onChange={(e) => setNpatMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.i_call_on.min, effectiveLimits.i_call_on.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Game length">
                  <select
                    value={npatGameDuration}
                    onChange={(e) => setNpatGameDuration(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {NPAT_GAME_DURATION_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {formatNpatGameDuration(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Writing time (per letter)">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    {NPAT_TIMER_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s} seconds
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Marking time (per letter)">
                  <select
                    value={npatMarkingTimer}
                    onChange={(e) => setNpatMarkingTimer(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {NPAT_MARKING_TIMER_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s} seconds
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Players take turns calling a letter, then fill Name, Animal, Place, Thing, and Food. Reviewers mark
                  answers, the letter caller approves each round, and unique valid answers score points. Play until time
                  runs out or all 26 letters are used.
                </p>
              </SettingsGroup>
            ) : isCodewords ? (
              <SettingsGroup title="Codewords room">
                <Field label={`Max players (${effectiveLimits.codewords.min}–${effectiveLimits.codewords.max})`}>
                  <select
                    value={codewordsMaxPlayers}
                    onChange={(e) => setCodewordsMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.codewords.min, effectiveLimits.codewords.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Spymaster timer (per turn)">
                  <select
                    value={settings.timer_seconds}
                    onChange={(e) => setSettings({ ...settings, timer_seconds: Number(e.target.value) })}
                    className="input-field w-full"
                  >
                    {CODEWORDS_TIMER_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s} seconds
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Operative timer (per turn)">
                  <select
                    value={codewordsOperativeTimer}
                    onChange={(e) => setCodewordsOperativeTimer(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {CODEWORDS_TIMER_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s} seconds
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Team & role assignment">
                  <SegmentedControl
                    value={codewordsRandomizeTeams ? 'randomize' : codewordsPlayerPicks ? 'players' : 'host'}
                    onChange={(v) => {
                      if (v === 'randomize') {
                        setCodewordsRandomizeTeams(true)
                        setCodewordsPlayerPicks(false)
                      } else {
                        setCodewordsRandomizeTeams(false)
                        setCodewordsPlayerPicks(v === 'players')
                      }
                    }}
                    options={[
                      {
                        value: 'players',
                        label: 'Players pick',
                        hint: 'Each player chooses their team and role in the lobby',
                      },
                      {
                        value: 'host',
                        label: 'Host assigns',
                        hint: 'You place everyone on teams from the host panel',
                      },
                      {
                        value: 'randomize',
                        label: 'Randomize teams',
                        hint: 'You pick both spymasters — operatives are shuffled at start',
                      },
                    ]}
                  />
                </Field>
                <Field label="Join after game starts">
                  <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} />
                </Field>
                <Field label="Word list">
                  <SegmentedControl
                    value={questionSource}
                    onChange={(v) => setQuestionSource(v as QuestionSource)}
                    options={questionSourceOptions('codewords')}
                  />
                </Field>
                {questionSource === 'custom' && (
                  <div className="space-y-3 surface-inset border border-theme rounded-xl p-4">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => codewordsFileRef.current?.click()}
                        className="btn-secondary !py-3"
                      >
                        Choose file
                      </button>
                      <a
                        href={questionSampleFile('codewords').href}
                        download={questionSampleFile('codewords').download}
                        className="btn-secondary !py-3 text-center no-underline flex items-center justify-center"
                      >
                        Sample CSV
                      </a>
                    </div>
                    <input
                      ref={codewordsFileRef}
                      type="file"
                      accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        setQuestionsUploadError(null)
                        const ext = file.name.split('.').pop()?.toLowerCase()
                        try {
                          const rows =
                            ext === 'csv'
                              ? parseCodewordsWordRows(await file.text())
                              : ext === 'xlsx' || ext === 'xls'
                                ? await parseExcelCodewordsWords(await file.arrayBuffer())
                                : []
                          if (rows.length === 0) {
                            setQuestionsUploadError('No valid rows. Add one single word per line.')
                            return
                          }
                          setCustomCodewordsWords(rows)
                        } catch {
                          setQuestionsUploadError('Could not read that file. Try the sample CSV.')
                        }
                      }}
                    />
                    <p className="text-faint text-xs text-center">{questionUploadHint('codewords')}</p>
                    <input
                      value={codewordsWordInput}
                      onChange={(e) => setCodewordsWordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        const rows = parseCodewordsWordRows(codewordsWordInput)
                        if (rows.length === 0) {
                          setQuestionsUploadError('Use a single word with no spaces.')
                          return
                        }
                        setQuestionsUploadError(null)
                        setCustomCodewordsWords((prev) => mergeCodewordsWords(prev, rows))
                        setCodewordsWordInput('')
                      }}
                      placeholder="Ocean"
                      className="input-field py-2.5 text-sm"
                    />
                    <textarea
                      value={codewordsBulkPaste}
                      onChange={(e) => setCodewordsBulkPaste(e.target.value)}
                      placeholder={'Ocean\nMountain\nCastle'}
                      rows={3}
                      className="input-field resize-none font-medium text-sm"
                    />
                    {codewordsBulkPaste.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          const rows = parseCodewordsWordRows(codewordsBulkPaste)
                          if (rows.length === 0) {
                            setQuestionsUploadError('No valid words found.')
                            return
                          }
                          setQuestionsUploadError(null)
                          setCustomCodewordsWords((prev) => mergeCodewordsWords(prev, rows))
                          setCodewordsBulkPaste('')
                        }}
                        className="btn-secondary w-full text-sm py-2.5"
                      >
                        Import pasted list
                      </button>
                    )}
                    {questionsUploadError && <p className="text-red-400 text-sm">{questionsUploadError}</p>}
                    {customCodewordsWords.length > 0 && (
                      <div className="max-h-36 overflow-y-auto space-y-1.5">
                        <p className="text-muted text-xs uppercase tracking-wider">
                          Loaded ({customCodewordsWords.length}
                          {customCodewordsWords.length < CODEWORDS_MIN_CUSTOM_POOL
                            ? ` — need ${CODEWORDS_MIN_CUSTOM_POOL} minimum`
                            : ''}
                          )
                        </p>
                        {customCodewordsWords.map((word, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <p className="text-body flex-1 min-w-0">{word}</p>
                            <button
                              type="button"
                              onClick={() => setCustomCodewordsWords((prev) => prev.filter((_, idx) => idx !== i))}
                              className="text-faint hover:text-red-300 text-xs shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Two teams of spymasters and operatives. Spymasters give one-word clues — operatives guess words on the
                  5×5 grid. First team to find all their words wins. Avoid the assassin!
                </p>
              </SettingsGroup>
            ) : isSudoku ? (
              <SettingsGroup title="Sudoku room">
                <Field label={`Max players (${effectiveLimits.sudoku.min}–${effectiveLimits.sudoku.max})`}>
                  <select
                    value={sudokuMaxPlayers}
                    onChange={(e) => setSudokuMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.sudoku.min, effectiveLimits.sudoku.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Race to solve the 9×9 puzzle block by block. First to claim a block gets 10 pts, second 6, third 3,
                  rest 1. Wrong answer? −3 pts, but you can try that block again.
                </p>
              </SettingsGroup>
            ) : isWordHunt ? (
              <SettingsGroup title="Word Hunt room">
                <Field label={`Max players (${effectiveLimits.word_hunt.min}–${effectiveLimits.word_hunt.max})`}>
                  <select
                    value={wordHuntMaxPlayers}
                    onChange={(e) => setWordHuntMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.word_hunt.min, effectiveLimits.word_hunt.max).map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Time limit">
                  <select
                    value={wordHuntTimer}
                    onChange={(e) => setWordHuntTimer(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    <option value={60}>1 minute</option>
                    <option value={120}>2 minutes</option>
                    <option value={180}>3 minutes</option>
                    <option value={300}>5 minutes</option>
                  </select>
                </Field>
                {showViewerToggle && (
                  <Field label="Late joiners">
                    <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="word_hunt" />
                  </Field>
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Everyone races on the same 4×4 letter grid. Connect adjacent letters to spell valid words — 3 letters
                  = 100 pts, 4 = 400, 5 = 800, and longer words score even more.
                </p>
              </SettingsGroup>
            ) : (
              <>
                <SettingsGroup title="Round settings">
                  {isTrivia && (
                    <Field label={`Max players (${effectiveLimits.trivia.min}–${effectiveLimits.trivia.max})`}>
                      <select
                        value={triviaMaxPlayers}
                        onChange={(e) => setTriviaMaxPlayers(Number(e.target.value))}
                        className="input-field w-full"
                      >
                        {playerCountOptions(effectiveLimits.trivia.min, effectiveLimits.trivia.max).map((n) => (
                          <option key={n} value={n}>
                            {n} players
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {isTrivia && showViewerToggle && (
                    <Field label="Late joiners">
                      <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} />
                    </Field>
                  )}
                  {isWst ? (
                    <div className="space-y-4">
                      <Field label="Quote source">
                        <SegmentedControl
                          value={wstQuoteSource}
                          onChange={(v) => setWstQuoteSource(v)}
                          options={[
                            {
                              value: 'player' as WstQuoteSource,
                              label: 'Player Quotes',
                              hint: 'Players submit quotes in the lobby',
                            },
                            {
                              value: 'anime' as WstQuoteSource,
                              label: 'Anime Quotes',
                              hint: 'Quotes from anime characters',
                            },
                            { value: 'both' as WstQuoteSource, label: 'Both', hint: 'Mix player + anime quotes' },
                          ]}
                        />
                      </Field>
                      <p className="text-faint text-sm leading-relaxed">
                        {wstQuoteSource === 'anime'
                          ? 'Anime quotes are fetched in the lobby — no player submissions needed.'
                          : wstQuoteSource === 'both'
                            ? 'Players submit quotes and anime quotes are fetched — both are shuffled together.'
                            : 'Rounds are automatic — one turn per player who joins and claims their name. The count updates in the host lobby as people join.'}
                      </p>
                    </div>
                  ) : isPanGame ? (
                    <Field label="Rounds">
                      <p className="text-faint text-xs mb-2">
                        How many picking turns to play — pickers rotate through players (not capped by headcount).
                      </p>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={panRoundsInput}
                        onChange={(e) => setPanRoundsInput(e.target.value.replace(/\D/g, ''))}
                        onBlur={() => {
                          const n = clampPanRounds(panRoundsInput)
                          setPanRoundsInput(String(n))
                          setSettings((prev) => ({ ...prev, rounds_count: n }))
                        }}
                        className="input-field w-28 mb-2"
                      />
                      <ChipGrid>
                        {roundOptions.map((n) => (
                          <Chip
                            key={n}
                            active={settings.rounds_count === n}
                            onClick={() => {
                              setPanRoundsInput(String(n))
                              setSettings((prev) => ({ ...prev, rounds_count: n }))
                            }}
                            className="!px-0 w-full"
                          >
                            {n}
                          </Chip>
                        ))}
                      </ChipGrid>
                    </Field>
                  ) : isHotSeatGame ? (
                    <Field label="Max rounds">
                      <p className="text-faint text-xs mb-2">
                        One hot seat turn per player who joins and claims a name. The actual round count is set
                        automatically in the lobby — enter the max cap ({HOT_SEAT_MIN_PLAYERS}–{hotSeatCreateCapUpper}).
                      </p>
                      <input
                        type="number"
                        min={HOT_SEAT_MIN_PLAYERS}
                        max={hotSeatCreateCapUpper}
                        step={1}
                        value={settings.rounds_count}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10)
                          if (!Number.isNaN(n)) {
                            setSettings((prev) => ({ ...prev, rounds_count: n }))
                          }
                        }}
                        onBlur={(e) => {
                          setSettings((prev) => ({
                            ...prev,
                            rounds_count: clampHotSeatMaxCap(e.target.value, hotSeatCreateCapUpper),
                          }))
                        }}
                        className="input-field w-28"
                      />
                    </Field>
                  ) : (
                    <Field label="Rounds">
                      {isLobbyQuestions && questionSource === 'custom' && customQuestionCount === 0 && (
                        <p className="text-faint text-xs mb-2">
                          Upload questions below to set how many rounds you can play.
                        </p>
                      )}
                      {isLobbyQuestions && questionSource === 'custom' && customQuestionCount > 0 && (
                        <p className="text-faint text-xs mb-2">
                          {customQuestionCount} custom questions loaded — up to {customQuestionCount} rounds.
                        </p>
                      )}
                      {isLobbyQuestions && questionSource === 'library' && libraryPackQuestions.length === 0 && (
                        <p className="text-faint text-xs mb-2">
                          Select a library pack below to set how many rounds you can play.
                        </p>
                      )}
                      {isLobbyQuestions && questionSource === 'library' && libraryPackQuestions.length > 0 && (
                        <p className="text-faint text-xs mb-2">
                          {libraryPackQuestions.length} library questions loaded — up to {libraryPackQuestions.length}{' '}
                          rounds.
                        </p>
                      )}
                      {isLobbyQuestions && questionCap > 0 && (
                        <input
                          type="number"
                          min={1}
                          max={questionCap}
                          step={1}
                          value={settings.rounds_count}
                          onChange={(e) => {
                            const n = Number.parseInt(e.target.value, 10)
                            if (!Number.isNaN(n)) {
                              setSettings((prev) => ({ ...prev, rounds_count: n }))
                            }
                          }}
                          onBlur={(e) => {
                            setSettings((prev) => ({
                              ...prev,
                              rounds_count: clampLobbyQuestionRounds(e.target.value, questionCap),
                            }))
                          }}
                          className="input-field w-28 mb-2"
                        />
                      )}
                      <ChipGrid>
                        {roundOptions.map((n) => (
                          <Chip
                            key={n}
                            active={settings.rounds_count === n}
                            onClick={() => setSettings((prev) => ({ ...prev, rounds_count: n }))}
                            className="!px-0 w-full"
                          >
                            {n}
                          </Chip>
                        ))}
                      </ChipGrid>
                    </Field>
                  )}

                  {isTrivia ? (
                    <Field label="Time per question">
                      <TriviaTimerPicker
                        value={settings.timer_seconds}
                        onChange={(timer_seconds) => setSettings({ ...settings, timer_seconds })}
                      />
                    </Field>
                  ) : (
                    <Field label="Time per round">
                      <SegmentedControl
                        value={String(settings.timer_seconds) as '15' | '30' | '60'}
                        onChange={(v) => setSettings({ ...settings, timer_seconds: Number(v) })}
                        options={[
                          { value: '15', label: '15s' },
                          { value: '30', label: '30s' },
                          { value: '60', label: '60s' },
                        ]}
                      />
                    </Field>
                  )}

                  {supportsGender && (
                    <GenderRoundModeControl
                      value={settings.gender_based}
                      onChange={(gender_based) => setSettings((prev) => ({ ...prev, gender_based }))}
                    />
                  )}

                  {isCustom && <CustomSlotBuilder value={customSlots} onChange={setCustomSlots} />}

                  {(isPair || isCustomTwoSlot) && (
                    <Field label="Pair voting">
                      <SegmentedControl
                        value={settings.pair_vote_mode}
                        onChange={(v) => setSettings({ ...settings, pair_vote_mode: v })}
                        options={
                          isCustomTwoSlot && customSlots?.slots
                            ? customPairVoteModeOptions(customSlots.slots)
                            : pairVoteModeOptions(settings.game_type)
                        }
                      />
                    </Field>
                  )}

                  {showViewerToggle && !isQuickLobby && !isTrivia && (
                    <Field label="Late joiners">
                      <LateJoinPolicyToggle value={lateJoinPolicy} onChange={setLateJoinPolicy} />
                    </Field>
                  )}
                </SettingsGroup>

                {isLobbyQuestions && (
                  <SettingsGroup title="Questions">
                    {isTrivia && questionSource === 'platform' && (
                      <Field label="Category">
                        <SegmentedControl
                          value={triviaCategory}
                          onChange={(v) => setTriviaCategory(v as TriviaCategory)}
                          options={[
                            { value: 'tech', label: 'Tech', hint: 'Programming, gadgets, internet culture' },
                            { value: 'general', label: 'General', hint: 'Geography, history, pop culture & more' },
                          ]}
                        />
                      </Field>
                    )}

                    {!isTrivia && (
                      <>
                        <Field label="Player submissions">
                          <SegmentedControl
                            value={playerQuestionsEnabled ? 'on' : 'off'}
                            onChange={(v) => setPlayerQuestionsEnabled(v === 'on')}
                            options={[
                              { value: 'on', label: 'Allowed' },
                              { value: 'off', label: 'Disabled' },
                            ]}
                          />
                          <p className="text-faint text-xs mt-2">
                            {playerQuestionsEnabled
                              ? 'Players can add their own questions in the lobby before you start.'
                              : 'Only your uploaded or platform questions will be used.'}
                          </p>
                        </Field>

                        {playerQuestionsEnabled && (
                          <Field label="Question mix">
                            <SegmentedControl
                              value={playerQuestionsOrder}
                              onChange={(v) => setPlayerQuestionsOrder(parsePlayerQuestionsOrder(v))}
                              options={playerQuestionsOrderOptions({
                                game_type: settings.game_type,
                                question_source: isTot ? 'custom' : questionSource,
                              }).map((opt) => ({ value: opt.value, label: opt.label }))}
                            />
                            <p className="text-faint text-xs mt-2">
                              {
                                playerQuestionsOrderOptions({
                                  game_type: settings.game_type,
                                  question_source: isTot ? 'custom' : questionSource,
                                }).find((opt) => opt.value === playerQuestionsOrder)?.hint
                              }
                            </p>
                          </Field>
                        )}

                        {(isWyr || isMlt || isNhie) && (
                          <Field label="AI-generated questions">
                            <SegmentedControl
                              value={aiQuestionsEnabled ? 'on' : 'off'}
                              onChange={(v) => setAiQuestionsEnabled(v === 'on')}
                              options={[
                                { value: 'off', label: 'Off' },
                                { value: 'on', label: 'Enabled' },
                              ]}
                            />
                            <p className="text-faint text-xs mt-2">
                              {aiQuestionsEnabled
                                ? 'AI will generate personalized questions using player names in the lobby.'
                                : 'Only platform and player-submitted questions will be used.'}
                            </p>
                          </Field>
                        )}

                        {(isWyr || isMlt || isNhie) && aiQuestionsEnabled && (
                          <>
                            <Field label="AI question ratio">
                              <SegmentedControl
                                value={aiQuestionsRatio}
                                onChange={(v) =>
                                  setAiQuestionsRatio(v as 'all_ai' | 'mostly_ai' | 'half' | 'mostly_platform')
                                }
                                options={[
                                  { value: 'all_ai', label: 'All AI' },
                                  { value: 'mostly_ai', label: 'Mostly AI' },
                                  { value: 'half', label: 'Half & Half' },
                                  { value: 'mostly_platform', label: 'Mostly Platform' },
                                ]}
                              />
                            </Field>

                            <Field label="Theme (optional)">
                              <select
                                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-body"
                                value={aiQuestionsTheme}
                                onChange={(e) => setAiQuestionsTheme(e.target.value)}
                              >
                                <option value="">General / Fun</option>
                                <option value="Work party">Work party</option>
                                <option value="College friends">College friends</option>
                                <option value="Family reunion">Family reunion</option>
                                <option value="Birthday party">Birthday party</option>
                                <option value="Date night">Date night</option>
                              </select>
                            </Field>

                            <Field label="Custom prompt (optional)">
                              <textarea
                                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-body resize-none"
                                rows={2}
                                maxLength={500}
                                placeholder="e.g. We're all coworkers at a tech company who love hiking"
                                value={aiQuestionsCustomPrompt}
                                onChange={(e) => setAiQuestionsCustomPrompt(e.target.value)}
                              />
                              <p className="text-faint text-xs mt-1">{aiQuestionsCustomPrompt.length}/500</p>
                            </Field>

                            <Field label="Your Claude API key (optional)">
                              <input
                                type="password"
                                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-body"
                                placeholder="sk-ant-..."
                                value={aiQuestionsApiKey}
                                onChange={(e) => setAiQuestionsApiKey(e.target.value)}
                              />
                              <p className="text-faint text-xs mt-1">
                                Leave blank to use the server&apos;s key. Your key is never stored.
                              </p>
                            </Field>
                          </>
                        )}
                      </>
                    )}

                    {isLobbyQuestions && !isTot && (
                      <SegmentedControl
                        value={questionSource}
                        onChange={(v) => {
                          setQuestionSource(v)
                          if (v === 'platform' || v === 'custom') {
                            setSelectedPackId(null)
                            setLibraryPackQuestions([])
                          }
                          if (v === 'platform') {
                            setCustomWyrQuestions([])
                            setCustomMltQuestions([])
                            setCustomTriviaQuestions([])
                            setQuestionsUploadError(null)
                          }
                          if (v === 'library') {
                            setCustomWyrQuestions([])
                            setCustomMltQuestions([])
                            setCustomTriviaQuestions([])
                          }
                        }}
                        options={questionSourceOptions(settings.game_type)}
                      />
                    )}

                    {questionCustomHint && <CustomContentAiTip hint={questionCustomHint} />}

                    {isLobbyQuestions && questionSource === 'library' && (
                      <div className="space-y-2 pt-1">
                        {libraryPacksLoading ? (
                          <div className="space-y-2">
                            {[0, 1].map((i) => (
                              <div key={i} className="surface-inset px-4 py-3 animate-pulse">
                                <div className="h-3 bg-[var(--border-strong)] rounded-full w-2/3 mb-2" />
                                <div className="h-2.5 bg-[var(--border)] rounded-full w-1/3" />
                              </div>
                            ))}
                          </div>
                        ) : libraryPacks.length === 0 ? (
                          <p className="text-muted text-sm text-center py-4">
                            No approved packs for this game type yet.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            <div className="relative">
                              <input
                                type="search"
                                value={libraryPackSearch}
                                onChange={(e) => setLibraryPackSearch(e.target.value)}
                                placeholder="Search packs…"
                                className="input-field w-full text-sm"
                                style={{ paddingLeft: '2.25rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}
                              />
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none text-xs">
                                🔍
                              </span>
                            </div>
                            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                              {libraryPacks
                                .filter((p) => {
                                  const q = libraryPackSearch.toLowerCase().trim()
                                  if (!q) return true
                                  return p.title.toLowerCase().includes(q) || p.author_name.toLowerCase().includes(q)
                                })
                                .map((pack) => (
                                  <button
                                    key={pack.id}
                                    type="button"
                                    onClick={() => selectLibraryPack(pack.id)}
                                    className={`surface-inset w-full px-4 py-3 text-left transition-all ${
                                      selectedPackId === pack.id
                                        ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)]'
                                        : 'hover:border-[var(--border-strong)]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p
                                          className={`font-semibold text-sm truncate ${selectedPackId === pack.id ? 'text-[var(--chip-active-text)]' : ''}`}
                                        >
                                          {pack.title}
                                        </p>
                                        <p className="text-faint text-xs mt-0.5">
                                          by {pack.author_name} · {pack.question_count} questions
                                        </p>
                                      </div>
                                      {selectedPackId === pack.id && (
                                        <span className="text-[var(--chip-active-text)] text-sm font-bold shrink-0">
                                          ✓
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              {libraryPacks.filter((p) => {
                                const q = libraryPackSearch.toLowerCase().trim()
                                if (!q) return true
                                return p.title.toLowerCase().includes(q) || p.author_name.toLowerCase().includes(q)
                              }).length === 0 && (
                                <p className="text-muted text-sm text-center py-3">No packs match your search.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {isLobbyQuestions && (isTot || questionSource === 'custom') && (
                      <div className="space-y-4 pt-1">
                        <SegmentedControl
                          value={questionTab}
                          onChange={setQuestionTab}
                          options={[
                            {
                              value: 'upload',
                              label: 'Upload file',
                              hint: questionUploadHint(settings.game_type),
                            },
                            {
                              value: 'manual',
                              label: 'Add manually',
                              hint: isWyr
                                ? 'Type or paste option pairs.'
                                : isTot
                                  ? 'Type “Coffee or Tea?” style prompts.'
                                  : 'Type or paste one question per line.',
                            },
                          ]}
                        />

                        {questionTab === 'upload' ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => questionsFileRef.current?.click()}
                                className="btn-secondary !py-3"
                              >
                                Choose file
                              </button>
                              <a
                                href={questionSampleFile(settings.game_type).href}
                                download={questionSampleFile(settings.game_type).download}
                                className="btn-secondary !py-3 text-center no-underline flex items-center justify-center"
                              >
                                Sample CSV
                              </a>
                            </div>
                            <input
                              ref={questionsFileRef}
                              type="file"
                              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                              className="hidden"
                              onChange={handleQuestionsFileUpload}
                            />
                            <p className="text-faint text-xs text-center">{questionUploadHint(settings.game_type)}</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {isWyr ? (
                              <div className="space-y-2">
                                <input
                                  value={wyrOptionA}
                                  onChange={(e) => setWyrOptionA(e.target.value)}
                                  placeholder="Option A"
                                  className="input-field py-2.5 text-sm"
                                />
                                <input
                                  value={wyrOptionB}
                                  onChange={(e) => setWyrOptionB(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && addManualQuestion()}
                                  placeholder="Option B"
                                  className="input-field py-2.5 text-sm"
                                />
                              </div>
                            ) : (
                              <input
                                value={mltQuestionInput}
                                onChange={(e) => setMltQuestionInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addManualQuestion()}
                                placeholder={
                                  isTot ? 'Coffee or Tea?' : isNhie ? 'been skydiving' : 'Who is most likely to…'
                                }
                                className="input-field py-2.5 text-sm"
                              />
                            )}
                            <button
                              type="button"
                              onClick={addManualQuestion}
                              className="btn-secondary w-full text-sm py-2.5"
                            >
                              Add question
                            </button>
                            <textarea
                              value={questionsBulkPaste}
                              onChange={(e) => setQuestionsBulkPaste(e.target.value)}
                              placeholder={
                                isWyr
                                  ? 'Paste from Excel:\nNever have pizza,Never have tacos\nLive without music,Live without movies'
                                  : isTot
                                    ? 'Paste questions:\nCoffee or Tea?\nBeach vacation or Mountain getaway?'
                                    : isNhie
                                      ? 'Paste prompts:\nbeen skydiving\nkissed a stranger\nsung karaoke sober'
                                      : 'Paste questions:\nWho is most likely to become famous?\nWho is most likely to win a dance-off?'
                              }
                              rows={4}
                              className="input-field resize-none font-medium text-sm"
                            />
                            {questionsBulkPaste.trim() && (
                              <button
                                type="button"
                                onClick={addBulkQuestions}
                                className="btn-secondary w-full text-sm py-2.5"
                              >
                                Import pasted list
                              </button>
                            )}
                          </div>
                        )}

                        {questionsUploadError && <p className="text-red-400 text-sm">{questionsUploadError}</p>}

                        {customQuestionCount > 0 && (
                          <div className="surface-inset border border-theme rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto">
                            <p className="text-muted text-xs uppercase tracking-wider">
                              Loaded ({customQuestionCount})
                            </p>
                            {isWyr || isTot
                              ? customWyrQuestions.map((q, i) => (
                                  <div key={i} className="flex items-start gap-2 text-sm">
                                    <p className="text-body flex-1 min-w-0">
                                      <span className="text-violet-300">A:</span> {q.optionA}
                                      <span className="text-faint mx-1">·</span>
                                      <span className="text-sky-300">B:</span> {q.optionB}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => removeCustomQuestion(i)}
                                      className="text-faint hover:text-red-300 text-xs shrink-0"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))
                              : isTrivia
                                ? customTriviaQuestions.map((q, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm">
                                      <p className="text-body flex-1 min-w-0">{q.question}</p>
                                      <button
                                        type="button"
                                        onClick={() => removeCustomQuestion(i)}
                                        className="text-faint hover:text-red-300 text-xs shrink-0"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))
                                : customMltQuestions.map((q, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm">
                                      <p className="text-body flex-1 min-w-0">{q}</p>
                                      <button
                                        type="button"
                                        onClick={() => removeCustomQuestion(i)}
                                        className="text-faint hover:text-red-300 text-xs shrink-0"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                          </div>
                        )}

                        {questionSource === 'custom' &&
                          customQuestionCount > 0 &&
                          customQuestionCount < settings.rounds_count && (
                            <p className="text-amber-200/90 text-xs">
                              Need at least {settings.rounds_count} questions for {settings.rounds_count} rounds.
                            </p>
                          )}
                      </div>
                    )}
                  </SettingsGroup>
                )}

                {!isAnonymousRoom &&
                  ((!isBinaryLobby &&
                    !isWst &&
                    !isWhoSaidThis(settings.game_type) &&
                    !isTrivia &&
                    !isPan &&
                    !isNpat &&
                    !isScrabble) ||
                  isHotSeatGame ? (
                    <SettingsGroup title={isHotSeatGame ? "Who's in the game" : "Who's in the poll"}>
                      <SegmentedControl
                        value={settings.participant_mode}
                        onChange={(mode) => setSettings({ ...settings, participant_mode: mode })}
                        options={participantModeOptions(settings.game_type)}
                      />
                    </SettingsGroup>
                  ) : null)}

                {!isAnonymousRoom && isPeoplePollVoters && (
                  <SettingsGroup title="Poll names">
                    <Field label="Player submissions">
                      <SegmentedControl
                        value={playerQuestionsEnabled ? 'on' : 'off'}
                        onChange={(v) => setPlayerQuestionsEnabled(v === 'on')}
                        options={[
                          { value: 'on', label: 'Allowed' },
                          { value: 'off', label: 'Disabled' },
                        ]}
                      />
                      <p className="text-faint text-xs mt-2">
                        {playerQuestionsEnabled
                          ? playerNameSubmissionHint()
                          : 'Only names from your list will appear in rounds.'}
                      </p>
                    </Field>

                    {playerQuestionsEnabled && (
                      <Field label="Name mix">
                        <SegmentedControl
                          value={playerQuestionsOrder}
                          onChange={(v) => setPlayerQuestionsOrder(parsePlayerQuestionsOrder(v))}
                          options={playerQuestionsOrderOptions({
                            game_type: settings.game_type,
                            question_source: questionSource,
                          }).map((opt) => ({ value: opt.value, label: opt.label }))}
                        />
                        <p className="text-faint text-xs mt-2">
                          {
                            playerQuestionsOrderOptions({
                              game_type: settings.game_type,
                              question_source: questionSource,
                            }).find((opt) => opt.value === playerQuestionsOrder)?.hint
                          }
                        </p>
                      </Field>
                    )}
                  </SettingsGroup>
                )}

                {!isAnonymousRoom &&
                  settings.participant_mode === 'import' &&
                  !isBinaryLobby &&
                  !isWst &&
                  !isHotSeatGame &&
                  !isPan &&
                  !isTrivia &&
                  !isNpat &&
                  !isScrabble && (
                    <SettingsGroup title="Who appears in rounds">
                      <SegmentedControl
                        value={settings.participant_filter}
                        onChange={(v) => setSettings({ ...settings, participant_filter: v })}
                        options={[
                          { value: 'all', label: 'Everyone on the list' },
                          { value: 'joined', label: 'Only people who join' },
                        ]}
                      />
                    </SettingsGroup>
                  )}

                {!isAnonymousRoom && (
                  <SettingsGroup
                    title="Advanced"
                    description="Timer behavior & privacy"
                    collapsible
                    defaultOpen={false}
                  >
                    <Field label="When timer runs out">
                      <SegmentedControl
                        value={settings.auto_submit_behavior}
                        onChange={(v) => setSettings({ ...settings, auto_submit_behavior: v })}
                        options={[
                          { value: 'random', label: 'Random fill', hint: 'Incomplete votes get random choices.' },
                          { value: 'no_answer', label: 'No answer', hint: 'Incomplete votes count as no vote.' },
                        ]}
                      />
                    </Field>

                    <div className="space-y-2">
                      {!isAnonymousGame(settings.game_type) && (
                        <Toggle
                          label="Anonymous responses"
                          description="Hide who voted for what"
                          value={settings.anonymous}
                          onChange={(v) => setSettings({ ...settings, anonymous: v })}
                        />
                      )}
                      {isAnonymousGame(settings.game_type) && (
                        <p className="text-faint text-xs px-1">
                          Would You Rather, Most Likely To, and Who Said This are always anonymous.
                        </p>
                      )}
                      <Toggle
                        label="Auto-reveal results"
                        description="Show results after the last round automatically"
                        value={settings.auto_reveal}
                        onChange={(v) => setSettings({ ...settings, auto_reveal: v })}
                      />
                    </div>
                  </SettingsGroup>
                )}
              </>
            )}

            {isEliminationCompatible && (
              <SettingsGroup title="Elimination">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-body text-sm">
                    <input
                      type="checkbox"
                      checked={eliminationEnabled}
                      onChange={(e) => setEliminationEnabled(e.target.checked)}
                      className="accent-accent"
                    />
                    Enable elimination
                  </label>

                  {eliminationEnabled && (
                    <div className="surface-inset rounded-xl p-4 space-y-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          aria-pressed={eliminationMode === 'per-round'}
                          onClick={() => setEliminationMode('per-round')}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                            eliminationMode === 'per-round' ? 'bg-accent text-white' : 'bg-surface text-muted'
                          }`}
                        >
                          Per-Round
                        </button>
                        <button
                          type="button"
                          aria-pressed={eliminationMode === 'lives'}
                          onClick={() => setEliminationMode('lives')}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                            eliminationMode === 'lives' ? 'bg-accent text-white' : 'bg-surface text-muted'
                          }`}
                        >
                          Lives
                        </button>
                      </div>

                      {eliminationMode === 'per-round' && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              aria-pressed={eliminationRule === 'bottom-n'}
                              onClick={() => setEliminationRule('bottom-n')}
                              className={`px-3 py-1.5 rounded-lg text-xs ${
                                eliminationRule === 'bottom-n' ? 'bg-accent text-white' : 'bg-surface text-muted'
                              }`}
                            >
                              Bottom N
                            </button>
                            <button
                              type="button"
                              aria-pressed={eliminationRule === 'score-threshold'}
                              onClick={() => setEliminationRule('score-threshold')}
                              className={`px-3 py-1.5 rounded-lg text-xs ${
                                eliminationRule === 'score-threshold' ? 'bg-accent text-white' : 'bg-surface text-muted'
                              }`}
                            >
                              Score Threshold
                            </button>
                          </div>

                          {eliminationRule === 'bottom-n' ? (
                            <Field label="Eliminate per round">
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={eliminateCount}
                                onChange={(e) => setEliminateCount(Number(e.target.value) || 1)}
                                className="w-20 rounded-lg bg-surface border border-theme px-3 py-1.5 text-body text-sm"
                              />
                            </Field>
                          ) : (
                            <Field label="Score threshold">
                              <input
                                type="number"
                                min={0}
                                value={scoreThreshold}
                                onChange={(e) => setScoreThreshold(Number(e.target.value) || 0)}
                                className="w-20 rounded-lg bg-surface border border-theme px-3 py-1.5 text-body text-sm"
                              />
                            </Field>
                          )}
                        </div>
                      )}

                      {eliminationMode === 'lives' && (
                        <div className="space-y-2">
                          <Field label="Starting lives">
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={startingLives}
                              onChange={(e) => setStartingLives(Number(e.target.value) || 3)}
                              className="w-20 rounded-lg bg-surface border border-theme px-3 py-1.5 text-body text-sm"
                            />
                          </Field>
                          <Field label="Lose life (bottom N)">
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={eliminateCount}
                              onChange={(e) => setEliminateCount(Number(e.target.value) || 1)}
                              className="w-20 rounded-lg bg-surface border border-theme px-3 py-1.5 text-body text-sm"
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </SettingsGroup>
            )}

            <SettingsGroup title="How it works">
              <p className="text-faint text-sm leading-relaxed">
                {isDescribeIt && settings.describe_it_mode === 'individual'
                  ? 'Players join with their name — no teams. Each round, every player takes a turn describing a secret word by typing clues (without saying it) while everyone else races to type the word. Guessers score more the faster they guess; the describer scores for each player who gets it. Highest total on the leaderboard wins.'
                  : gameHowItWorks(settings.game_type, settings.participant_mode)}
              </p>
            </SettingsGroup>
          </div>

          <StickyActionBar>
            {isQuickLobby ? (
              <PrimaryBtn
                onClick={createGame}
                disabled={
                  !settings.title.trim() ||
                  loading ||
                  (isCodewords &&
                    questionSource === 'custom' &&
                    customCodewordsWords.length < CODEWORDS_MIN_CUSTOM_POOL)
                }
              >
                {loading ? 'Creating...' : 'Create Game'}
              </PrimaryBtn>
            ) : isBinaryLobby || isTriviaQuickCreate || (isMlt && isJoinersMode) ? (
              <PrimaryBtn onClick={createGame} disabled={!canCreateQuickLobby || loading || !customSlotsValid}>
                {loading ? 'Creating...' : 'Create Game'}
              </PrimaryBtn>
            ) : isJoinersMode ? (
              <PrimaryBtn onClick={createGame} disabled={!canCreateJoiners || loading || !customSlotsValid}>
                {loading ? 'Creating...' : 'Create Game'}
              </PrimaryBtn>
            ) : (
              <PrimaryBtn
                onClick={() => setStep('participants')}
                disabled={!settings.title.trim() || !customSlotsValid}
              >
                Next: Add People →
              </PrimaryBtn>
            )}
          </StickyActionBar>
        </PageShell>

        <GameTypeModal
          open={showGameTypes}
          onClose={() => setShowGameTypes(false)}
          selected={settings.game_type}
          onSelect={selectGameType}
        />
        <ThemePreviewModal
          open={previewTheme !== null}
          theme={previewTheme}
          onClose={() => setPreviewTheme(null)}
          onSelect={(themeId) => setSettings({ ...settings, theme: themeId })}
        />
      </>
    )
  }

  if (step === 'participants') {
    const sampleFile = participantSampleFile(settings.game_type, participantOpts)
    return (
      <PageShell>
        <BackBtn onClick={() => setStep('settings')} />
        <StepIndicator steps={wizardSteps} current={stepIndex} />

        <div>
          <p className="label-caps mb-1">Step 2</p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title-subtle">Add People</h1>
          <p className="text-muted text-sm mt-1.5">
            {settings.participant_mode === 'import'
              ? participantClaimRosterHint(settings.game_type, participantOpts)
              : participantImportStepHint(settings.game_type, participantOpts)}
          </p>
        </div>

        <div className="glass-card p-5 space-y-4">
          <SegmentedControl
            value={participantTab}
            onChange={setParticipantTab}
            options={[
              {
                value: 'upload',
                label: 'Upload file',
                hint: needsGender
                  ? 'CSV or Excel with name and gender columns.'
                  : 'CSV or Excel with one name per row.',
              },
              {
                value: 'manual',
                label: 'Add manually',
                hint: needsGender
                  ? 'Type names one at a time or paste a list with genders.'
                  : 'Type names one at a time or paste a list.',
              },
            ]}
          />

          {participantTab === 'upload' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary !py-3">
                  Choose file
                </button>
                <a
                  href={sampleFile.href}
                  download={sampleFile.download}
                  className="btn-secondary !py-3 text-center no-underline flex items-center justify-center"
                >
                  Sample CSV
                </a>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleFileUpload}
              />
              <p className="text-faint text-xs text-center">
                {participantUploadHint(settings.game_type, participantOpts)}
              </p>
              {uploadError && <p className="text-red-400 text-sm">{uploadError}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {needsGender && (
                <Field label="Default gender">
                  <SegmentedControl
                    value={defaultGender}
                    onChange={setDefaultGender}
                    options={[
                      { value: 'female', label: 'Female' },
                      { value: 'male', label: 'Male' },
                    ]}
                  />
                </Field>
              )}

              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
                  onPaste={handleNamePaste}
                  placeholder="Enter name..."
                  autoFocus
                  className="input-field"
                />
                <button type="button" onClick={addParticipant} className="btn-secondary shrink-0 px-5">
                  Add
                </button>
              </div>

              <textarea
                value={bulkPaste}
                onChange={(e) => setBulkPaste(e.target.value)}
                placeholder={
                  needsGender ? 'Paste from Excel:\nSarah,female\nJames,male' : 'Paste names:\nSarah\nJames\nAlex'
                }
                rows={3}
                className="input-field resize-none font-medium"
              />
              <button
                type="button"
                onClick={addBulkParticipants}
                disabled={!bulkPaste.trim()}
                className="btn-secondary w-full disabled:opacity-40"
              >
                Add all from paste
              </button>
            </div>
          )}

          {participantCustomHint && <CustomContentAiTip hint={participantCustomHint} />}

          {/* Participant list */}
          {participants.length > 0 ? (
            <div className="space-y-2 pt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between">
                <p className="label-caps !text-[10px]">{participants.length} added</p>
                {needsGender && (
                  <p className="text-faint text-xs">
                    {genderCounts.female}F · {genderCounts.male}M
                  </p>
                )}
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {participants.map((p, i) => (
                  <div
                    key={`${p.name}-${p.gender}-${i}`}
                    className="surface-inset flex items-center justify-between px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={p.name} />
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      {needsGender && <GenderBadge gender={p.gender} />}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeParticipant(i)}
                      className="text-faint hover:text-[var(--kill)] text-xl leading-none transition-colors shrink-0 ml-2"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-faint text-sm border-t border-[var(--border)]">
              No people added yet
            </div>
          )}

          {!needsGender && participants.length < minPool && participants.length > 0 && (
            <p className="text-faint text-sm text-center">
              Add {minPool - participants.length} more name{minPool - participants.length === 1 ? '' : 's'} to continue
            </p>
          )}
          {needsGender &&
            !isMlt &&
            !hasEnoughForRounds(participants, settings.game_type, participantOpts) &&
            participants.length > 0 && (
              <p className="text-amber-500 text-xs text-center">
                Need at least {minPool} people of the same gender to run rounds
              </p>
            )}
        </div>

        <StickyActionBar>
          <PrimaryBtn onClick={createGame} disabled={!canCreateImport || loading}>
            {loading ? 'Creating...' : `Create Game · ${participants.length} people`}
          </PrimaryBtn>
        </StickyActionBar>
      </PageShell>
    )
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const hostUrl = `${origin}/host/${result?.gameCode}?token=${result?.hostToken}`
  const inviteUrl = result?.gameCode ? playerGameUrl(result.gameCode, shareOrigin()) : ''

  return (
    <GameJoinLobbyShell
      gameCode={result?.gameCode ?? ''}
      header={
        <div className="text-center space-y-2">
          <div
            className="inline-flex h-20 w-20 items-center justify-center rounded-3xl text-4xl mx-auto"
            style={{ background: 'var(--chip-active-bg)' }}
          >
            🎉
          </div>
          <h1 className="text-3xl font-black tracking-tight gradient-title-subtle">You&apos;re live!</h1>
          <p className="text-muted text-sm">Share the invite link or code — save your host link.</p>
        </div>
      }
    >
      <div className="glass-card-strong p-6 text-center space-y-2">
        <span className="label-caps">Game code</span>
        <p className="font-mono text-5xl font-black tracking-[0.2em]">{result?.gameCode}</p>
        <CopyLinkButton
          value={result?.gameCode ?? ''}
          label="Copy code"
          copiedLabel="Copied ✓"
          successMessage="Game code copied"
        />
      </div>

      {inviteUrl && <PlayerInviteCard url={inviteUrl} title="Invite players" />}

      <CopyCard label="Host link — save this" value={hostUrl} accent />

      <PrimaryBtn onClick={() => router.push(`/host/${result?.gameCode}?token=${result?.hostToken}`)}>
        Open Host Panel →
      </PrimaryBtn>

      {searchParams.get('room') && (
        <button
          type="button"
          onClick={() => router.push(`/room/${searchParams.get('room')}`)}
          className="btn-secondary w-full"
        >
          ← Back to Room
        </button>
      )}

      <p className="text-faint text-xs text-center">The host link won&apos;t be shown again</p>
    </GameJoinLobbyShell>
  )
}

export default function CreateGame() {
  return (
    <Suspense
      fallback={
        <PageShell centered>
          <div className="text-center text-muted">Loading...</div>
        </PageShell>
      }
    >
      <CreateGameInner />
    </Suspense>
  )
}

function GenderBadge({ gender }: { gender: ParticipantGender }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full shrink-0 ${
        gender === 'male'
          ? 'bg-sky-500/15 text-sky-600 border border-sky-400/25 dark:text-sky-300'
          : 'bg-pink-500/15 text-pink-600 border border-pink-400/25 dark:text-pink-300'
      }`}
    >
      {genderLabel(gender)}
    </span>
  )
}

function Avatar({ name }: { name: string }) {
  return <div className="avatar w-7 h-7 text-xs shrink-0">{name.charAt(0).toUpperCase()}</div>
}

function CopyCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`glass-card p-4 space-y-2 ${accent ? 'border-[var(--primary)]/35' : ''}`}>
      <p className={`label-caps ${accent ? 'text-[var(--primary)]' : ''}`}>{label}</p>
      <p className="font-mono text-xs break-all text-muted">{value}</p>
      <CopyLinkButton value={value} successMessage={accent ? 'Host link copied' : 'Player link copied'} />
    </div>
  )
}
