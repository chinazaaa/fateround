'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type {
  ParticipantGender,
  GameType,
  QuestionSource,
  WstQuoteSource,
  PlayerQuestionsOrder,
  TriviaCategory,
  TriviaQuestion,
  LudoVariant,
  AyoVariant,
} from '@/types'
import type { Settings, Step, ParticipantTab, QuestionTab } from './types'
import { LIBRARY_GAME_TYPE_MAP } from './constants'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'
import { GenderBadge } from './components/GenderBadge'
import { Avatar } from './components/Avatar'
import { TemplateQuickStart } from './components/TemplateQuickStart'
import { SaveTemplateModal } from './components/SaveTemplateModal'
import { UseTemplateConfirmModal } from './components/UseTemplateConfirmModal'
import { getTemplates, saveTemplate, deleteTemplate, type GameTemplate, type TemplateSlots } from '@/lib/game-templates'
import { rememberHostToken } from '@/lib/host-session'
import { THEMES } from '@/lib/themes'
import { ThemePreviewCard, ThemePreviewModal } from '@/components/ThemePreviewModal'
import { MONOPOLY_EDITIONS, formatThemedText } from '@/components/monopoly/monopoly-themes'
import {
  type ParticipantInput,
  parseParticipantsForGame,
  parseExcelParticipants,
  mergeParticipants,
  countByGender,
  hasEnoughForRounds,
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
  isUnoGame,
  isLudoGame,
  isSnakeAndLadderGame,
  isTicTacToeGame,
  isPingPongGame,
  isChessGame,
  isCheckersGame,
  isDraughts10Game,
  isCheckersNigeriaGame,
  isAyoGame,
  isScrabbleGame,
  isDescribeItGame,
  isWordRushGame,
  isICallOnGame,
  isLandmineGame,
  isSudokuGame,
  isCrosswordGame,
  isWordSearchGame,
  isWordScrambleGame,
  isWordGroupingGame,
  isWordHuntGame,
  isMafiaGame,
  isMatchingPairsGame,
  isMahjongGame,
  isQuiplashGame,
  isQuickDrawGame,
  templatableGame,
} from '@/lib/game-types'
import { DEFAULT_MAHJONG_RULESET, MAHJONG_RULESETS, MAHJONG_RULESET_CONFIG } from '@/lib/mahjong-rulesets'
import type { MahjongRuleset } from '@/types'
import { BOARD_THEMES, PIECE_SETS, useChessAppearance } from '@/lib/chess-appearance'
import { ChessPieceGlyph } from '@/components/chess/ChessPieceDetailed'
import { Glyph } from '@/components/icons/Glyph'
import { GlobeIcon, LockIcon, TableTennisBatIcon } from '@hugeicons/core-free-icons'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import { THIS_OR_THAT_QUESTION_COUNT } from '@/lib/this-or-that-questions'
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
  parseStoredCodewordsWords,
  questionUploadHint,
  questionSourceOptions,
  questionSampleFile,
  questionRoundPickerOptions,
  clampLobbyQuestionRounds,
  CODEWORDS_MIN_CUSTOM_POOL,
  parseCrosswordEntryImport,
  parseWordSearchEntryImport,
  parseWordScrambleEntryImport,
  parseStoredCrosswordEntries,
  parseStoredWordSearchEntries,
  parseStoredWordScrambleEntries,
  parseWstDeckImport,
  parseExcelWstDeckImport,
  formatEntryImportSummary,
  type CrosswordEntry,
  type WordSearchEntry,
  type WordScrambleEntry,
} from '@/lib/custom-questions'
import { WST_DECK_MIN_ENTRIES, type WstDeckEntry } from '@/lib/who-said-this'
import { WST_PLATFORM_DECK } from '@/lib/who-said-this-questions'
import { playerQuestionsOrderOptions, parsePlayerQuestionsOrder } from '@/lib/player-question-pool'
import { isPeoplePollGame, playerNameSubmissionHint } from '@/lib/player-participant-pool'
import { getRememberedName, subscribeLocalIdentity } from '@/lib/identity-local'
import { setHostPlayIntent } from '@/lib/host-play-intent'
import { CustomSlotBuilder } from '@/components/CustomSlotBuilder'
import { GenderRoundModeControl } from '@/components/GenderRoundModeControl'
import { customPairVoteModeOptions } from '@/lib/custom-game'
import { supportsGenderToggle, defaultGenderBasedForType } from '@/lib/gender-based'
import type { CustomSlotsConfig } from '@/types'
import { GameTypeModal } from '@/components/GameTypeModal'
import { GameTypeCard } from '@/components/GameTypeCard'
import { LibraryPackPicker } from '@/components/LibraryPackPicker'
import { PuzzleUpload } from '@/components/create/PuzzleUpload'
import { PageShell, BackBtn, Field, Chip, Toggle, PrimaryBtn, CustomSelect } from '@/components/ui/PageShell'
import { StepIndicator, SettingsGroup, StickyActionBar, SegmentedControl, ChipGrid } from '@/components/ui/CreateWizard'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import Link from 'next/link'
import { soloPlaySlug } from '@/lib/solo-play'
import { LateJoinPolicyToggle, LateJoinField } from '@/components/AllowViewersToggle'
import {
  gameSupportsViewerSetting,
  clampLateJoinPolicyForGameType,
  defaultLateJoinPolicyForGameType,
  type LateJoinPolicy,
} from '@/lib/viewers'
import { getParticipantCustomContentHint, getQuestionCustomContentHint } from '@/lib/custom-content-hints'
import { CustomContentAiTip } from '@/components/ui/CustomContentAiTip'
import { AiQuestionsGenerator } from '@/components/ui/AiQuestionsGenerator'
import type { AiQuestionGameType } from '@/lib/ai-questions'
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
import {
  QUIPLASH_DEFAULT_MAX_PLAYERS,
  QUIPLASH_DEFAULT_ROUNDS,
  QUIPLASH_DEFAULT_SUBMIT_TIMER,
  QUIPLASH_DEFAULT_VOTE_TIMER,
  QUIPLASH_SUBMIT_TIMER_OPTIONS,
  QUIPLASH_VOTE_TIMER_OPTIONS,
  QUIPLASH_MIN_ROUNDS,
  QUIPLASH_MAX_ROUNDS,
  clampQuiplashRounds,
} from '@/lib/quiplash'
import {
  QUICK_DRAW_DEFAULT_DRAW_TIMER,
  QUICK_DRAW_DEFAULT_MAX_PLAYERS,
  QUICK_DRAW_DEFAULT_ROUNDS,
  QUICK_DRAW_DEFAULT_TITLE_TIMER,
  QUICK_DRAW_DEFAULT_VOTE_TIMER,
  QUICK_DRAW_DRAW_TIMER_OPTIONS,
  QUICK_DRAW_MAX_ROUNDS,
  QUICK_DRAW_MIN_ROUNDS,
  QUICK_DRAW_TITLE_TIMER_OPTIONS,
  QUICK_DRAW_VOTE_TIMER_OPTIONS,
  clampQuickDrawRounds,
  formatQuickDrawTurnTimer,
} from '@/lib/quick-draw'
import {
  QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL,
  QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM,
  QUICK_DRAW_GUESS_TEAM_OPTIONS,
} from '@/lib/quick-draw-guess'
import { TTL_DEFAULT_MAX_PLAYERS, TTL_DEFAULT_TIMER, TTL_TIMER_OPTIONS } from '@/lib/two-truths'
import {
  MONOPOLY_DEFAULT_MAX_PLAYERS,
  MONOPOLY_GAME_DURATION_OPTIONS,
  formatMonopolyGameDuration,
} from '@/lib/monopoly'
import { MONOPOLY_DEFAULT_TURN_TIMER } from '@/lib/supabase-selects'
import {
  SCRABBLE_GAME_DURATION_OPTIONS,
  formatScrabbleGameDuration,
  SCRABBLE_CLOCK_OPTIONS,
  SCRABBLE_DEFAULT_CLOCK_SECONDS,
  type ScrabbleClockMode,
} from '@/lib/scrabble'
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
import { UNO_DEFAULT_MAX_PLAYERS, UNO_GAME_DURATION_OPTIONS, formatUnoGameDuration } from '@/lib/uno'
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
import {
  LANDMINE_DEFAULT_ROUND_COUNT,
  LANDMINE_DEFAULT_WRITING_TIMER,
  LANDMINE_DEFAULT_MARKING_TIMER,
  LANDMINE_DEFAULT_CATEGORY_TIMER,
} from '@/lib/landmine'
import { WORD_HUNT_DEFAULT_MAX_PLAYERS, WORD_HUNT_DEFAULT_TIMER, WORD_HUNT_TIMER_OPTIONS } from '@/lib/word-hunt'
import { formatSudokuGameDuration, SUDOKU_GAME_DURATION_OPTIONS } from '@/lib/sudoku'
import {
  formatCrosswordGameDuration,
  CROSSWORD_GAME_DURATION_OPTIONS,
  CROSSWORD_DEFAULT_DURATION,
  CROSSWORD_DIFFICULTIES,
  CROSSWORD_DEFAULT_DIFFICULTY,
  type CrosswordDifficulty,
} from '@/lib/crossword'
import { crosswordThemeOptions, CROSSWORD_DEFAULT_THEME } from '@/lib/crossword-puzzles'
import { usePuzzleThemes, puzzleThemeIdFromValue, type PuzzleThemeOption } from '@/hooks/usePuzzleThemes'
import {
  formatWordSearchGameDuration,
  WORD_SEARCH_GAME_DURATION_OPTIONS,
  WORD_SEARCH_DEFAULT_DURATION,
  WORD_SEARCH_DIFFICULTIES,
  WORD_SEARCH_DEFAULT_DIFFICULTY,
  type WordSearchDifficulty,
} from '@/lib/word-search'
import { wordSearchThemeOptions, WORD_SEARCH_DEFAULT_THEME } from '@/lib/word-search-puzzles'
import {
  formatWordScrambleGameDuration,
  WORD_SCRAMBLE_GAME_DURATION_OPTIONS,
  WORD_SCRAMBLE_DEFAULT_DURATION,
  WORD_SCRAMBLE_DIFFICULTIES,
  WORD_SCRAMBLE_DEFAULT_DIFFICULTY,
  type WordScrambleDifficulty,
} from '@/lib/word-scramble'
import { wordScrambleThemeOptions, WORD_SCRAMBLE_DEFAULT_THEME } from '@/lib/word-scramble-puzzles'
import {
  formatWordGroupingGameDuration,
  WORD_GROUPING_GAME_DURATION_OPTIONS,
  WORD_GROUPING_DEFAULT_DURATION,
} from '@/lib/word-grouping'
import { MATCHING_PAIRS_GAME_DURATION_OPTIONS, formatMatchingPairsGameDuration } from '@/lib/memory-match'
import {
  DESCRIBE_IT_DEFAULT_ROUNDS,
  DESCRIBE_IT_DEFAULT_MAX_PLAYERS,
  DESCRIBE_IT_DEFAULT_TURN_SECONDS,
  DESCRIBE_IT_MAX_PLAYER_OPTIONS,
  DESCRIBE_IT_MIN_PLAYERS,
  DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL,
  DESCRIBE_IT_ROUND_OPTIONS,
  DESCRIBE_IT_TEAM_OPTIONS,
  DESCRIBE_IT_TURN_OPTIONS,
} from '@/lib/describe-it'
import {
  WORD_RUSH_DEFAULT_MAX_PLAYERS,
  WORD_RUSH_DEFAULT_ROUNDS,
  WORD_RUSH_DEFAULT_TURN_SECONDS,
  WORD_RUSH_MAX_PLAYER_OPTIONS,
  WORD_RUSH_MIN_PLAYERS,
  WORD_RUSH_MIN_PLAYERS_INDIVIDUAL,
  WORD_RUSH_ROUND_OPTIONS,
  WORD_RUSH_TEAM_OPTIONS,
  WORD_RUSH_TURN_OPTIONS,
  formatWordRushTurnTimer,
} from '@/lib/word-rush'
import { parseDescribeItWords, parseExcelDescribeItWords } from '@/lib/describe-it-words'
import { getCodeDefaultLimits, playerCountOptions, type GamePlayerLimitsMap } from '@/lib/game-limits'
import { TriviaTimerPicker } from '@/components/trivia/TriviaTimerPicker'
import { TRIVIA_QUESTION_COUNT } from '@/lib/trivia-questions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { ELIMINATION_COMPATIBLE_TYPES } from '@/types/elimination'

function SoloPracticeCta({ gameType }: { gameType: GameType }) {
  const slug = soloPlaySlug(gameType)
  if (!slug) return null
  return (
    <p className="text-sm">
      Want to play solo?{' '}
      <Link href={`/play-solo/${slug}`} className="font-semibold no-underline" style={{ color: 'var(--accent)' }}>
        Practice against the bot →
      </Link>
    </p>
  )
}

function CreateGameInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const { confirm } = useConfirm()
  const [step, setStep] = useState<Step>('settings')
  const [showGameTypes, setShowGameTypes] = useState(false)
  const [previewTheme, setPreviewTheme] = useState<(typeof THEMES)[number] | null>(null)
  const [participantTab, setParticipantTab] = useState<ParticipantTab>('upload')
  const [settings, setSettings] = useState<Settings>({
    title: '',
    content_label: '',
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
    isPublic: false,
    describe_it_num_teams: 2,
    describe_it_mode: 'team',
    quick_draw_variant: 'guess',
    quick_draw_play_mode: 'team',
    quick_draw_num_teams: 2,
    word_rush_num_teams: 2,
    word_rush_mode: 'team',
    word_rush_prompt_mode: 'automatic',
    word_rush_difficulty: 'standard',
  })
  const [describeItWords, setDescribeItWords] = useState('')
  const [describeItUploadError, setDescribeItUploadError] = useState<string | null>(null)
  const describeItFileRef = useRef<HTMLInputElement>(null)
  const [quickDrawWords, setQuickDrawWords] = useState('')
  const [quickDrawUploadError, setQuickDrawUploadError] = useState<string | null>(null)
  const quickDrawFileRef = useRef<HTMLInputElement>(null)
  const crosswordFileRef = useRef<HTMLInputElement>(null)
  const wordSearchFileRef = useRef<HTMLInputElement>(null)
  const wordScrambleFileRef = useRef<HTMLInputElement>(null)
  const [participants, setParticipants] = useState<ParticipantInput[]>([])
  const [nameInput, setNameInput] = useState('')
  const [defaultGender, setDefaultGender] = useState<ParticipantGender>('female')
  const [loading, setLoading] = useState(false)
  // Set by a template's "Use & create" button: applies the template's values (via
  // setState calls), then this effect fires once those commit so createGame's
  // closure sees the applied values rather than whatever was on screen before.
  const [pendingAutoCreate, setPendingAutoCreate] = useState(false)
  // Save-as-template widgets (TemplateQuickStart at top, save button+modal at bottom of the
  // settings column) share this slot state + save modal rather than each owning their own copy,
  // so saving/deleting from either place is instantly reflected in the other.
  const [templateSlots, setTemplateSlots] = useState<TemplateSlots | null>(null)
  const [templateModal, setTemplateModal] = useState<{ open: boolean; presetSlot: number | null }>({
    open: false,
    presetSlot: null,
  })
  // Set when a Quick Start pill is tapped; confirmed via UseTemplateConfirmModal before it
  // actually applies the template and creates the game (see runUseTemplate/confirmUseTemplate).
  const [useTemplateConfirm, setUseTemplateConfirm] = useState<GameTemplate | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const questionsFileRef = useRef<HTMLInputElement>(null)
  const wstDeckFileRef = useRef<HTMLInputElement>(null)
  // True once the host manually edits the Category — after that, the AI "Theme" no longer mirrors into it.
  const contentLabelTouchedRef = useRef(false)
  const [bulkPaste, setBulkPaste] = useState('')
  const [questionSource, setQuestionSource] = useState<QuestionSource>('platform')
  const [playerQuestionsEnabled, setPlayerQuestionsEnabled] = useState(true)
  const [playerQuestionsOrder, setPlayerQuestionsOrder] = useState<PlayerQuestionsOrder>('players_first')
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
  // Pre-set roster deck (quote + who said it) uploaded for Who Said This.
  const [wstDeck, setWstDeck] = useState<WstDeckEntry[]>([])
  const [wstDeckError, setWstDeckError] = useState<string | null>(null)
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
  const [quiplashMaxPlayers, setQuiplashMaxPlayers] = useState(QUIPLASH_DEFAULT_MAX_PLAYERS)
  const [quiplashVoteTimer, setQuiplashVoteTimer] = useState(QUIPLASH_DEFAULT_VOTE_TIMER)
  const [quickDrawMaxPlayers, setQuickDrawMaxPlayers] = useState(QUICK_DRAW_DEFAULT_MAX_PLAYERS)
  const [quickDrawTitleTimer, setQuickDrawTitleTimer] = useState(QUICK_DRAW_DEFAULT_TITLE_TIMER)
  const [quickDrawVoteTimer, setQuickDrawVoteTimer] = useState(QUICK_DRAW_DEFAULT_VOTE_TIMER)
  const [ttlMaxPlayers, setTtlMaxPlayers] = useState(TTL_DEFAULT_MAX_PLAYERS)
  const [monopolyMaxPlayers, setMonopolyMaxPlayers] = useState(MONOPOLY_DEFAULT_MAX_PLAYERS)
  const [monopolyBoardSize, setMonopolyBoardSize] = useState<40 | 48>(40)
  const [monopolyGameDuration, setMonopolyGameDuration] = useState(0)
  const [scrabbleGameDuration, setScrabbleGameDuration] = useState(0)
  const [scrabbleDictionary, setScrabbleDictionary] = useState<ScrabbleDictionaryId>(SCRABBLE_DEFAULT_DICTIONARY)
  const [scrabbleClockMode, setScrabbleClockMode] = useState<ScrabbleClockMode>('standard')
  const [scrabbleClockSeconds, setScrabbleClockSeconds] = useState(SCRABBLE_DEFAULT_CLOCK_SECONDS)
  const [chessBoardTheme, setChessBoardTheme] = useState('green')
  const [chessPieceSet, setChessPieceSet] = useState('neo')
  // On successful chess-game creation we mirror the host's chosen look into this
  // device's personal preference (see createGame), so a leftover per-device
  // override from a previous game doesn't silently shadow it on the host's board.
  const { setBoardTheme: setDeviceBoardTheme, setPieceSet: setDevicePieceSet } = useChessAppearance()
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
  const [unoMaxPlayers, setUnoMaxPlayers] = useState(UNO_DEFAULT_MAX_PLAYERS)
  const [unoGameDuration, setUnoGameDuration] = useState(0)
  const [unoWd4Challenge, setUnoWd4Challenge] = useState(true)
  const [unoUnoPenalty, setUnoUnoPenalty] = useState(2)
  const [unoZeroSeven, setUnoZeroSeven] = useState(false)
  const [unoStacking, setUnoStacking] = useState(false)
  const [unoJumpIn, setUnoJumpIn] = useState(false)
  const [unoMultiPlayMode, setUnoMultiPlayMode] = useState<
    'off' | 'same_color' | 'same_number' | 'same_color_or_number'
  >('same_color_or_number')
  const [unoTeamMode, setUnoTeamMode] = useState(false)
  const [unoMode, setUnoMode] = useState<'classic' | 'no_mercy'>('classic')
  const [unoNoMercyWin, setUnoNoMercyWin] = useState<'first_out' | 'last_standing'>('first_out')
  const [unoSeriesScoring, setUnoSeriesScoring] = useState(false)
  const [unoSeriesTarget, setUnoSeriesTarget] = useState(1000)
  const [ludoMaxPlayers, setLudoMaxPlayers] = useState(LUDO_DEFAULT_MAX_PLAYERS)
  const [ludoVariant, setLudoVariant] = useState<LudoVariant>('modern')
  const [ayoVariant, setAyoVariant] = useState<AyoVariant>('traditional')
  const [mahjongRuleset, setMahjongRuleset] = useState<MahjongRuleset>(DEFAULT_MAHJONG_RULESET)
  const [snakeLadderMaxPlayers, setSnakeLadderMaxPlayers] = useState(SNAKE_LADDER_DEFAULT_MAX_PLAYERS)
  const [npatMaxPlayers, setNpatMaxPlayers] = useState(NPAT_DEFAULT_MAX_PLAYERS)
  const [sudokuMaxPlayers, setSudokuMaxPlayers] = useState(20)
  const [sudokuGameDuration, setSudokuGameDuration] = useState(0)
  const [crosswordMaxPlayers, setCrosswordMaxPlayers] = useState(20)
  const [crosswordGameDuration, setCrosswordGameDuration] = useState<number>(CROSSWORD_DEFAULT_DURATION)
  const [crosswordTheme, setCrosswordTheme] = useState<string>(CROSSWORD_DEFAULT_THEME)
  const [crosswordDifficulty, setCrosswordDifficulty] = useState<CrosswordDifficulty>(CROSSWORD_DEFAULT_DIFFICULTY)
  const [wordSearchMaxPlayers, setWordSearchMaxPlayers] = useState(20)
  const [wordSearchGameDuration, setWordSearchGameDuration] = useState<number>(WORD_SEARCH_DEFAULT_DURATION)
  const [wordSearchTheme, setWordSearchTheme] = useState<string>(WORD_SEARCH_DEFAULT_THEME)
  const [wordSearchDifficulty, setWordSearchDifficulty] = useState<WordSearchDifficulty>(WORD_SEARCH_DEFAULT_DIFFICULTY)
  const [wordScrambleMaxPlayers, setWordScrambleMaxPlayers] = useState(20)
  const [wordScrambleGameDuration, setWordScrambleGameDuration] = useState<number>(WORD_SCRAMBLE_DEFAULT_DURATION)
  const [wordScrambleTheme, setWordScrambleTheme] = useState<string>(WORD_SCRAMBLE_DEFAULT_THEME)
  const [wordGroupingMaxPlayers, setWordGroupingMaxPlayers] = useState(20)
  const [wordGroupingGameDuration, setWordGroupingGameDuration] = useState<number>(WORD_GROUPING_DEFAULT_DURATION)
  const [wordScrambleDifficulty, setWordScrambleDifficulty] = useState<WordScrambleDifficulty>(
    WORD_SCRAMBLE_DEFAULT_DIFFICULTY
  )
  // Admin-authored themes shown in the theme dropdown alongside the built-ins. A selected admin
  // theme carries value `pt:<id>` in the same <select>; the create payload sends puzzle_theme_id
  // and the server folds its word pool + locked difficulty into the game.
  const puzzleThemes = usePuzzleThemes(settings.game_type)
  const lockedPuzzleDifficulty = (value: string): PuzzleThemeOption['difficulty'] => {
    const id = puzzleThemeIdFromValue(value)
    return id ? (puzzleThemes.find((t) => t.id === id)?.difficulty ?? null) : null
  }
  const [wordHuntMaxPlayers, setWordHuntMaxPlayers] = useState(WORD_HUNT_DEFAULT_MAX_PLAYERS)
  const [wordRushMaxPlayers, setWordRushMaxPlayers] = useState(WORD_RUSH_DEFAULT_MAX_PLAYERS)
  const [describeItMaxPlayers, setDescribeItMaxPlayers] = useState(DESCRIBE_IT_DEFAULT_MAX_PLAYERS)
  const [wordHuntTimer, setWordHuntTimer] = useState(WORD_HUNT_DEFAULT_TIMER)
  const [npatGameDuration, setNpatGameDuration] = useState(NPAT_DEFAULT_GAME_DURATION)
  const [npatMarkingTimer, setNpatMarkingTimer] = useState(NPAT_DEFAULT_MARKING_TIMER)
  const [landmineMode, setLandmineMode] = useState<'zero_points' | 'elimination'>('zero_points')
  const [landmineMineSource, setLandmineMineSource] = useState<'system' | 'manual'>('system')
  const [landmineMineCount, setLandmineMineCount] = useState(1)
  const [landmineOriginality, setLandmineOriginality] = useState(true)
  // Nigerian Draughts "Street Rules" (huffing) — off by default, matching standard competitive play.
  const [checkersNigeriaStreetRules, setCheckersNigeriaStreetRules] = useState(false)
  // Review-before-reveal: on by default for both modes (host can turn it off for instant reveal).
  const [landmineReview, setLandmineReview] = useState(true)
  // Review-window length (seconds); default seeded per mode (manual 45, auto 20).
  const [landmineReviewSeconds, setLandmineReviewSeconds] = useState(20)
  const [landmineCategoryTimer, setLandmineCategoryTimer] = useState(10)
  const [landmineMarkingTimer, setLandmineMarkingTimer] = useState(45)
  const [landmineElimSeconds, setLandmineElimSeconds] = useState(300)
  const [eliminationEnabled, setEliminationEnabled] = useState(false)
  const [eliminationMode, setEliminationMode] = useState<'per-round' | 'lives'>('per-round')
  const [eliminationRule, setEliminationRule] = useState<'bottom-n' | 'score-threshold'>('bottom-n')
  const [eliminateCount, setEliminateCount] = useState(1)
  const [scoreThreshold, setScoreThreshold] = useState(50)
  const [startingLives, setStartingLives] = useState(3)
  const [customTriviaQuestions, setCustomTriviaQuestions] = useState<TriviaQuestion[]>([])
  const [customCrosswordEntries, setCustomCrosswordEntries] = useState<CrosswordEntry[]>([])
  const [customWordSearchWords, setCustomWordSearchWords] = useState<WordSearchEntry[]>([])
  const [customWordScrambleWords, setCustomWordScrambleWords] = useState<WordScrambleEntry[]>([])
  const [puzzleUploadError, setPuzzleUploadError] = useState<string | null>(null)
  const [puzzleUploadSummary, setPuzzleUploadSummary] = useState<string | null>(null)
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [libraryPackQuestions, setLibraryPackQuestions] = useState<unknown[]>([])
  const [libraryPacks, setLibraryPacks] = useState<
    {
      id: string
      title: string
      author_name: string
      question_count: number
      collections?: { slug: string; name: string }[]
    }[]
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

  // Hydrate saved templates after mount (avoids SSR/localStorage mismatch), and whenever the
  // game type changes — each game type has its own independent set of slots.
  useEffect(() => {
    setTemplateSlots(getTemplates(settings.game_type))
  }, [settings.game_type])

  useEffect(() => {
    if (questionSource !== 'library') return
    const gt = LIBRARY_GAME_TYPE_MAP[settings.game_type]
    if (!gt && !isQuickDrawGame(settings.game_type)) return
    setLibraryPackSearch('')
    setLibraryPacksLoading(true)
    const types = isQuickDrawGame(settings.game_type) ? ['quick_draw', 'describe_it'] : gt ? [gt] : []
    Promise.all(types.map((type) => fetch(`/api/library?game_type=${type}&page_size=100`).then((r) => r.json())))
      .then((results) => {
        const byId = new Map<string, (typeof libraryPacks)[number]>()
        for (const d of results) {
          for (const pack of d.packs ?? []) byId.set(pack.id, pack)
        }
        setLibraryPacks([...byId.values()])
      })
      .finally(() => setLibraryPacksLoading(false))
  }, [questionSource, settings.game_type])

  const selectLibraryPack = async (id: string) => {
    setSelectedPackId(id)
    const res = await fetch(`/api/library/${id}`)
    const data = await res.json()
    if (data.pack?.questions) {
      const qs = data.pack.questions
      setLibraryPackQuestions(qs)
      // Auto-fill the player-facing content label with the pack name (e.g. "Bible trivia")
      // unless the host has already typed their own.
      if (data.pack.title && !settings.content_label.trim())
        setSettings((s) => (s.content_label.trim() ? s : { ...s, content_label: data.pack.title }))
      if (isTriviaGame(settings.game_type)) setCustomTriviaQuestions(qs as TriviaQuestion[])
      else if (isWouldYouRather(settings.game_type) || isThisOrThat(settings.game_type))
        setCustomWyrQuestions(qs as WyrQuestion[])
      else if (isDescribeItGame(settings.game_type))
        setDescribeItWords(parseDescribeItWords((qs as string[]).join('\n')).join('\n'))
      else if (isQuickDrawGame(settings.game_type))
        setQuickDrawWords(parseDescribeItWords((qs as string[]).join('\n')).join('\n'))
      else if (isCodewordsGame(settings.game_type)) setCustomCodewordsWords(parseStoredCodewordsWords(qs))
      else if (isCrosswordGame(settings.game_type)) setCustomCrosswordEntries(parseStoredCrosswordEntries(qs))
      else if (isWordSearchGame(settings.game_type)) setCustomWordSearchWords(parseStoredWordSearchEntries(qs))
      else if (isWordScrambleGame(settings.game_type)) setCustomWordScrambleWords(parseStoredWordScrambleEntries(qs))
      else setCustomMltQuestions(qs as string[])
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
    setQuiplashMaxPlayers((v) => clamp('quiplash', v))
    setQuickDrawMaxPlayers((v) => clamp('quick_draw', v))
    setMonopolyMaxPlayers((v) => clamp('monopoly', v))
    setYahtzeeMaxPlayers((v) => clamp('yahtzee', v))
    setWhotMaxPlayers((v) => clamp('whot', v))
    setCrazy8MaxPlayers((v) => clamp('crazy_eights', v))
    setUnoMaxPlayers((v) => clamp('uno', v))
    setLudoMaxPlayers((v) => clamp('ludo', v))
    setSnakeLadderMaxPlayers((v) => clamp('snake_and_ladder', v))
    setNpatMaxPlayers((v) => clamp('i_call_on', v))
    setWordRushMaxPlayers((v) => clamp('word_rush', v))
    setDescribeItMaxPlayers((v) => clamp('describe_it', v))
  }, [lobbyLimits])

  useEffect(() => {
    setLateJoinPolicy((prev) =>
      // Text Charades is a drop-in party word game — late joiners should be able to
      // jump in and play, not just watch. Give it (and any future type with a
      // friendlier default) that policy; other types keep their previous choice,
      // clamped to what the type supports. The host can still restrict it after.
      isDescribeItGame(settings.game_type)
        ? defaultLateJoinPolicyForGameType(settings.game_type)
        : clampLateJoinPolicyForGameType(prev, settings.game_type)
    )
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
        ...(isQuiplashGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: QUIPLASH_DEFAULT_ROUNDS,
              timer_seconds: QUIPLASH_DEFAULT_SUBMIT_TIMER,
            }
          : {}),
        ...(isQuickDrawGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: QUICK_DRAW_DEFAULT_ROUNDS,
              timer_seconds: QUICK_DRAW_DEFAULT_DRAW_TIMER,
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
        ...(isUnoGame(type)
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
        ...(isPingPongGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              ping_pong_points_to_win: 7,
              game_duration_seconds: 0,
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
        ...(isCheckersGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              // Cumulative per-player clock, same as Chess. Default 10 minutes each.
              timer_seconds: 600,
            }
          : {}),
        ...(isAyoGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              timer_seconds: 300, // 5 min per-player time bank
            }
          : {}),
        ...(isScrabbleGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              timer_seconds: 120, // 2 min per turn
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
        ...(isWordRushGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: WORD_RUSH_DEFAULT_ROUNDS,
              timer_seconds: WORD_RUSH_DEFAULT_TURN_SECONDS,
              word_rush_num_teams: 2,
              word_rush_mode: 'team' as const,
              word_rush_prompt_mode: 'automatic' as const,
              word_rush_difficulty: 'standard' as const,
            }
          : {}),
        ...(isMafiaGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              timer_seconds: 60,
              mafia_advanced_mode: false,
              mafia_anonymous_votes: true,
              mafia_day_seconds: 90,
              mafia_voting_seconds: 45,
            }
          : {}),
        ...(isMatchingPairsGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              game_duration_seconds: 0,
            }
          : {}),
        ...(isMahjongGame(type)
          ? {
              participant_mode: 'joiners' as const,
              anonymous: true,
              rounds_count: 1,
              timer_seconds: 30,
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
    const packGameType = searchParams.get('type')
    if (packParam) {
      setSelectedPackId(packParam)
      fetch(`/api/library/${packParam}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.pack?.questions) return
          const gt = d.pack.game_type
          const qs = d.pack.questions
          if (d.pack.title) setSettings((s) => (s.content_label.trim() ? s : { ...s, content_label: d.pack.title }))
          if (gt === 'describe_it' || gt === 'quick_draw') {
            const words = parseDescribeItWords((qs as string[]).join('\n')).join('\n')
            setQuestionSource('custom')
            if (isQuickDrawGame(settings.game_type) || packGameType === 'quick_draw') {
              setQuickDrawWords(words)
            } else {
              setDescribeItWords(words)
            }
          } else if (gt === 'codewords') {
            setQuestionSource('custom')
            setCustomCodewordsWords(parseStoredCodewordsWords(qs))
          } else if (gt === 'crossword') {
            setQuestionSource('library')
            setCustomCrosswordEntries(parseStoredCrosswordEntries(qs))
          } else if (gt === 'word_search') {
            setQuestionSource('library')
            setCustomWordSearchWords(parseStoredWordSearchEntries(qs))
          } else if (gt === 'word_scramble') {
            setQuestionSource('library')
            setCustomWordScrambleWords(parseStoredWordScrambleEntries(qs))
          } else {
            setQuestionSource('library')
            if (gt === 'trivia') setCustomTriviaQuestions(qs as TriviaQuestion[])
            else if (gt === 'would_you_rather' || gt === 'this_or_that') setCustomWyrQuestions(qs as WyrQuestion[])
            else setCustomMltQuestions(qs as string[])
          }
          setLibraryPackQuestions(qs)
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
  const isQuiplash = isQuiplashGame(settings.game_type)
  const isQuickDraw = isQuickDrawGame(settings.game_type)
  const isTwoTruths = isTwoTruthsGame(settings.game_type)
  const isMonopoly = isMonopolyGame(settings.game_type)
  const isYahtzee = isYahtzeeGame(settings.game_type)
  const isWhot = isWhotGame(settings.game_type)
  useEffect(() => {
    if (!whotCardsEnabled) setWhotNumberCallsEnabled(false)
  }, [whotCardsEnabled])
  const isCrazy8 = isCrazyEightsGame(settings.game_type)
  const isUno = isUnoGame(settings.game_type)
  const isLudo = isLudoGame(settings.game_type)
  const isSnakeLadder = isSnakeAndLadderGame(settings.game_type)
  const isTicTacToe = isTicTacToeGame(settings.game_type)
  const isPingPong = isPingPongGame(settings.game_type)
  const isChess = isChessGame(settings.game_type)
  const isCheckers = isCheckersGame(settings.game_type)
  const isDraughts10 = isDraughts10Game(settings.game_type)
  const isCheckersNigeria = isCheckersNigeriaGame(settings.game_type)
  const isAyo = isAyoGame(settings.game_type)
  const isScrabble = isScrabbleGame(settings.game_type)
  const isDescribeIt = isDescribeItGame(settings.game_type)
  const isWordRush = isWordRushGame(settings.game_type)
  const isMafia = isMafiaGame(settings.game_type)
  const isNpat = isICallOnGame(settings.game_type)
  const isLandmine = isLandmineGame(settings.game_type)
  const isSudoku = isSudokuGame(settings.game_type)
  const isCrossword = isCrosswordGame(settings.game_type)
  const isWordSearch = isWordSearchGame(settings.game_type)
  const isWordScramble = isWordScrambleGame(settings.game_type)
  const isWordGrouping = isWordGroupingGame(settings.game_type)
  // Difficulty = grid size, which is independent of where the words come from, so it stays editable
  // under every source. A theme only locks difficulty on the Platform tab (admin themes carry one);
  // under Library/Your own there's no theme, so never treat a stale theme value as a lock there.
  const crosswordDiffLock = questionSource === 'platform' ? lockedPuzzleDifficulty(crosswordTheme) : null
  const wordSearchDiffLock = questionSource === 'platform' ? lockedPuzzleDifficulty(wordSearchTheme) : null
  const wordScrambleDiffLock = questionSource === 'platform' ? lockedPuzzleDifficulty(wordScrambleTheme) : null
  const isWordHunt = isWordHuntGame(settings.game_type)
  const isMatchingPairs = isMatchingPairsGame(settings.game_type)
  const isMahjong = isMahjongGame(settings.game_type)
  const showViewerToggle = gameSupportsViewerSetting(settings.game_type)
  const isWst = isWhoSaidThis(settings.game_type)
  // Who Said This host-provided deck (Platform / Library / uploaded). Players just join and
  // answer (no name list), so it's a single-step quick-create like trivia.
  const isWstDeck = isWst && wstQuoteSource === 'deck'
  // The effective deck for the selected source: built-in Platform pack, a chosen Library pack,
  // or the uploaded CSV. Fed into custom_questions + the create-button gating.
  const wstDeckContent: WstDeckEntry[] = !isWstDeck
    ? []
    : questionSource === 'platform'
      ? WST_PLATFORM_DECK
      : questionSource === 'library'
        ? (libraryPackQuestions as WstDeckEntry[])
        : wstDeck
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

  // Save-as-template field registry (see src/lib/game-templates.ts + ./components/TemplateBar).
  // Settings are split across the shared `Settings` object and dozens of per-game useState
  // hooks above, so there's no single object to serialize — this maps each tunable field to
  // its own get/set, scoped to the game type(s) it applies to. `title`, participants, and any
  // custom question/CSV content are deliberately excluded — those aren't "settings" to reuse.
  // Reusable game-type predicates for entries below that apply to more than one `isXGame` helper.
  const isPollFamilyGame = (t: GameType) =>
    isWouldYouRather(t) ||
    isNeverHaveIEver(t) ||
    isThisOrThat(t) ||
    isMostLikelyTo(t) ||
    isPickANumber(t) ||
    isHotSeat(t) ||
    isPairGame(t) ||
    t === 'smash_marry_kill' ||
    t === 'parent_approval'
  const roundsCountApplies = (t: GameType) =>
    isPollFamilyGame(t) ||
    isTriviaGame(t) ||
    isQuiplashGame(t) ||
    isQuickDrawGame(t) ||
    isDescribeItGame(t) ||
    isWordRushGame(t) ||
    isLandmineGame(t) ||
    isMatchingPairsGame(t)
  const eliminationApplies = (t: GameType) => (ELIMINATION_COMPATIBLE_TYPES as readonly string[]).includes(t)
  // Mirrors the `hostPlaySupported` computation below (defined later in this component, from
  // per-render isX booleans) but as a reusable predicate over an arbitrary game type, since
  // TEMPLATE_FIELDS needs `appliesTo(t)` rather than a value pinned to the current game type.
  const hostPlaySupportedFor = (t: GameType) =>
    !isWouldYouRather(t) &&
    !isThisOrThat(t) &&
    !isNeverHaveIEver(t) &&
    !isMostLikelyTo(t) &&
    !isPickANumber(t) &&
    !isHotSeat(t) &&
    !isPeoplePollGame(t) &&
    !isAnonymousMessagesGame(t) &&
    !isSecretMessageGame(t)
  const TEMPLATE_FIELDS: Record<
    string,
    { get: () => unknown; set: (v: unknown) => void; appliesTo: (t: GameType) => boolean }
  > = {
    timer_seconds: {
      get: () => settings.timer_seconds,
      set: (v) => setSettings((s) => ({ ...s, timer_seconds: v as number })),
      appliesTo: templatableGame,
    },
    theme: {
      get: () => settings.theme,
      set: (v) => setSettings((s) => ({ ...s, theme: v as Settings['theme'] })),
      appliesTo: templatableGame,
    },
    is_public: {
      get: () => settings.isPublic,
      set: (v) => setSettings((s) => ({ ...s, isPublic: v as boolean })),
      appliesTo: templatableGame,
    },
    late_join_policy: {
      get: () => lateJoinPolicy,
      set: (v) => setLateJoinPolicy(v as LateJoinPolicy),
      appliesTo: gameSupportsViewerSetting,
    },
    // "You" — host seat choice (Host + play vs Host only) and the host's own display name,
    // for games whose host panel supports seating the host as a player.
    host_will_play: {
      get: () => hostWillPlay,
      set: (v) => setHostWillPlay(v as boolean),
      appliesTo: hostPlaySupportedFor,
    },
    host_name: {
      get: () => hostName,
      set: (v) => setHostName(v as string),
      appliesTo: hostPlaySupportedFor,
    },
    // Poll-family games (would-you-rather, never-have-i-ever, this-or-that, most-likely-to,
    // pick-a-number, hot-seat, smash-marry-kill, red/green-flag, smash-or-pass, parent-approval)
    rounds_count: {
      get: () => settings.rounds_count,
      set: (v) => setSettings((s) => ({ ...s, rounds_count: v as number })),
      appliesTo: roundsCountApplies,
    },
    participant_mode: {
      get: () => settings.participant_mode,
      set: (v) => setSettings((s) => ({ ...s, participant_mode: v as Settings['participant_mode'] })),
      appliesTo: isPollFamilyGame,
    },
    gender_based: {
      get: () => settings.gender_based,
      set: (v) => setSettings((s) => ({ ...s, gender_based: v as boolean })),
      appliesTo: supportsGenderToggle,
    },
    pair_vote_mode: {
      get: () => settings.pair_vote_mode,
      set: (v) => setSettings((s) => ({ ...s, pair_vote_mode: v as Settings['pair_vote_mode'] })),
      appliesTo: isPairGame,
    },
    // Who Said This
    wst_quote_source: {
      get: () => wstQuoteSource,
      set: (v) => setWstQuoteSource(v as WstQuoteSource),
      appliesTo: isWhoSaidThis,
    },
    // Bingo
    bingo_max_players: {
      get: () => bingoMaxPlayers,
      set: (v) => setBingoMaxPlayers(v as number),
      appliesTo: isBingoGame,
    },
    bingo_call_mode: {
      get: () => bingoCallMode,
      set: (v) => setBingoCallMode(v as BingoCallMode),
      appliesTo: isBingoGame,
    },
    bingo_call_interval: {
      get: () => bingoCallInterval,
      set: (v) => setBingoCallInterval(v as number),
      appliesTo: isBingoGame,
    },
    // Codewords
    codewords_max_players: {
      get: () => codewordsMaxPlayers,
      set: (v) => setCodewordsMaxPlayers(v as number),
      appliesTo: isCodewordsGame,
    },
    codewords_operative_timer: {
      get: () => codewordsOperativeTimer,
      set: (v) => setCodewordsOperativeTimer(v as number),
      appliesTo: isCodewordsGame,
    },
    codewords_player_picks: {
      get: () => codewordsPlayerPicks,
      set: (v) => setCodewordsPlayerPicks(v as boolean),
      appliesTo: isCodewordsGame,
    },
    codewords_randomize_teams: {
      get: () => codewordsRandomizeTeams,
      set: (v) => setCodewordsRandomizeTeams(v as boolean),
      appliesTo: isCodewordsGame,
    },
    // Trivia
    trivia_max_players: {
      get: () => triviaMaxPlayers,
      set: (v) => setTriviaMaxPlayers(v as number),
      appliesTo: isTriviaGame,
    },
    trivia_category: {
      get: () => triviaCategory,
      set: (v) => setTriviaCategory(v as TriviaCategory),
      appliesTo: isTriviaGame,
    },
    // Quiplash
    quiplash_max_players: {
      get: () => quiplashMaxPlayers,
      set: (v) => setQuiplashMaxPlayers(v as number),
      appliesTo: isQuiplashGame,
    },
    quiplash_vote_timer: {
      get: () => quiplashVoteTimer,
      set: (v) => setQuiplashVoteTimer(v as number),
      appliesTo: isQuiplashGame,
    },
    // Quick Draw
    quick_draw_max_players: {
      get: () => quickDrawMaxPlayers,
      set: (v) => setQuickDrawMaxPlayers(v as number),
      appliesTo: isQuickDrawGame,
    },
    quick_draw_title_timer: {
      get: () => quickDrawTitleTimer,
      set: (v) => setQuickDrawTitleTimer(v as number),
      appliesTo: isQuickDrawGame,
    },
    quick_draw_vote_timer: {
      get: () => quickDrawVoteTimer,
      set: (v) => setQuickDrawVoteTimer(v as number),
      appliesTo: isQuickDrawGame,
    },
    quick_draw_variant: {
      get: () => settings.quick_draw_variant,
      set: (v) => setSettings((s) => ({ ...s, quick_draw_variant: v as Settings['quick_draw_variant'] })),
      appliesTo: isQuickDrawGame,
    },
    quick_draw_play_mode: {
      get: () => settings.quick_draw_play_mode,
      set: (v) => setSettings((s) => ({ ...s, quick_draw_play_mode: v as Settings['quick_draw_play_mode'] })),
      appliesTo: isQuickDrawGame,
    },
    quick_draw_num_teams: {
      get: () => settings.quick_draw_num_teams,
      set: (v) => setSettings((s) => ({ ...s, quick_draw_num_teams: v as number })),
      appliesTo: isQuickDrawGame,
    },
    // Two Truths & a Lie
    two_truths_max_players: {
      get: () => ttlMaxPlayers,
      set: (v) => setTtlMaxPlayers(v as number),
      appliesTo: isTwoTruthsGame,
    },
    // Text Charades (describe_it)
    describe_it_max_players: {
      get: () => describeItMaxPlayers,
      set: (v) => setDescribeItMaxPlayers(v as number),
      appliesTo: isDescribeItGame,
    },
    describe_it_mode: {
      get: () => settings.describe_it_mode,
      set: (v) => setSettings((s) => ({ ...s, describe_it_mode: v as Settings['describe_it_mode'] })),
      appliesTo: isDescribeItGame,
    },
    describe_it_num_teams: {
      get: () => settings.describe_it_num_teams,
      set: (v) => setSettings((s) => ({ ...s, describe_it_num_teams: v as number })),
      appliesTo: isDescribeItGame,
    },
    // Word Rush
    word_rush_max_players: {
      get: () => wordRushMaxPlayers,
      set: (v) => setWordRushMaxPlayers(v as number),
      appliesTo: isWordRushGame,
    },
    word_rush_mode: {
      get: () => settings.word_rush_mode,
      set: (v) => setSettings((s) => ({ ...s, word_rush_mode: v as Settings['word_rush_mode'] })),
      appliesTo: isWordRushGame,
    },
    word_rush_prompt_mode: {
      get: () => settings.word_rush_prompt_mode,
      set: (v) => setSettings((s) => ({ ...s, word_rush_prompt_mode: v as Settings['word_rush_prompt_mode'] })),
      appliesTo: isWordRushGame,
    },
    word_rush_difficulty: {
      get: () => settings.word_rush_difficulty,
      set: (v) => setSettings((s) => ({ ...s, word_rush_difficulty: v as Settings['word_rush_difficulty'] })),
      appliesTo: isWordRushGame,
    },
    word_rush_num_teams: {
      get: () => settings.word_rush_num_teams,
      set: (v) => setSettings((s) => ({ ...s, word_rush_num_teams: v as number })),
      appliesTo: isWordRushGame,
    },
    // I Call On (NPAT)
    npat_max_players: {
      get: () => npatMaxPlayers,
      set: (v) => setNpatMaxPlayers(v as number),
      appliesTo: isICallOnGame,
    },
    npat_game_duration: {
      get: () => npatGameDuration,
      set: (v) => setNpatGameDuration(v as number),
      appliesTo: isICallOnGame,
    },
    npat_marking_timer: {
      get: () => npatMarkingTimer,
      set: (v) => setNpatMarkingTimer(v as number),
      appliesTo: isICallOnGame,
    },
    // Sudoku
    sudoku_max_players: {
      get: () => sudokuMaxPlayers,
      set: (v) => setSudokuMaxPlayers(v as number),
      appliesTo: isSudokuGame,
    },
    sudoku_game_duration: {
      get: () => sudokuGameDuration,
      set: (v) => setSudokuGameDuration(v as number),
      appliesTo: isSudokuGame,
    },
    // Word Hunt
    word_hunt_max_players: {
      get: () => wordHuntMaxPlayers,
      set: (v) => setWordHuntMaxPlayers(v as number),
      appliesTo: isWordHuntGame,
    },
    word_hunt_timer: {
      get: () => wordHuntTimer,
      set: (v) => setWordHuntTimer(v as number),
      appliesTo: isWordHuntGame,
    },
    // Mafia / Werewolf
    mafia_max_players: {
      get: () => settings.max_players,
      set: (v) => setSettings((s) => ({ ...s, max_players: v as number })),
      appliesTo: isMafiaGame,
    },
    mafia_advanced_mode: {
      get: () => settings.mafia_advanced_mode,
      set: (v) => setSettings((s) => ({ ...s, mafia_advanced_mode: v as boolean })),
      appliesTo: isMafiaGame,
    },
    mafia_anonymous_votes: {
      get: () => settings.mafia_anonymous_votes,
      set: (v) => setSettings((s) => ({ ...s, mafia_anonymous_votes: v as boolean })),
      appliesTo: isMafiaGame,
    },
    mafia_day_seconds: {
      get: () => settings.mafia_day_seconds,
      set: (v) => setSettings((s) => ({ ...s, mafia_day_seconds: v as number })),
      appliesTo: isMafiaGame,
    },
    mafia_voting_seconds: {
      get: () => settings.mafia_voting_seconds,
      set: (v) => setSettings((s) => ({ ...s, mafia_voting_seconds: v as number })),
      appliesTo: isMafiaGame,
    },
    // Matching Pairs
    matching_pairs_max_players: {
      get: () => settings.max_players,
      set: (v) => setSettings((s) => ({ ...s, max_players: v as number })),
      appliesTo: isMatchingPairsGame,
    },
    matching_pairs_grid_size: {
      get: () => settings.game_duration_seconds,
      set: (v) => setSettings((s) => ({ ...s, game_duration_seconds: v as number })),
      appliesTo: isMatchingPairsGame,
    },
    // Word Search
    word_search_max_players: {
      get: () => wordSearchMaxPlayers,
      set: (v) => setWordSearchMaxPlayers(v as number),
      appliesTo: isWordSearchGame,
    },
    word_search_game_duration: {
      get: () => wordSearchGameDuration,
      set: (v) => setWordSearchGameDuration(v as number),
      appliesTo: isWordSearchGame,
    },
    word_search_theme: {
      get: () => wordSearchTheme,
      set: (v) => setWordSearchTheme(v as string),
      appliesTo: isWordSearchGame,
    },
    word_search_difficulty: {
      get: () => wordSearchDifficulty,
      set: (v) => setWordSearchDifficulty(v as WordSearchDifficulty),
      appliesTo: isWordSearchGame,
    },
    // Word Scramble
    word_scramble_max_players: {
      get: () => wordScrambleMaxPlayers,
      set: (v) => setWordScrambleMaxPlayers(v as number),
      appliesTo: isWordScrambleGame,
    },
    word_scramble_game_duration: {
      get: () => wordScrambleGameDuration,
      set: (v) => setWordScrambleGameDuration(v as number),
      appliesTo: isWordScrambleGame,
    },
    word_scramble_theme: {
      get: () => wordScrambleTheme,
      set: (v) => setWordScrambleTheme(v as string),
      appliesTo: isWordScrambleGame,
    },
    word_scramble_difficulty: {
      get: () => wordScrambleDifficulty,
      set: (v) => setWordScrambleDifficulty(v as WordScrambleDifficulty),
      appliesTo: isWordScrambleGame,
    },
    // Crossword
    crossword_max_players: {
      get: () => crosswordMaxPlayers,
      set: (v) => setCrosswordMaxPlayers(v as number),
      appliesTo: isCrosswordGame,
    },
    crossword_game_duration: {
      get: () => crosswordGameDuration,
      set: (v) => setCrosswordGameDuration(v as number),
      appliesTo: isCrosswordGame,
    },
    crossword_theme: {
      get: () => crosswordTheme,
      set: (v) => setCrosswordTheme(v as string),
      appliesTo: isCrosswordGame,
    },
    crossword_difficulty: {
      get: () => crosswordDifficulty,
      set: (v) => setCrosswordDifficulty(v as CrosswordDifficulty),
      appliesTo: isCrosswordGame,
    },
    // Landmine
    landmine_mode: {
      get: () => landmineMode,
      set: (v) => setLandmineMode(v as typeof landmineMode),
      appliesTo: isLandmineGame,
    },
    landmine_mine_source: {
      get: () => landmineMineSource,
      set: (v) => setLandmineMineSource(v as typeof landmineMineSource),
      appliesTo: isLandmineGame,
    },
    landmine_mine_count: {
      get: () => landmineMineCount,
      set: (v) => setLandmineMineCount(v as number),
      appliesTo: isLandmineGame,
    },
    landmine_originality: {
      get: () => landmineOriginality,
      set: (v) => setLandmineOriginality(v as boolean),
      appliesTo: isLandmineGame,
    },
    landmine_review: {
      get: () => landmineReview,
      set: (v) => setLandmineReview(v as boolean),
      appliesTo: isLandmineGame,
    },
    landmine_review_seconds: {
      get: () => landmineReviewSeconds,
      set: (v) => setLandmineReviewSeconds(v as number),
      appliesTo: isLandmineGame,
    },
    landmine_category_timer: {
      get: () => landmineCategoryTimer,
      set: (v) => setLandmineCategoryTimer(v as number),
      appliesTo: isLandmineGame,
    },
    landmine_marking_timer: {
      get: () => landmineMarkingTimer,
      set: (v) => setLandmineMarkingTimer(v as number),
      appliesTo: isLandmineGame,
    },
    landmine_elim_seconds: {
      get: () => landmineElimSeconds,
      set: (v) => setLandmineElimSeconds(v as number),
      appliesTo: isLandmineGame,
    },
    // Anonymous Messages
    anonymous_max_players: {
      get: () => anonymousMaxPlayers,
      set: (v) => setAnonymousMaxPlayers(v as number),
      appliesTo: isAnonymousMessagesGame,
    },
    // Elimination (trivia, i_call_on, two_truths)
    elimination_enabled: {
      get: () => eliminationEnabled,
      set: (v) => setEliminationEnabled(v as boolean),
      appliesTo: eliminationApplies,
    },
    elimination_mode: {
      get: () => eliminationMode,
      set: (v) => setEliminationMode(v as typeof eliminationMode),
      appliesTo: eliminationApplies,
    },
    elimination_rule: {
      get: () => eliminationRule,
      set: (v) => setEliminationRule(v as typeof eliminationRule),
      appliesTo: eliminationApplies,
    },
    elimination_eliminate_count: {
      get: () => eliminateCount,
      set: (v) => setEliminateCount(v as number),
      appliesTo: eliminationApplies,
    },
    elimination_score_threshold: {
      get: () => scoreThreshold,
      set: (v) => setScoreThreshold(v as number),
      appliesTo: eliminationApplies,
    },
    elimination_starting_lives: {
      get: () => startingLives,
      set: (v) => setStartingLives(v as number),
      appliesTo: eliminationApplies,
    },
    // Uno
    uno_max_players: { get: () => unoMaxPlayers, set: (v) => setUnoMaxPlayers(v as number), appliesTo: isUnoGame },
    uno_game_duration: {
      get: () => unoGameDuration,
      set: (v) => setUnoGameDuration(v as number),
      appliesTo: isUnoGame,
    },
    uno_wd4_challenge: {
      get: () => unoWd4Challenge,
      set: (v) => setUnoWd4Challenge(v as boolean),
      appliesTo: isUnoGame,
    },
    uno_uno_penalty: { get: () => unoUnoPenalty, set: (v) => setUnoUnoPenalty(v as number), appliesTo: isUnoGame },
    uno_zero_seven: { get: () => unoZeroSeven, set: (v) => setUnoZeroSeven(v as boolean), appliesTo: isUnoGame },
    uno_stacking: { get: () => unoStacking, set: (v) => setUnoStacking(v as boolean), appliesTo: isUnoGame },
    uno_jump_in: { get: () => unoJumpIn, set: (v) => setUnoJumpIn(v as boolean), appliesTo: isUnoGame },
    uno_multi_play_mode: {
      get: () => unoMultiPlayMode,
      set: (v) => setUnoMultiPlayMode(v as typeof unoMultiPlayMode),
      appliesTo: isUnoGame,
    },
    uno_team_mode: { get: () => unoTeamMode, set: (v) => setUnoTeamMode(v as boolean), appliesTo: isUnoGame },
    uno_mode: {
      get: () => unoMode,
      set: (v) => setUnoMode(v as 'classic' | 'no_mercy'),
      appliesTo: isUnoGame,
    },
    uno_no_mercy_win: {
      get: () => unoNoMercyWin,
      set: (v) => setUnoNoMercyWin(v as 'first_out' | 'last_standing'),
      appliesTo: isUnoGame,
    },
    uno_series_scoring: {
      get: () => unoSeriesScoring,
      set: (v) => setUnoSeriesScoring(v as boolean),
      appliesTo: isUnoGame,
    },
    uno_series_target: {
      get: () => unoSeriesTarget,
      set: (v) => setUnoSeriesTarget(v as number),
      appliesTo: isUnoGame,
    },
    // Monopoly
    monopoly_max_players: {
      get: () => monopolyMaxPlayers,
      set: (v) => setMonopolyMaxPlayers(v as number),
      appliesTo: isMonopolyGame,
    },
    monopoly_game_duration: {
      get: () => monopolyGameDuration,
      set: (v) => setMonopolyGameDuration(v as number),
      appliesTo: isMonopolyGame,
    },
    monopoly_board_size: {
      get: () => monopolyBoardSize,
      set: (value) => setMonopolyBoardSize(value === 48 ? 48 : 40),
      appliesTo: isMonopolyGame,
    },
    // Whot
    whot_max_players: { get: () => whotMaxPlayers, set: (v) => setWhotMaxPlayers(v as number), appliesTo: isWhotGame },
    whot_game_duration: {
      get: () => whotGameDuration,
      set: (v) => setWhotGameDuration(v as number),
      appliesTo: isWhotGame,
    },
    whot_pick3_enabled: {
      get: () => whotPick3Enabled,
      set: (v) => setWhotPick3Enabled(v as boolean),
      appliesTo: isWhotGame,
    },
    whot_pick2_stacking: {
      get: () => whotPick2Stacking,
      set: (v) => setWhotPick2Stacking(v as boolean),
      appliesTo: isWhotGame,
    },
    whot_cards_enabled: {
      get: () => whotCardsEnabled,
      set: (v) => setWhotCardsEnabled(v as boolean),
      appliesTo: isWhotGame,
    },
    whot_number_calls_enabled: {
      get: () => whotNumberCallsEnabled,
      set: (v) => setWhotNumberCallsEnabled(v as boolean),
      appliesTo: isWhotGame,
    },
    // Crazy Eights
    crazy8_max_players: {
      get: () => crazy8MaxPlayers,
      set: (v) => setCrazy8MaxPlayers(v as number),
      appliesTo: isCrazyEightsGame,
    },
    crazy8_game_duration: {
      get: () => crazy8GameDuration,
      set: (v) => setCrazy8GameDuration(v as number),
      appliesTo: isCrazyEightsGame,
    },
    crazy8_action_cards: {
      get: () => crazy8ActionCards,
      set: (v) => setCrazy8ActionCards(v as boolean),
      appliesTo: isCrazyEightsGame,
    },
    crazy8_jokers: {
      get: () => crazy8Jokers,
      set: (v) => setCrazy8Jokers(v as boolean),
      appliesTo: isCrazyEightsGame,
    },
    crazy8_pick2_stacking: {
      get: () => crazy8Pick2Stacking,
      set: (v) => setCrazy8Pick2Stacking(v as boolean),
      appliesTo: isCrazyEightsGame,
    },
    // Ludo
    ludo_max_players: { get: () => ludoMaxPlayers, set: (v) => setLudoMaxPlayers(v as number), appliesTo: isLudoGame },
    ludo_variant: { get: () => ludoVariant, set: (v) => setLudoVariant(v as LudoVariant), appliesTo: isLudoGame },
    // Snake & Ladder
    snake_ladder_max_players: {
      get: () => snakeLadderMaxPlayers,
      set: (v) => setSnakeLadderMaxPlayers(v as number),
      appliesTo: isSnakeAndLadderGame,
    },
    // Chess
    chess_board_theme: {
      get: () => chessBoardTheme,
      set: (v) => setChessBoardTheme(v as string),
      appliesTo: isChessGame,
    },
    chess_piece_set: { get: () => chessPieceSet, set: (v) => setChessPieceSet(v as string), appliesTo: isChessGame },
    // Ayo
    ayo_variant: { get: () => ayoVariant, set: (v) => setAyoVariant(v as AyoVariant), appliesTo: isAyoGame },
    // Mahjong
    mahjong_ruleset: {
      get: () => mahjongRuleset,
      set: (v) => setMahjongRuleset(v as MahjongRuleset),
      appliesTo: isMahjongGame,
    },
    // Scrabble
    scrabble_game_duration: {
      get: () => scrabbleGameDuration,
      set: (v) => setScrabbleGameDuration(v as number),
      appliesTo: isScrabbleGame,
    },
    scrabble_dictionary: {
      get: () => scrabbleDictionary,
      set: (v) => setScrabbleDictionary(v as ScrabbleDictionaryId),
      appliesTo: isScrabbleGame,
    },
    scrabble_clock_mode: {
      get: () => scrabbleClockMode,
      set: (v) => setScrabbleClockMode(v as ScrabbleClockMode),
      appliesTo: isScrabbleGame,
    },
    scrabble_clock_seconds: {
      get: () => scrabbleClockSeconds,
      set: (v) => setScrabbleClockSeconds(v as number),
      appliesTo: isScrabbleGame,
    },
    // Yahtzee
    yahtzee_max_players: {
      get: () => yahtzeeMaxPlayers,
      set: (v) => setYahtzeeMaxPlayers(v as number),
      appliesTo: isYahtzeeGame,
    },
    // Ping Pong
    ping_pong_points_to_win: {
      get: () => settings.ping_pong_points_to_win,
      set: (v) => setSettings((s) => ({ ...s, ping_pong_points_to_win: v as number })),
      appliesTo: isPingPongGame,
    },
    ping_pong_game_duration: {
      get: () => settings.game_duration_seconds,
      set: (v) => setSettings((s) => ({ ...s, game_duration_seconds: v as number })),
      appliesTo: isPingPongGame,
    },
  }
  const captureTemplateValues = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(TEMPLATE_FIELDS)) {
      if (field.appliesTo(settings.game_type)) out[key] = field.get()
    }
    return out
  }
  const applyTemplateValues = (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      const field = TEMPLATE_FIELDS[key]
      if (field && field.appliesTo(settings.game_type)) field.set(value)
    }
  }
  const refreshTemplateSlots = () => setTemplateSlots(getTemplates(settings.game_type))
  const handlePrefillTemplate = (tpl: GameTemplate) => {
    applyTemplateValues(tpl.values)
    toast.info(`Prefilled from "${tpl.name}" — review below, then Create when ready`)
  }
  // "Use & create" skips straight to creating a game, so it's confirmed first (see
  // useTemplateConfirm + UseTemplateConfirmModal below) rather than firing on the first tap.
  const runUseTemplate = (tpl: GameTemplate) => {
    // A blank game name would otherwise silently block creation (the server requires a
    // title) — default it to the template's name so this is a genuine one-tap action
    // instead of a no-op when the host hasn't typed anything yet.
    if (!settings.title.trim()) setSettings((s) => ({ ...s, title: tpl.name }))
    applyTemplateValues(tpl.values)
    setPendingAutoCreate(true)
  }
  const confirmUseTemplate = () => {
    if (useTemplateConfirm) runUseTemplate(useTemplateConfirm)
    setUseTemplateConfirm(null)
  }
  const openSaveTemplateModal = (presetSlot: number | null = null) => setTemplateModal({ open: true, presetSlot })
  const confirmSaveTemplate = (slot: number, name: string) => {
    saveTemplate(settings.game_type, slot, { name, savedAt: Date.now(), values: captureTemplateValues() })
    setTemplateModal({ open: false, presetSlot: null })
    refreshTemplateSlots()
    toast.success(`Saved as "${name}"`)
  }
  const handleDeleteTemplate = async (slot: number) => {
    const name = templateSlots?.[slot]?.name
    const ok = await confirm({
      title: name ? `Delete "${name}"?` : 'Delete this template?',
      message: "This can't be undone.",
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    deleteTemplate(settings.game_type, slot)
    refreshTemplateSlots()
    toast.info(name ? `Deleted "${name}"` : 'Template deleted')
  }

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
  const isLobbyQuestions = isBinaryLobby || isMlt || isTrivia || isPan || isQuiplash || isQuickDraw
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
        ? questionSource === 'platform'
          ? THIS_OR_THAT_QUESTION_COUNT
          : customQuestionCount
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
    (isTot &&
      questionSource !== 'platform' &&
      customQuestionCount >= settings.rounds_count &&
      customQuestionCount > 0) ||
    (questionSource === 'platform' && !isPan) ||
    (isPan && questionSource === 'platform') ||
    (isPan && questionSource === 'custom' && customQuestionCount >= PAN_MIN_POOL && customQuestionCount > 0) ||
    (isLobbyQuestions && !isTot && !isPan && customQuestionCount >= settings.rounds_count && customQuestionCount > 0) ||
    (questionSource === 'library' &&
      libraryPackQuestions.length >= settings.rounds_count &&
      libraryPackQuestions.length > 0) ||
    // Players-submit mode needs no content at create (players write questions in the lobby);
    // deck mode needs its source (Platform is always ready; Library/upload need >= 2).
    (isWst && wstQuoteSource !== 'deck') ||
    (isWstDeck && wstDeckContent.length >= WST_DECK_MIN_ENTRIES)
  const canCreateQuickLobby = !!settings.title.trim() && hasEnoughCustomQuestions

  const customSlotsValid =
    !isCustom || (customSlots && customSlots.slots.length >= 2 && customSlots.slots.every((s) => s.label.trim()))

  const isAnonymousRoom = isAnonymousMessagesGame(settings.game_type)
  const isSecretMessage = isSecretMessageGame(settings.game_type)
  // Host's create-screen seat choice, carried into the lobby via host-play intent.
  const [hostName, setHostName] = useState('')

  // Prefill the host's own name from the device record (the same one the join screen uses).
  // Seeded in an effect, not a useState initializer, because localStorage does not exist
  // during SSR and reading it there is a hydration mismatch. Subscribed because a signed-in
  // player's name is written by `useProfile` after its fetch resolves, which is later than
  // this component's first render. Only ever fills an EMPTY field — once the host types
  // something it is theirs, and a late-arriving profile must not overwrite it.
  const hostNameTouchedRef = useRef(false)
  useEffect(() => {
    const seed = () => {
      if (hostNameTouchedRef.current) return
      const remembered = getRememberedName()
      if (remembered) setHostName((current) => (current.trim() ? current : remembered))
    }
    seed()
    return subscribeLocalIdentity(seed)
  }, [])
  const [hostWillPlay, setHostWillPlay] = useState(true)
  // Games whose host panel supports the "Host only / Host + play" seat toggle.
  // Excludes the poll family (routed through PollHostView, own join flow) and the
  // host-only message-board games. For these, the host's create-screen name + role are
  // carried into the lobby via host-play intent.
  const hostPlaySupported =
    !isBinaryLobby && !isMlt && !isPan && !isHotSeatGame && !isPeoplePoll && !isAnonymousRoom && !isSecretMessage
  const isBingo = isBingoGame(settings.game_type)
  const isCodewords = isCodewordsGame(settings.game_type)
  // Content games (CSV upload / library packs) can carry a player-facing "category" label
  // so joiners know what the pack is about before they commit (e.g. "Maths"). For library
  // packs it's auto-filled from the pack name; for a CSV upload we ask the host directly,
  // right under the upload — hence gated on the custom source. Reused across game blocks.
  const showsContentLabel =
    isLobbyQuestions ||
    isCrossword ||
    isWordSearch ||
    isWordScramble ||
    isWordGrouping ||
    isCodewords ||
    isDescribeIt ||
    isWst
  const categoryUploadField =
    showsContentLabel && questionSource === 'custom' ? (
      <Field label="Category">
        <input
          value={settings.content_label}
          onChange={(e) => {
            contentLabelTouchedRef.current = true
            setSettings({ ...settings, content_label: e.target.value })
          }}
          placeholder="Maths, Countries, Mixed"
          maxLength={40}
          className="input-field"
        />
        <p className="text-faint text-xs mt-2">What is this CSV theme? Shown to players before they join.</p>
      </Field>
    ) : null
  // Mirror the AI "Theme (optional)" into the player-facing Category so the host doesn't fill both —
  // until they hand-edit the Category, after which we stop overriding it.
  const handleAiThemeChange = (theme: string) => {
    if (!contentLabelTouchedRef.current) setSettings((s) => ({ ...s, content_label: theme }))
  }
  const isMessageBoard = isAnonymousRoom || isSecretMessage
  const isQuickLobby =
    isWst ||
    isMessageBoard ||
    isBingo ||
    isCodewords ||
    isTwoTruths ||
    isMonopoly ||
    isYahtzee ||
    isWhot ||
    isCrazy8 ||
    isUno ||
    isLudo ||
    isSnakeLadder ||
    isTicTacToe ||
    isPingPong ||
    isChess ||
    isScrabble ||
    isDescribeIt ||
    isQuickDraw ||
    isWordRush ||
    isNpat ||
    isLandmine ||
    isSudoku ||
    isCrossword ||
    isWordSearch ||
    isWordScramble ||
    isWordGrouping ||
    isWordHunt ||
    isMatchingPairs
  const isTriviaQuickCreate = isTrivia
  const needsParticipantStep =
    !isQuickLobby && !isTriviaQuickCreate && !isBinaryLobby && !(isMlt && isJoinersMode) && !isJoinersMode
  const wizardSteps = needsParticipantStep ? ['Setup', 'People'] : ['Setup']
  const stepIndex = step === 'participants' ? 2 : 1

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
    setQuestionSource('platform')
    setPlayerQuestionsEnabled(true)
    setPlayerQuestionsOrder('players_first')
    setCustomWyrQuestions([])
    setCustomMltQuestions([])
    setCustomTriviaQuestions([])
    setCustomCrosswordEntries([])
    setCustomWordSearchWords([])
    setCustomWordScrambleWords([])
    setPuzzleUploadError(null)
    setPuzzleUploadSummary(null)
    setDescribeItWords('')
    setQuickDrawWords('')
    setSelectedPackId(null)
    setLibraryPackQuestions([])
    setTriviaCategory('general')
    setQuestionsUploadError(null)
    if (isICallOnGame(type)) {
      setNpatGameDuration(NPAT_DEFAULT_GAME_DURATION)
      setNpatMarkingTimer(NPAT_DEFAULT_MARKING_TIMER)
    }
    if (isLandmineGame(type)) {
      // Reset Landmine's own timers so switching from a game with different options can't leave
      // them on a value outside Landmine's allowed set.
      setLandmineCategoryTimer(LANDMINE_DEFAULT_CATEGORY_TIMER)
      setLandmineMarkingTimer(LANDMINE_DEFAULT_MARKING_TIMER)
    }
    setSettings({
      ...settings,
      game_type: type,
      // Reset the shared rounds_count + writing timer to Landmine-valid defaults (they carry over
      // from the previous game type and may not be in Landmine's option sets).
      ...(isLandmineGame(type)
        ? {
            participant_mode: 'joiners' as const,
            rounds_count: LANDMINE_DEFAULT_ROUND_COUNT,
            timer_seconds: LANDMINE_DEFAULT_WRITING_TIMER,
          }
        : {}),
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
      ...(isQuiplashGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: QUIPLASH_DEFAULT_ROUNDS,
            timer_seconds: QUIPLASH_DEFAULT_SUBMIT_TIMER,
          }
        : {}),
      ...(isQuickDrawGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: QUICK_DRAW_DEFAULT_ROUNDS,
            timer_seconds: QUICK_DRAW_DEFAULT_DRAW_TIMER,
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
            timer_seconds: 30,
          }
        : {}),
      ...(isWhotGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 30,
          }
        : {}),
      ...(isCrazyEightsGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 30,
          }
        : {}),
      ...(isUnoGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 30,
          }
        : {}),
      ...(isLudoGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 30,
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
      ...(isCheckersGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            // Cumulative per-player clock, same as Chess. Default 10 minutes each.
            timer_seconds: 600,
          }
        : {}),
      ...(isAyoGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 300, // 5 min per-player time bank
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
      ...(isCrosswordGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
          }
        : {}),
      ...(isWordSearchGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
          }
        : {}),
      ...(isMatchingPairsGame(type)
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
      ...(isMahjongGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 30,
          }
        : {}),
      ...(isScrabbleGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 120, // 2 min per turn
          }
        : {}),
      ...(isTicTacToeGame(type)
        ? {
            participant_mode: 'joiners' as const,
            anonymous: true,
            rounds_count: 1,
            timer_seconds: 30,
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
      ...(type !== 'monopoly' &&
      (settings.theme === 'pirate' || settings.theme === 'arctic' || settings.theme === 'naija')
        ? { theme: 'default' as const }
        : {}),
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

  // Who Said This deck upload (quote + A/B/C/D options + correct) — trivia-style CSV/xlsx.
  const handleWstDeckUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setWstDeckError(null)
    try {
      const name = file.name.toLowerCase()
      const result =
        name.endsWith('.xlsx') || name.endsWith('.xls')
          ? await parseExcelWstDeckImport(await file.arrayBuffer())
          : parseWstDeckImport(await file.text())
      if (result.questions.length < WST_DECK_MIN_ENTRIES) {
        setWstDeck([])
        setWstDeckError(
          `Need at least ${WST_DECK_MIN_ENTRIES} questions — each row is a quote, its options, and which is correct.`
        )
        return
      }
      setWstDeck(result.questions)
      const extra = formatEntryImportSummary(result)
      if (extra) setWstDeckError(extra)
    } catch {
      setWstDeckError('Could not read that file. Use a CSV/Excel with quote, option_a…option_d, correct.')
    }
  }

  const createGame = async () => {
    if (loading) return
    if (isQuickLobby) {
      if (!settings.title.trim()) return
      if (isWstDeck && wstDeckContent.length < WST_DECK_MIN_ENTRIES) return
      if (
        isCodewords &&
        (questionSource === 'custom' || questionSource === 'library') &&
        customCodewordsWords.length < CODEWORDS_MIN_CUSTOM_POOL
      )
        return
      // Custom/library crossword + word search need at least 4 entries to pack a grid.
      if (
        isCrossword &&
        (questionSource === 'custom' || questionSource === 'library') &&
        customCrosswordEntries.length < 4
      )
        return
      if (
        isWordSearch &&
        (questionSource === 'custom' || questionSource === 'library') &&
        customWordSearchWords.length < 4
      )
        return
      if (
        isWordScramble &&
        (questionSource === 'custom' || questionSource === 'library') &&
        customWordScrambleWords.length < 4
      )
        return
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
          rounds_count: isWst
            ? isWstDeck
              ? Math.max(wstDeckContent.length, 2)
              : Math.max(participants.length, 2)
            : settings.rounds_count,
          question_source: isWst
            ? isWstDeck && wstDeckContent.length >= WST_DECK_MIN_ENTRIES
              ? 'custom'
              : 'platform'
            : isCrossword
              ? (questionSource === 'custom' || questionSource === 'library') && customCrosswordEntries.length >= 4
                ? 'custom'
                : 'platform'
              : isWordSearch
                ? (questionSource === 'custom' || questionSource === 'library') && customWordSearchWords.length >= 4
                  ? 'custom'
                  : 'platform'
                : isWordScramble
                  ? (questionSource === 'custom' || questionSource === 'library') && customWordScrambleWords.length >= 4
                    ? 'custom'
                    : 'platform'
                  : isWordGrouping
                    ? // Symmetric with the payload gate below: only mark the game as custom
                      // when the pack meets the same 4-puzzle floor.
                      questionSource === 'library' && libraryPackQuestions.length >= 4
                      ? 'custom'
                      : 'platform'
                    : isCodewords
                      ? questionSource === 'library'
                        ? 'custom'
                        : questionSource
                      : isDescribeIt
                        ? (questionSource === 'custom' || questionSource === 'library') &&
                          parseDescribeItWords(describeItWords).length > 0
                          ? 'custom'
                          : 'platform'
                        : isQuickDraw
                          ? (questionSource === 'custom' || questionSource === 'library') &&
                            parseDescribeItWords(quickDrawWords).length > 0
                            ? 'custom'
                            : 'platform'
                          : isLobbyQuestions
                            ? questionSource === 'library'
                              ? 'custom'
                              : questionSource
                            : 'platform',
          custom_questions: isWst
            ? isWstDeck && wstDeckContent.length >= WST_DECK_MIN_ENTRIES
              ? wstDeckContent
              : null
            : isCrossword
              ? (questionSource === 'custom' || questionSource === 'library') && customCrosswordEntries.length >= 4
                ? customCrosswordEntries
                : null
              : isWordSearch
                ? (questionSource === 'custom' || questionSource === 'library') && customWordSearchWords.length >= 4
                  ? customWordSearchWords
                  : null
                : isWordScramble
                  ? (questionSource === 'custom' || questionSource === 'library') && customWordScrambleWords.length >= 4
                    ? customWordScrambleWords
                    : null
                  : isWordGrouping
                    ? // Match the same 4-puzzle floor crossword/word-search/word-scramble use above
                      // (and the lobby picker's guard in WordGroupingLobbySettings). Accepting 1–3
                      // here would let the create route persist a pool the lobby then refuses.
                      questionSource === 'library' && libraryPackQuestions.length >= 4
                      ? libraryPackQuestions
                      : null
                    : isCodewords
                      ? questionSource === 'custom' || questionSource === 'library'
                        ? customCodewordsWords
                        : null
                      : isDescribeIt
                        ? (questionSource === 'custom' || questionSource === 'library') &&
                          parseDescribeItWords(describeItWords).length > 0
                          ? parseDescribeItWords(describeItWords)
                          : null
                        : isQuickDraw
                          ? (questionSource === 'custom' || questionSource === 'library') &&
                            parseDescribeItWords(quickDrawWords).length > 0
                            ? parseDescribeItWords(quickDrawWords)
                            : null
                          : isLobbyQuestions && (questionSource === 'custom' || questionSource === 'library')
                            ? isWyr || isTot
                              ? customWyrQuestions
                              : isTrivia
                                ? customTriviaQuestions
                                : isQuiplash
                                  ? customMltQuestions
                                  : customMltQuestions
                            : null,
          trivia_category: isTrivia ? triviaCategory : undefined,
          describe_it_mode: isDescribeIt ? settings.describe_it_mode : undefined,
          landmine_mode: isLandmine ? landmineMode : undefined,
          landmine_mine_source: isLandmine ? landmineMineSource : undefined,
          landmine_elim_seconds: isLandmine ? landmineElimSeconds : undefined,
          landmine_mine_count: isLandmine ? landmineMineCount : undefined,
          landmine_originality_bonus: isLandmine ? landmineOriginality : undefined,
          landmine_review: isLandmine ? landmineReview : undefined,
          landmine_review_seconds: isLandmine ? landmineReviewSeconds : undefined,
          checkers_nigeria_street_rules: isCheckersNigeria ? checkersNigeriaStreetRules : undefined,
          quick_draw_variant: isQuickDraw ? settings.quick_draw_variant : undefined,
          quick_draw_play_mode:
            isQuickDraw && settings.quick_draw_variant === 'guess' ? settings.quick_draw_play_mode : undefined,
          quick_draw_num_teams:
            isQuickDraw && settings.quick_draw_variant === 'guess' && settings.quick_draw_play_mode !== 'individual'
              ? settings.quick_draw_num_teams
              : undefined,
          word_rush_mode: isWordRush ? settings.word_rush_mode : undefined,
          word_rush_prompt_mode: isWordRush ? settings.word_rush_prompt_mode : undefined,
          word_rush_difficulty: isWordRush ? settings.word_rush_difficulty : undefined,
          word_rush_num_teams: isWordRush ? settings.word_rush_num_teams : undefined,
          participants: isJoinersMode ? [] : participants,
          wst_quote_source: isWst ? wstQuoteSource : undefined,
          custom_slots: isCustom ? customSlots : null,
          gender_based: supportsGender ? settings.gender_based : undefined,
          player_questions_enabled: isPlayerSubmissions ? playerQuestionsEnabled : undefined,
          player_questions_order: isPlayerSubmissions ? playerQuestionsOrder : undefined,
          max_players: isAnonymousRoom
            ? anonymousMaxPlayers
            : isBingo
              ? bingoMaxPlayers
              : isCodewords
                ? codewordsMaxPlayers
                : isTrivia
                  ? triviaMaxPlayers
                  : isQuiplash
                    ? quiplashMaxPlayers
                    : isQuickDraw
                      ? quickDrawMaxPlayers
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
                                : isUno
                                  ? unoMaxPlayers
                                  : isLudo
                                    ? ludoMaxPlayers
                                    : isSnakeLadder
                                      ? snakeLadderMaxPlayers
                                      : isNpat
                                        ? npatMaxPlayers
                                        : isSudoku
                                          ? sudokuMaxPlayers
                                          : isCrossword
                                            ? crosswordMaxPlayers
                                            : isWordSearch
                                              ? wordSearchMaxPlayers
                                              : isWordScramble
                                                ? wordScrambleMaxPlayers
                                                : isWordGrouping
                                                  ? wordGroupingMaxPlayers
                                                  : isWordHunt
                                                    ? wordHuntMaxPlayers
                                                    : isWordRush
                                                      ? wordRushMaxPlayers
                                                      : isDescribeIt
                                                        ? describeItMaxPlayers
                                                        : isMatchingPairs
                                                          ? (settings.max_players ?? effectiveLimits.matching_pairs.max)
                                                          : undefined,
          monopoly_board_size: isMonopoly ? monopolyBoardSize : undefined,
          operative_timer_seconds: isCodewords
            ? codewordsOperativeTimer
            : isNpat
              ? npatMarkingTimer
              : isLandmine
                ? landmineMarkingTimer
                : isQuiplash
                  ? quiplashVoteTimer
                  : isQuickDraw
                    ? quickDrawTitleTimer
                    : undefined,
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
                : isUno
                  ? unoGameDuration
                  : isNpat
                    ? npatGameDuration
                    : isScrabble
                      ? scrabbleGameDuration
                      : isSudoku
                        ? sudokuGameDuration
                        : isCrossword
                          ? crosswordGameDuration
                          : isWordSearch
                            ? wordSearchGameDuration
                            : isWordScramble
                              ? wordScrambleGameDuration
                              : isWordGrouping
                                ? wordGroupingGameDuration
                                : isMatchingPairs
                                  ? (settings.game_duration_seconds ?? 0)
                                  : isQuickDraw
                                    ? quickDrawVoteTimer
                                    : isLandmine
                                      ? landmineCategoryTimer
                                      : undefined,
          whot_pick3_enabled: isWhot ? whotPick3Enabled : undefined,
          whot_pick2_stacking: isWhot ? whotPick2Stacking : undefined,
          whot_cards_enabled: isWhot ? whotCardsEnabled : undefined,
          whot_number_calls_enabled: isWhot ? whotNumberCallsEnabled : undefined,
          crazy8_action_cards: isCrazy8 ? crazy8ActionCards : undefined,
          crazy8_jokers: isCrazy8 ? crazy8Jokers : undefined,
          crazy8_pick2_stacking: isCrazy8 ? crazy8Pick2Stacking : undefined,
          uno_wd4_challenge: isUno ? unoWd4Challenge : undefined,
          uno_uno_penalty: isUno ? unoUnoPenalty : undefined,
          uno_zero_seven: isUno ? unoZeroSeven : undefined,
          uno_stacking: isUno ? unoStacking : undefined,
          uno_jump_in: isUno ? unoJumpIn : undefined,
          uno_multi_play_mode: isUno ? unoMultiPlayMode : undefined,
          uno_team_mode: isUno ? unoTeamMode : undefined,
          uno_mode: isUno ? unoMode : undefined,
          uno_no_mercy_win: isUno && unoMode === 'no_mercy' ? unoNoMercyWin : undefined,
          uno_series_scoring: isUno ? unoSeriesScoring : undefined,
          uno_series_target: isUno && unoSeriesScoring ? unoSeriesTarget : undefined,
          // Team-Up is strictly 2v2.
          ...(isUno && unoTeamMode ? { max_players: 4 } : {}),
          ludo_variant: isLudo ? ludoVariant : undefined,
          ayo_variant: isAyo ? ayoVariant : undefined,
          mahjong_ruleset: isMahjong ? mahjongRuleset : undefined,
          scrabble_dictionary_id: isScrabble ? scrabbleDictionary : undefined,
          scrabble_clock_mode: isScrabble ? scrabbleClockMode : undefined,
          scrabble_clock_seconds: isScrabble && scrabbleClockMode === 'chess' ? scrabbleClockSeconds : undefined,
          chess_board_theme: isChess ? chessBoardTheme : undefined,
          chess_piece_set: isChess ? chessPieceSet : undefined,
          // A `pt:<id>` value is an admin theme — send it as puzzle_theme_id (the server folds its
          // word pool + locked difficulty), not as the built-in theme column.
          crossword_theme: isCrossword
            ? puzzleThemeIdFromValue(crosswordTheme)
              ? undefined
              : crosswordTheme
            : undefined,
          crossword_difficulty: isCrossword ? crosswordDifficulty : undefined,
          word_search_theme: isWordSearch
            ? puzzleThemeIdFromValue(wordSearchTheme)
              ? undefined
              : wordSearchTheme
            : undefined,
          word_search_difficulty: isWordSearch ? wordSearchDifficulty : undefined,
          word_scramble_theme: isWordScramble
            ? puzzleThemeIdFromValue(wordScrambleTheme)
              ? undefined
              : wordScrambleTheme
            : undefined,
          word_scramble_difficulty: isWordScramble ? wordScrambleDifficulty : undefined,
          // Only an admin theme picked under Platform folds a pool. Switching to Library/Your own
          // leaves the prior `pt:<id>` in theme state; gate by source so a stale admin theme can't
          // override the custom pool or the (now editable) difficulty.
          puzzle_theme_id:
            questionSource === 'platform'
              ? (puzzleThemeIdFromValue(
                  isCrossword
                    ? crosswordTheme
                    : isWordSearch
                      ? wordSearchTheme
                      : isWordScramble
                        ? wordScrambleTheme
                        : ''
                ) ?? undefined)
              : undefined,
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
        // GA key event: a host successfully created a game (primary conversion).
        trackEvent(GA_EVENTS.createGame, { game_type: settings.game_type })
        // Mirror the host's chosen look into this device's personal preference so
        // the host sees exactly what they picked, rather than a leftover override
        // from a previous game. Done only once the game is actually created — not
        // on every swatch click while they're still deciding.
        if (isChess) {
          setDeviceBoardTheme(chessBoardTheme)
          setDevicePieceSet(chessPieceSet)
        }
        // Remember the host token on this device so the host lands straight in their
        // panel and can reopen it later without the saved link (same-device recovery).
        // The token also lives in the panel's share menu for hosting on another device.
        rememberHostToken(data.gameCode, data.hostToken)
        // Carry the host's create-screen choice into the lobby. A typed name under
        // "Host + play" means "seat me automatically" (the lobby auto-joins with it);
        // an empty name still lands in play mode but waits for a manual Join, and
        // "Host only" makes the host a spectator. Consumed once on the host panel.
        if (hostPlaySupported) {
          setHostPlayIntent(data.gameCode, {
            name: hostName.trim(),
            role: hostWillPlay ? 'play' : 'host',
          })
        }
        const roomParam = searchParams.get('room')
        const memberParam = searchParams.get('member')
        if (roomParam) {
          fetch(`/api/rooms/${roomParam}/games`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameCode: data.gameCode, memberCode: memberParam ?? '' }),
          }).catch(() => {})
        }
        // Skip the interstitial — go straight to the host panel with a clean URL. The token
        // is in storage (saved above), which the host page reads on load — same as tournaments.
        router.push(`/host/${data.gameCode}`)
      } else {
        toast.error(data.error || 'Failed to create game')
      }
    } finally {
      setLoading(false)
    }
  }

  // Fires once a template's applied values have committed to state (see
  // pendingAutoCreate above), then runs the normal create flow.
  useEffect(() => {
    if (!pendingAutoCreate) return
    setPendingAutoCreate(false)
    void createGame()
  }, [pendingAutoCreate]) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only re-fire on the flag

  if (step === 'settings') {
    return (
      <>
        <PageShell>
          {/* Home button with no arrow */}
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

            <Field label="Visibility">
              <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, isPublic: false })}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-semibold transition-colors ${
                    !settings.isPublic ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
                  }`}
                >
                  <Glyph icon={LockIcon} size={15} />
                  Private
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, isPublic: true })}
                  className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-semibold transition-colors ${
                    settings.isPublic ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
                  }`}
                >
                  <Glyph icon={GlobeIcon} size={15} />
                  Public
                </button>
              </div>
              <p className="mt-1.5 text-xs text-faint">
                {settings.isPublic
                  ? 'Anyone can find and join this game from Browse.'
                  : 'Only people with the code can join.'}
              </p>
            </Field>
          </div>

          {templatableGame(settings.game_type) && templateSlots && (
            <TemplateQuickStart
              slots={templateSlots}
              onUse={setUseTemplateConfirm}
              onPrefill={handlePrefillTemplate}
              onOverride={(slot) => openSaveTemplateModal(slot)}
              onDelete={handleDeleteTemplate}
            />
          )}
          <UseTemplateConfirmModal
            template={useTemplateConfirm}
            onCancel={() => setUseTemplateConfirm(null)}
            onConfirm={confirmUseTemplate}
          />

          {/* Theme */}
          <div className="glass-card p-5 space-y-3">
            <p className="label-caps">Theme{settings.game_type === 'monopoly' ? ' · Edition' : ''}</p>
            <div
              className={`grid ${settings.game_type === 'monopoly' ? 'grid-cols-2 max-w-sm sm:max-w-md' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'} gap-1.5 sm:gap-2`}
            >
              {(settings.game_type === 'monopoly'
                ? THEMES.filter((theme) => MONOPOLY_EDITIONS.some((e) => e.themeId === theme.id))
                : settings.game_type === 'ping_pong'
                  ? THEMES.filter((theme) => theme.id === 'default' || theme.id === 'grass_court')
                  : THEMES.filter(
                      (theme) =>
                        theme.id !== 'pirate' &&
                        theme.id !== 'arctic' &&
                        theme.id !== 'naija' &&
                        theme.id !== 'grass_court'
                    )
              ).map((theme) => {
                const monopolyEdition =
                  settings.game_type === 'monopoly' ? MONOPOLY_EDITIONS.find((e) => e.themeId === theme.id) : null
                const displayTheme = monopolyEdition
                  ? { ...theme, label: monopolyEdition.editionName, emoji: monopolyEdition.editionEmoji }
                  : settings.game_type === 'ping_pong' && theme.id === 'default'
                    ? {
                        ...theme,
                        label: 'Table Tennis',
                        emoji: '🏓',
                        icon: TableTennisBatIcon,
                        preview: { bg: '#064e3b', accent: '#f43f5e', text: '#ecfdf5' },
                      }
                    : theme
                return (
                  <ThemePreviewCard
                    key={theme.id}
                    theme={displayTheme}
                    selected={settings.theme === theme.id}
                    onClick={() => setSettings({ ...settings, theme: theme.id })}
                    onPreview={() => setPreviewTheme(displayTheme)}
                  />
                )
              })}
            </div>
          </div>

          {/* You — host seat choice, carried into the lobby via host-play intent */}
          {hostPlaySupported && (
            <div className="glass-card p-5 space-y-3">
              <p className="label-caps">You</p>
              <SegmentedControl
                value={hostWillPlay ? 'play' : 'host'}
                onChange={(v) => setHostWillPlay(v === 'play')}
                options={[
                  { label: 'Host + play', value: 'play' },
                  { label: 'Host only', value: 'host' },
                ]}
              />
              {hostWillPlay && (
                <div className="pt-1">
                  <input
                    type="text"
                    value={hostName}
                    onChange={(e) => {
                      hostNameTouchedRef.current = true
                      setHostName(e.target.value)
                    }}
                    placeholder="Your name (optional)"
                    maxLength={24}
                    className="input-field w-full"
                  />
                  <p className="text-faint text-xs mt-1.5 leading-relaxed">
                    Enter your name to be seated automatically. Leave it blank to add yourself from the lobby.
                  </p>
                </div>
              )}
            </div>
          )}

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
                  <CustomSelect
                    value={anonymousMaxPlayers}
                    onChange={setAnonymousMaxPlayers}
                    options={playerCountOptions(
                      effectiveLimits.anonymous_messages.min,
                      effectiveLimits.anonymous_messages.max
                    ).map((n) => ({ value: n, label: `${n} players` }))}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} />
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
                  <CustomSelect
                    value={bingoMaxPlayers}
                    onChange={setBingoMaxPlayers}
                    options={playerCountOptions(effectiveLimits.bingo.min, effectiveLimits.bingo.max).map((n) => ({
                      value: n,
                      label: `${n} players`,
                    }))}
                  />
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
                    <CustomSelect
                      value={bingoCallInterval}
                      onChange={setBingoCallInterval}
                      options={BINGO_CALL_INTERVAL_OPTIONS.map((s) => ({ value: s, label: `${s} seconds` }))}
                    />
                  </Field>
                )}
                {showViewerToggle && <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} />}
                <p className="text-faint text-sm leading-relaxed">
                  Players join with their name and get a unique 5×5 card. Called squares turn blue on their card; they
                  tap blue to mark green, then tap BINGO when they complete a line.
                  {bingoCallMode === 'auto'
                    ? ' Numbers are called automatically — no tapping required from the host.'
                    : ' You call numbers B1–O75 from the host panel.'}
                </p>
              </SettingsGroup>
            ) : isQuiplash ? (
              <SettingsGroup title="Punchline">
                <Field label={`Max players (${effectiveLimits.quiplash.min}–${effectiveLimits.quiplash.max})`}>
                  <CustomSelect
                    value={quiplashMaxPlayers}
                    onChange={setQuiplashMaxPlayers}
                    options={playerCountOptions(effectiveLimits.quiplash.min, effectiveLimits.quiplash.max).map(
                      (n) => ({
                        value: n,
                        label: `${n} players`,
                      })
                    )}
                  />
                </Field>
                <Field label="Rounds">
                  <ChipGrid>
                    {Array.from(
                      { length: QUIPLASH_MAX_ROUNDS - QUIPLASH_MIN_ROUNDS + 1 },
                      (_, i) => i + QUIPLASH_MIN_ROUNDS
                    ).map((n) => (
                      <Chip
                        key={n}
                        active={settings.rounds_count === n}
                        onClick={() => setSettings((prev) => ({ ...prev, rounds_count: clampQuiplashRounds(n) }))}
                        className="!px-0 w-full"
                      >
                        {n}
                      </Chip>
                    ))}
                  </ChipGrid>
                </Field>
                <Field label="Answer timer">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={QUIPLASH_SUBMIT_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s} seconds` }))}
                  />
                </Field>
                <Field label="Vote timer (per battle)">
                  <CustomSelect
                    value={quiplashVoteTimer}
                    onChange={setQuiplashVoteTimer}
                    options={QUIPLASH_VOTE_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s} seconds` }))}
                  />
                </Field>
                {showViewerToggle && <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} />}
                <p className="text-faint text-sm leading-relaxed">
                  Everyone writes a funny answer to the same prompt. Answers battle head-to-head and the group votes for
                  the funniest — you earn one point per vote.
                </p>
              </SettingsGroup>
            ) : isQuickDraw ? (
              <SettingsGroup title="Quick Draw">
                <Field label="Game style">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, quick_draw_variant: 'lie' })}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        settings.quick_draw_variant !== 'guess'
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Lie</span>
                      <span className="text-faint text-xs sm:text-sm">
                        Drawful-style — fool everyone with fake titles
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, quick_draw_variant: 'guess' })}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        settings.quick_draw_variant === 'guess'
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Guess</span>
                      <span className="text-faint text-xs sm:text-sm">
                        Draw a word — teammates guess (or solo free-for-all)
                      </span>
                    </button>
                  </div>
                </Field>
                {settings.quick_draw_variant === 'guess' && (
                  <>
                    <Field label="Mode">
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setSettings({ ...settings, quick_draw_play_mode: 'team' })}
                          className={[
                            'rounded-2xl border-2 px-4 py-4 text-left',
                            settings.quick_draw_play_mode !== 'individual'
                              ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                              : 'border-[var(--border-strong)] text-muted',
                          ].join(' ')}
                        >
                          <span className="font-bold block text-base">Teams</span>
                          <span className="text-faint text-xs sm:text-sm">Teams race to guess drawings</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettings({ ...settings, quick_draw_play_mode: 'individual' })}
                          className={[
                            'rounded-2xl border-2 px-4 py-4 text-left',
                            settings.quick_draw_play_mode === 'individual'
                              ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                              : 'border-[var(--border-strong)] text-muted',
                          ].join(' ')}
                        >
                          <span className="font-bold block text-base">Individual</span>
                          <span className="text-faint text-xs sm:text-sm">Everyone draws — fastest guess wins</span>
                        </button>
                      </div>
                    </Field>
                    {settings.quick_draw_play_mode !== 'individual' && (
                      <Field label="Teams">
                        <CustomSelect
                          value={settings.quick_draw_num_teams}
                          onChange={(val) => setSettings({ ...settings, quick_draw_num_teams: val })}
                          options={QUICK_DRAW_GUESS_TEAM_OPTIONS.map((n) => ({ value: n, label: `${n} teams` }))}
                        />
                      </Field>
                    )}
                  </>
                )}
                <Field label={`Max players (${effectiveLimits.quick_draw.min}–${effectiveLimits.quick_draw.max})`}>
                  <CustomSelect
                    value={quickDrawMaxPlayers}
                    onChange={setQuickDrawMaxPlayers}
                    options={playerCountOptions(effectiveLimits.quick_draw.min, effectiveLimits.quick_draw.max).map(
                      (n) => ({
                        value: n,
                        label: `${n} players`,
                      })
                    )}
                  />
                </Field>
                <Field label="Rounds">
                  <ChipGrid>
                    {Array.from(
                      { length: QUICK_DRAW_MAX_ROUNDS - QUICK_DRAW_MIN_ROUNDS + 1 },
                      (_, i) => i + QUICK_DRAW_MIN_ROUNDS
                    ).map((n) => (
                      <Chip
                        key={n}
                        active={settings.rounds_count === n}
                        onClick={() => setSettings((prev) => ({ ...prev, rounds_count: clampQuickDrawRounds(n) }))}
                        className="!px-0 w-full"
                      >
                        {n}
                      </Chip>
                    ))}
                  </ChipGrid>
                </Field>
                <Field label={settings.quick_draw_variant === 'guess' ? 'Turn timer' : 'Draw timer'}>
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={QUICK_DRAW_DRAW_TIMER_OPTIONS.map((s) => ({
                      value: s,
                      label: settings.quick_draw_variant === 'guess' ? formatQuickDrawTurnTimer(s) : `${s} seconds`,
                    }))}
                  />
                </Field>
                {settings.quick_draw_variant !== 'guess' && (
                  <>
                    <Field label="Title timer">
                      <CustomSelect
                        value={quickDrawTitleTimer}
                        onChange={setQuickDrawTitleTimer}
                        options={QUICK_DRAW_TITLE_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s} seconds` }))}
                      />
                    </Field>
                    <Field label="Vote timer">
                      <CustomSelect
                        value={quickDrawVoteTimer}
                        onChange={setQuickDrawVoteTimer}
                        options={QUICK_DRAW_VOTE_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s} seconds` }))}
                      />
                    </Field>
                  </>
                )}
                <Field label={settings.quick_draw_variant === 'guess' ? 'Words' : 'Prompts'}>
                  <SegmentedControl
                    value={questionSource}
                    onChange={(v) => {
                      setQuestionSource(v as QuestionSource)
                      setSelectedPackId(null)
                      setLibraryPackQuestions([])
                      if (v !== 'custom') setQuickDrawWords('')
                    }}
                    options={questionSourceOptions('quick_draw')}
                  />
                </Field>

                {questionSource === 'custom' && questionCustomHint && <CustomContentAiTip hint={questionCustomHint} />}

                {questionSource === 'library' && (
                  <div className="space-y-2 pt-1">
                    <LibraryPackPicker
                      loading={libraryPacksLoading}
                      packs={libraryPacks}
                      search={libraryPackSearch}
                      onSearchChange={setLibraryPackSearch}
                      selectedPackId={selectedPackId}
                      onSelect={selectLibraryPack}
                      noun={settings.quick_draw_variant === 'guess' ? 'words' : 'prompts'}
                    />
                    {parseDescribeItWords(quickDrawWords).length > 0 && (
                      <p className="text-faint text-xs text-center">
                        Loaded {parseDescribeItWords(quickDrawWords).length}{' '}
                        {settings.quick_draw_variant === 'guess' ? 'words' : 'prompts'} from this pack.
                      </p>
                    )}
                    <p className="text-faint text-[11px] text-center">
                      Includes Quick Draw and Text Charades word packs.
                    </p>
                  </div>
                )}

                {questionSource === 'custom' && (
                  <div className="space-y-4 pt-1">
                    <SegmentedControl
                      value={questionTab}
                      onChange={setQuestionTab}
                      options={[
                        { value: 'upload', label: 'Upload file', hint: questionUploadHint('quick_draw') },
                        {
                          value: 'manual',
                          label: 'Add manually',
                          hint:
                            settings.quick_draw_variant === 'guess'
                              ? 'Type or paste one word per line.'
                              : 'Type or paste one drawing prompt per line.',
                        },
                        {
                          value: 'ai',
                          label: 'Generate with AI',
                          hint: 'Give a theme, get a ready-made set in seconds.',
                        },
                      ]}
                    />

                    {questionTab === 'ai' ? (
                      <AiQuestionsGenerator
                        gameType="describe_it"
                        noun={settings.quick_draw_variant === 'guess' ? 'words' : 'prompts'}
                        defaultCount={30}
                        onThemeChange={handleAiThemeChange}
                        onGenerated={(questions) => {
                          setQuickDrawUploadError(null)
                          setQuickDrawWords(parseDescribeItWords((questions as string[]).join('\n')).join('\n'))
                        }}
                      />
                    ) : questionTab === 'upload' ? (
                      <div className="space-y-3">
                        <a
                          href={questionSampleFile('quick_draw').href}
                          download={questionSampleFile('quick_draw').download}
                          className="inline-block text-sm text-[var(--primary)] underline"
                        >
                          Download sample CSV
                        </a>
                        <button
                          type="button"
                          onClick={() => quickDrawFileRef.current?.click()}
                          className="btn-secondary w-full py-2.5 text-sm"
                        >
                          Choose file
                        </button>
                        <input
                          ref={quickDrawFileRef}
                          type="file"
                          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setQuickDrawUploadError(null)
                            try {
                              const lower = file.name.toLowerCase()
                              const rows =
                                lower.endsWith('.xlsx') || lower.endsWith('.xls')
                                  ? await parseExcelDescribeItWords(await file.arrayBuffer())
                                  : parseDescribeItWords(await file.text())
                              if (rows.length === 0) throw new Error('No words found in that file')
                              setQuickDrawWords(rows.join('\n'))
                            } catch {
                              setQuickDrawUploadError('Could not read that file. Try the sample CSV.')
                            } finally {
                              if (quickDrawFileRef.current) quickDrawFileRef.current.value = ''
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <textarea
                        value={quickDrawWords}
                        onChange={(e) => setQuickDrawWords(e.target.value)}
                        placeholder={
                          settings.quick_draw_variant === 'guess'
                            ? 'pizza\nrainbow\nastronaut'
                            : 'A cat in a tuxedo\nA haunted toaster'
                        }
                        rows={4}
                        className="input-field w-full resize-y text-sm"
                      />
                    )}

                    {quickDrawUploadError && <p className="text-xs text-red-500">{quickDrawUploadError}</p>}
                    {parseDescribeItWords(quickDrawWords).length > 0 && (
                      <p className="text-faint text-xs text-center">
                        {parseDescribeItWords(quickDrawWords).length}{' '}
                        {settings.quick_draw_variant === 'guess' ? 'words' : 'prompts'} ready
                      </p>
                    )}
                  </div>
                )}
                {categoryUploadField}
                {showViewerToggle && <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} />}
                <p className="text-faint text-sm leading-relaxed">
                  {settings.quick_draw_variant === 'guess'
                    ? settings.quick_draw_play_mode === 'individual'
                      ? `Take turns drawing a secret word while everyone races to guess. ${QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL}+ players.`
                      : `Teams take turns drawing while teammates guess as many words as possible. ${QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM}+ players.`
                    : 'Everyone draws a weird prompt on their phone. Others write fake titles to fool the room, then vote on which title is real — artists and fakers both earn points.'}
                </p>
              </SettingsGroup>
            ) : isTwoTruths ? (
              <SettingsGroup title="Two Truths & a Lie">
                <Field label={`Max players (${effectiveLimits.two_truths.min}–${effectiveLimits.two_truths.max})`}>
                  <CustomSelect
                    value={ttlMaxPlayers}
                    onChange={setTtlMaxPlayers}
                    options={playerCountOptions(effectiveLimits.two_truths.min, effectiveLimits.two_truths.max).map(
                      (n) => ({
                        value: n,
                        label: `${n} players`,
                      })
                    )}
                  />
                </Field>
                <Field label="Guess timer (per round)">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={TTL_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s} seconds` }))}
                  />
                </Field>
                {showViewerToggle && <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} />}
                <p className="text-faint text-sm leading-relaxed">
                  Everyone writes two truths and one lie in the lobby. Each round spotlights one player — the rest guess
                  which statement is the lie. Correct guesses earn points; fool the room for bonus points.
                </p>
              </SettingsGroup>
            ) : isMonopoly ? (
              <SettingsGroup title="Estate Kings room">
                <Field label={`Max players (${effectiveLimits.monopoly.min}–${effectiveLimits.monopoly.max})`}>
                  <CustomSelect
                    value={monopolyMaxPlayers}
                    onChange={setMonopolyMaxPlayers}
                    options={playerCountOptions(effectiveLimits.monopoly.min, effectiveLimits.monopoly.max).map(
                      (n) => ({
                        value: n,
                        label: `${n} players`,
                      })
                    )}
                  />
                </Field>
                <Field label="Board size">
                  <CustomSelect
                    value={monopolyBoardSize}
                    onChange={(value) => setMonopolyBoardSize(value === 48 ? 48 : 40)}
                    options={[
                      { value: 40, label: '40 spaces' },
                      ...(monopolyMaxPlayers >= 6 ? [{ value: 48, label: '48 spaces' }] : []),
                    ]}
                  />
                </Field>
                <Field label="Turn timer">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={[
                      { value: 0, label: 'No timer' },
                      { value: 30, label: '30 seconds' },
                      { value: 45, label: '45 seconds' },
                      { value: 60, label: '60 seconds' },
                      { value: 90, label: '90 seconds' },
                    ]}
                  />
                </Field>
                <Field label="Game length">
                  <CustomSelect
                    value={monopolyGameDuration}
                    onChange={setMonopolyGameDuration}
                    options={MONOPOLY_GAME_DURATION_OPTIONS.map((s) => ({
                      value: s,
                      label: formatMonopolyGameDuration(s),
                    }))}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="monopoly" />
                <p className="text-faint text-sm leading-relaxed">
                  {formatThemedText(
                    'Players join with their name and start on PAYDAY with £1,500. Take turns rolling dice, buying properties, paying rent, and drawing cards. Last player standing wins! If someone stalls, their turn auto-resolves. Set a game length to end automatically — the richest player wins when time runs out.',
                    settings.theme
                  )}
                </p>
              </SettingsGroup>
            ) : isYahtzee ? (
              <SettingsGroup title="Five Dice room">
                <SoloPracticeCta gameType="yahtzee" />
                <Field label={`Max players (${effectiveLimits.yahtzee.min}–${effectiveLimits.yahtzee.max})`}>
                  <CustomSelect
                    value={yahtzeeMaxPlayers}
                    onChange={setYahtzeeMaxPlayers}
                    options={playerCountOptions(effectiveLimits.yahtzee.min, effectiveLimits.yahtzee.max).map((n) => ({
                      value: n,
                      label: `${n} players`,
                    }))}
                  />
                </Field>
                <Field label="Turn timer">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={[
                      { value: 0, label: 'No timer' },
                      { value: 30, label: '30 seconds' },
                      { value: 60, label: '60 seconds' },
                      { value: 90, label: '90 seconds' },
                      { value: 120, label: '2 minutes' },
                    ]}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="yahtzee" />
                <p className="text-faint text-sm leading-relaxed">
                  Play solo or with up to six friends. Take turns rolling 5 dice, holding what you want, and scoring an
                  unused category on your sheet. Highest total score at the end wins!
                </p>
              </SettingsGroup>
            ) : isWhot ? (
              <SettingsGroup title="Whot room">
                <SoloPracticeCta gameType="whot" />
                <Field label={`Max players (${effectiveLimits.whot.min}–${effectiveLimits.whot.max})`}>
                  <CustomSelect
                    value={whotMaxPlayers}
                    onChange={setWhotMaxPlayers}
                    options={playerCountOptions(effectiveLimits.whot.min, effectiveLimits.whot.max).map((n) => ({
                      value: n,
                      label: `${n} players`,
                    }))}
                  />
                </Field>
                <Field label="Turn timer">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={turnTimerOptionsFor('whot').map((s) => ({
                      value: s,
                      label: formatBoardGameTurnTimer(s),
                    }))}
                  />
                </Field>
                <Field label="Game length">
                  <CustomSelect
                    value={whotGameDuration}
                    onChange={setWhotGameDuration}
                    options={WHOT_GAME_DURATION_OPTIONS.map((s) => ({
                      value: s,
                      label: formatWhotGameDuration(s),
                    }))}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="whot" />
                <Field label="House rules">
                  <div className="space-y-2">
                    <Toggle
                      label="Pick 3"
                      description="Play the Pick 3 draw penalty on 5s (5 cards stay in the deck either way)"
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
                <SoloPracticeCta gameType="crazy_eights" />
                <Field label={`Max players (${effectiveLimits.crazy_eights.min}–${effectiveLimits.crazy_eights.max})`}>
                  <CustomSelect
                    value={crazy8MaxPlayers}
                    onChange={setCrazy8MaxPlayers}
                    options={playerCountOptions(effectiveLimits.crazy_eights.min, effectiveLimits.crazy_eights.max).map(
                      (n) => ({
                        value: n,
                        label: `${n} players`,
                      })
                    )}
                  />
                </Field>
                <Field label="Turn timer">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={turnTimerOptionsFor('crazy_eights').map((s) => ({
                      value: s,
                      label: formatBoardGameTurnTimer(s),
                    }))}
                  />
                </Field>
                <Field label="Game length">
                  <CustomSelect
                    value={crazy8GameDuration}
                    onChange={setCrazy8GameDuration}
                    options={CRAZY8_GAME_DURATION_OPTIONS.map((s) => ({
                      value: s,
                      label: formatCrazyEightsGameDuration(s),
                    }))}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="crazy_eights" />
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
            ) : isUno ? (
              <SettingsGroup title="UNO room">
                <SoloPracticeCta gameType="uno" />
                <Field label="Mode">
                  <CustomSelect
                    value={unoMode}
                    onChange={(val) => setUnoMode(val as 'classic' | 'no_mercy')}
                    options={[
                      { value: 'classic', label: 'Classic — the standard game with optional Team-Up' },
                      {
                        value: 'no_mercy',
                        label: 'High Stakes — 168-card deck, +6/+10, hand-size knockouts',
                      },
                    ]}
                  />
                  <p className="mt-1 text-xs text-faint">
                    High Stakes is a Show ’em No Mercy-style variant: locks in stacking + 0-7, disables Draw 4
                    challenges and Team-Up, and adds Discard Colour, Skip All, Reverse Draw 4, Draw 6, Draw 10, and
                    Colour Roulette cards.
                  </p>
                </Field>
                {unoMode === 'no_mercy' ? (
                  <Field label="Win condition">
                    <CustomSelect
                      value={unoNoMercyWin}
                      onChange={(val) => setUnoNoMercyWin(val as 'first_out' | 'last_standing')}
                      options={[
                        { value: 'first_out', label: 'First out — empty your hand to win' },
                        { value: 'last_standing', label: 'Last standing — outlast every knockout' },
                      ]}
                    />
                    <p className="mt-1 text-xs text-faint">
                      Any player holding 25+ cards is knocked out. Last standing wins when only one player is still
                      holding cards.
                    </p>
                  </Field>
                ) : null}
                {unoMode === 'classic' ? (
                  <Field label="Team-Up (2v2)">
                    <Toggle
                      label="Team-Up mode"
                      description="4 players in 2 teams of 2. Teammates sit across and see each other's hands; a team wins the round the moment either partner empties their hand."
                      value={unoTeamMode}
                      onChange={setUnoTeamMode}
                    />
                  </Field>
                ) : null}
                {unoTeamMode ? (
                  <Field label="Players">
                    <div className="input-field w-full bg-[var(--surface-inset-bg)] text-muted">
                      4 players (2 teams of 2)
                    </div>
                  </Field>
                ) : (
                  <Field label={`Max players (${effectiveLimits.uno.min}–${effectiveLimits.uno.max})`}>
                    <CustomSelect
                      value={unoMaxPlayers}
                      onChange={setUnoMaxPlayers}
                      options={playerCountOptions(effectiveLimits.uno.min, effectiveLimits.uno.max).map((n) => ({
                        value: n,
                        label: `${n} players`,
                      }))}
                    />
                  </Field>
                )}
                <Field label="Turn timer">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={turnTimerOptionsFor('uno').map((s) => ({
                      value: s,
                      label: formatBoardGameTurnTimer(s),
                    }))}
                  />
                </Field>
                <Field label="Game length">
                  <CustomSelect
                    value={unoGameDuration}
                    onChange={setUnoGameDuration}
                    options={UNO_GAME_DURATION_OPTIONS.map((s) => ({
                      value: s,
                      label: formatUnoGameDuration(s),
                    }))}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="uno" />
                <Field label="Missed last-card penalty">
                  <CustomSelect
                    value={unoUnoPenalty}
                    onChange={setUnoUnoPenalty}
                    options={[
                      { value: 2, label: 'Draw 2 cards' },
                      { value: 4, label: 'Draw 4 cards (harsher)' },
                    ]}
                  />
                </Field>
                <Field label="House rules">
                  <div className="space-y-2">
                    {unoMode === 'classic' ? (
                      <>
                        <Toggle
                          label="Draw 4 challenge"
                          description="Let the next player challenge a Draw 4 — the system reveals the hand. Off: they always draw 4."
                          value={unoWd4Challenge}
                          onChange={setUnoWd4Challenge}
                        />
                        <Toggle
                          label="0-7 rule"
                          description="Play a 0 → everyone passes their whole hand in the direction of play. Play a 7 → swap hands with any player."
                          value={unoZeroSeven}
                          onChange={setUnoZeroSeven}
                        />
                        <Toggle
                          label="Stacking"
                          description="Stack Draw 2 on Draw 2 and Draw 4 on Draw 4 — the penalty piles up and passes on. Whoever would draw the pile can still challenge a Draw 4 (if challenge is on)."
                          value={unoStacking}
                          onChange={setUnoStacking}
                        />
                      </>
                    ) : (
                      <p className="text-xs text-faint">
                        High Stakes locks in 0-7 and Draw-card stacking (any Draw card of equal or higher value chains
                        onto a stack). Draw 4 challenges and Jump-In are off.
                      </p>
                    )}
                    {unoMode === 'classic' ? (
                      <Toggle
                        label="Jump-In"
                        description="Hold an exact match for the top card (same colour + number, or same colour + symbol)? Play it instantly, even out of turn — the players you skip lose that turn. Wilds can't be jumped. Off keeps strict turn order."
                        value={unoJumpIn}
                        onChange={setUnoJumpIn}
                      />
                    ) : null}
                  </div>
                </Field>
                <Field label="Multi-Play">
                  <CustomSelect
                    value={unoMultiPlayMode}
                    onChange={(val) => setUnoMultiPlayMode(val as typeof unoMultiPlayMode)}
                    options={[
                      { value: 'off', label: 'Off — one card per turn' },
                      { value: 'same_color_or_number', label: 'Same colour or number' },
                      { value: 'same_color', label: 'Same colour only' },
                      { value: 'same_number', label: 'Same number only' },
                    ]}
                  />
                  <p className="mt-1 text-xs text-faint">
                    Lay several matching cards in a single turn — the last one played sets the next colour.
                  </p>
                </Field>
                <Field label="Series scoring (optional)">
                  <Toggle
                    label="Track points across hands"
                    description={
                      'At each hand end the winner scores the sum of every opponent’s cards (number = face, coloured action = 20, wild = 50). In High Stakes, each 25-card knockout adds +250.'
                    }
                    value={unoSeriesScoring}
                    onChange={setUnoSeriesScoring}
                  />
                  {unoSeriesScoring ? (
                    <div className="mt-2">
                      <CustomSelect
                        value={unoSeriesTarget}
                        onChange={setUnoSeriesTarget}
                        options={[
                          { value: 300, label: 'First to 300 wins the series' },
                          { value: 500, label: 'First to 500 wins the series' },
                          { value: 1000, label: 'First to 1000 wins the series (classic)' },
                          { value: 2000, label: 'First to 2000 wins the series' },
                        ]}
                      />
                    </div>
                  ) : null}
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  The party card classic — match the top card by colour, number, or symbol. Skip, Reverse, Draw 2, and
                  Wild cards keep it lively; call &quot;last card&quot; on your second-to-last play or draw a penalty.
                  First to empty their hand wins! With a game length set, time running out ends the game — lowest hand
                  total wins.
                </p>
              </SettingsGroup>
            ) : isLudo ? (
              <SettingsGroup title="Ludo room">
                <SoloPracticeCta gameType="ludo" />
                <Field label={`Max players (${effectiveLimits.ludo.min}–${effectiveLimits.ludo.max})`}>
                  <CustomSelect
                    value={ludoMaxPlayers}
                    onChange={setLudoMaxPlayers}
                    options={playerCountOptions(effectiveLimits.ludo.min, effectiveLimits.ludo.max).map((n) => ({
                      value: n,
                      label: `${n} players`,
                    }))}
                  />
                </Field>
                <Field label="Turn timer">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={[
                      { value: 0, label: 'No timer' },
                      { value: 30, label: '30 seconds' },
                      { value: 60, label: '60 seconds' },
                      { value: 90, label: '90 seconds' },
                    ]}
                  />
                </Field>
                <Field label="Rules">
                  <CustomSelect
                    value={ludoVariant}
                    onChange={(val) => setLudoVariant(val as LudoVariant)}
                    options={[
                      { value: 'modern', label: 'Modern — 8 safe squares (starts + star squares)' },
                      { value: 'traditional', label: 'Traditional — no safe squares except your home column' },
                    ]}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="ludo" />
                <p className="text-faint text-sm leading-relaxed">
                  {ludoVariant === 'traditional'
                    ? 'Traditional Ludo — the only safe spot is your own coloured home column; anywhere on the shared track, a lone piece can be captured. Roll two dice to enter, race around, and get all four pieces home to win.'
                    : 'Modern Ludo — star squares and every start are safe from capture. Roll two dice to enter, race around the board, capture opponents, and block with pairs. First to get all four pieces home wins!'}
                </p>
              </SettingsGroup>
            ) : isSnakeLadder ? (
              <SettingsGroup title="Snake & Ladder room">
                <Field
                  label={`Max players (${effectiveLimits.snake_and_ladder.min}–${effectiveLimits.snake_and_ladder.max})`}
                >
                  <CustomSelect
                    value={snakeLadderMaxPlayers}
                    onChange={setSnakeLadderMaxPlayers}
                    options={playerCountOptions(
                      effectiveLimits.snake_and_ladder.min,
                      effectiveLimits.snake_and_ladder.max
                    ).map((n) => ({ value: n, label: `${n} players` }))}
                  />
                </Field>
                <Field label="Turn timer">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={[
                      { value: 0, label: 'No timer' },
                      { value: 15, label: '15 seconds' },
                      { value: 30, label: '30 seconds' },
                      { value: 60, label: '60 seconds' },
                      { value: 90, label: '90 seconds' },
                    ]}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="snake_and_ladder" />
                <p className="text-faint text-sm leading-relaxed">
                  Classic Snakes &amp; Ladders — roll one die, climb the ladders, dodge the snakes. Roll a 6 to go
                  again. First to land on 100 exactly wins!
                </p>
              </SettingsGroup>
            ) : isPingPong ? (
              <SettingsGroup title="Ping Pong room">
                <p className="text-faint text-sm">Exactly 2 players — 1v1 match where the host can play or watch.</p>
                <Field label="Points to win">
                  <CustomSelect
                    value={settings.ping_pong_points_to_win ?? 7}
                    onChange={(val) => setSettings({ ...settings, ping_pong_points_to_win: val })}
                    options={[
                      { value: 3, label: 'First to 3 points (Lightning)' },
                      { value: 5, label: 'First to 5 points' },
                      { value: 7, label: 'First to 7 points (Quick)' },
                      { value: 11, label: 'First to 11 points (Standard)' },
                      { value: 15, label: 'First to 15 points' },
                      { value: 21, label: 'First to 21 points (Long)' },
                    ]}
                  />
                </Field>
                <Field label="Match Timer">
                  <CustomSelect
                    value={settings.game_duration_seconds ?? 0}
                    onChange={(val) => setSettings({ ...settings, game_duration_seconds: val })}
                    options={[
                      { value: 0, label: 'No timer' },
                      { value: 60, label: '1 minute' },
                      { value: 120, label: '2 minutes' },
                      { value: 180, label: '3 minutes' },
                      { value: 300, label: '5 minutes' },
                      { value: 600, label: '10 minutes' },
                    ]}
                  />
                </Field>
                <Field label="Late joiners">
                  <p className="text-sm font-medium">Viewers only</p>
                  <p className="text-xs text-faint mt-1">
                    Once the 2-player match starts, anyone else joining the room will automatically become a viewer.
                  </p>
                </Field>
              </SettingsGroup>
            ) : isTicTacToe ? (
              <SettingsGroup title="Tic-Tac-Toe room">
                <p className="text-faint text-sm">Exactly 2 players — the host can join as one of them.</p>
                <Field label="Turn timer">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={[
                      { value: 0, label: 'No timer' },
                      { value: 15, label: '15 seconds' },
                      { value: 30, label: '30 seconds' },
                      { value: 60, label: '60 seconds' },
                    ]}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="tic_tac_toe" />
                <p className="text-faint text-sm leading-relaxed">
                  Ultimate Tic-Tac-Toe — nine small boards in one big grid. Your move sends your opponent to the
                  matching board; win three boards in a row to win it all.
                </p>
              </SettingsGroup>
            ) : isChess ? (
              <SettingsGroup title="Chess room">
                <p className="text-faint text-sm">Exactly 2 players — the host can join as one of them.</p>
                <Field label="Time per player">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={[
                      { value: 0, label: 'No timer' },
                      { value: 180, label: '3 minutes each' },
                      { value: 300, label: '5 minutes each' },
                      { value: 600, label: '10 minutes each' },
                    ]}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="chess" />
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
                          <span className="leading-none flex gap-0.5">
                            <ChessPieceGlyph set={set} color="w" type="n" className="h-6 w-6" />
                            <ChessPieceGlyph set={set} color="b" type="n" className="h-6 w-6" />
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
            ) : isCheckers ? (
              <SettingsGroup title="Checkers room">
                <p className="text-faint text-sm">Exactly 2 players — the host can join as one of them.</p>
                <Field label="Time per player">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={[
                      { value: 0, label: 'No timer' },
                      { value: 180, label: '3 minutes each' },
                      { value: 300, label: '5 minutes each' },
                      { value: 600, label: '10 minutes each' },
                    ]}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="checkers" />
                <p className="text-faint text-sm leading-relaxed">
                  Classic checkers — Black moves first, jumps are forced, and reaching the far row crowns a king.
                  Capture all your opponent’s pieces to win. Each player gets their own clock that only ticks on their
                  turn.
                </p>
              </SettingsGroup>
            ) : isDraughts10 ? (
              <SettingsGroup title={isCheckersNigeria ? 'Nigerian Draughts room' : 'International Draughts room'}>
                <p className="text-faint text-sm">Exactly 2 players — the host can join as one of them.</p>
                <Field label="Time per player">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={[
                      { value: 0, label: 'No timer' },
                      { value: 180, label: '3 minutes each' },
                      { value: 300, label: '5 minutes each' },
                      { value: 600, label: '10 minutes each' },
                    ]}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType={settings.game_type} />
                {isCheckersNigeria && (
                  <label className="flex items-center justify-between gap-2 py-1">
                    <span className="text-sm font-semibold">
                      Street Rules
                      <span className="block text-xs font-normal text-faint">
                        Capturing stays optional — decline one and your opponent may huff (remove) the piece instead of
                        moving.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={checkersNigeriaStreetRules}
                      onChange={(e) => setCheckersNigeriaStreetRules(e.target.checked)}
                    />
                  </label>
                )}
                <p className="text-faint text-sm leading-relaxed">
                  {isCheckersNigeria
                    ? 'Nigerian Draughts — 10×10 board, 20 seeds each, flying kings, and mandatory majority capture (you must take the biggest jump available). Reaching the far row caps a seed into a king.'
                    : 'International Draughts — 10×10 board, 20 pieces each, flying kings, and mandatory majority capture (you must take the biggest jump available). Reaching the far row crowns a king.'}
                </p>
              </SettingsGroup>
            ) : isMahjong ? (
              <SettingsGroup title="Mahjong room">
                <p className="text-faint text-sm">Exactly 4 players — the host can join as one of them.</p>
                <Field label="Turn timer">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={[
                      { value: 0, label: 'No timer' },
                      { value: 30, label: '30 seconds' },
                      { value: 60, label: '60 seconds' },
                      { value: 90, label: '90 seconds' },
                      { value: 120, label: '2 minutes' },
                    ]}
                  />
                </Field>
                <Field label="Ruleset">
                  <CustomSelect
                    value={mahjongRuleset}
                    onChange={(val) => setMahjongRuleset(val as MahjongRuleset)}
                    options={MAHJONG_RULESETS.map((id) => ({
                      value: id,
                      label: MAHJONG_RULESET_CONFIG[id].label,
                    }))}
                  />
                  <p className="text-faint text-xs mt-2">{MAHJONG_RULESET_CONFIG[mahjongRuleset].description}</p>
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="mahjong" />
              </SettingsGroup>
            ) : isAyo ? (
              <SettingsGroup title="Ayo room">
                <SoloPracticeCta gameType="ayo" />
                <p className="text-faint text-sm">Exactly 2 players — the host can join as one of them.</p>
                <Field label="Time per player">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={[
                      { value: 0, label: 'Casual — no timer' },
                      { value: 30, label: 'Ranked — 30 seconds each' },
                      { value: 180, label: '3 minutes each' },
                      { value: 300, label: '5 minutes each' },
                      { value: 600, label: '10 minutes each' },
                    ]}
                  />
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="ayo" />
                <p className="text-faint text-sm leading-relaxed">
                  Traditional Ayo Olopon — sow anti-clockwise, relaying whenever your last seed lands in a non-empty
                  house. When your last seed completes exactly four in any house — yours or your opponent’s — you win
                  it. Once only eight seeds remain, the player who captures the first four takes the last four and the
                  game ends. Most houses wins — if houses are equal, the most seeds captured breaks the tie. The winner
                  is Ọta.
                </p>
              </SettingsGroup>
            ) : isScrabble ? (
              <SettingsGroup title="Word Tiles room">
                <p className="text-faint text-sm">2–4 players — the host can join as one of them.</p>
                <Field label="Game mode">
                  <CustomSelect
                    value={scrabbleClockMode}
                    onChange={(val) => setScrabbleClockMode(val as ScrabbleClockMode)}
                    options={[
                      { value: 'standard', label: 'Normal (per-turn timer)' },
                      { value: 'chess', label: 'Chess clock (per-player time bank)' },
                    ]}
                  />
                  <p className="text-faint mt-1 text-xs">
                    {scrabbleClockMode === 'chess'
                      ? 'Each player gets a fixed time bank that only counts down on their turn. Run out and you can watch but not play; last clock standing ends the game — highest score wins.'
                      : 'An optional countdown each turn, plus an overall game-length cap.'}
                  </p>
                </Field>
                {scrabbleClockMode === 'chess' ? (
                  <Field label="Time per player">
                    <CustomSelect
                      value={scrabbleClockSeconds}
                      onChange={setScrabbleClockSeconds}
                      options={SCRABBLE_CLOCK_OPTIONS.map((s) => ({ value: s, label: `${s / 60} minutes` }))}
                    />
                  </Field>
                ) : (
                  <>
                    <Field label="Time per turn">
                      <CustomSelect
                        value={settings.timer_seconds}
                        onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                        options={[
                          { value: 0, label: 'No timer' },
                          { value: 60, label: '1 minute' },
                          { value: 120, label: '2 minutes' },
                          { value: 180, label: '3 minutes' },
                          { value: 300, label: '5 minutes' },
                        ]}
                      />
                    </Field>
                    <Field label="Game length">
                      <CustomSelect
                        value={scrabbleGameDuration}
                        onChange={setScrabbleGameDuration}
                        options={SCRABBLE_GAME_DURATION_OPTIONS.map((s) => ({
                          value: s,
                          label: formatScrabbleGameDuration(s),
                        }))}
                      />
                    </Field>
                  </>
                )}
                <Field label="Dictionary">
                  <CustomSelect
                    value={scrabbleDictionary}
                    onChange={(val) => setScrabbleDictionary(val as ScrabbleDictionaryId)}
                    options={SCRABBLE_DICTIONARY_OPTIONS.map((id) => ({
                      value: id,
                      label: SCRABBLE_DICTIONARY_LABELS[id],
                    }))}
                  />
                  <p className="text-faint mt-1 text-xs">{SCRABBLE_DICTIONARY_BLURBS[scrabbleDictionary]}</p>
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="scrabble" />
                <p className="text-faint text-sm leading-relaxed">
                  Build words on a 15×15 board, hit the premium squares, and outscore everyone. Every word is checked
                  against a real dictionary; highest score when the tiles run out wins. Set a game length so it
                  can&apos;t run for hours.
                </p>
              </SettingsGroup>
            ) : isLandmine ? (
              <SettingsGroup title="Landmine settings">
                <Field label="Who plants the mine">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      aria-pressed={landmineMineSource === 'system'}
                      onClick={() => {
                        setLandmineMineSource('system')
                        setLandmineCategoryTimer(10)
                        setLandmineReview(true)
                        setLandmineReviewSeconds(20)
                      }}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        landmineMineSource === 'system'
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Auto</span>
                      <span className="text-faint text-xs sm:text-sm">
                        The app secretly plants the mine. Everyone plays every round.
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={landmineMineSource === 'manual'}
                      onClick={() => {
                        setLandmineMineSource('manual')
                        // Give setters more time to type, and default to a single cycle.
                        setLandmineCategoryTimer(30)
                        setSettings((s) => ({ ...s, rounds_count: 1 }))
                        setLandmineReview(true)
                        setLandmineReviewSeconds(45)
                      }}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        landmineMineSource === 'manual'
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Manual</span>
                      <span className="text-faint text-xs sm:text-sm">
                        Players take turns setting the category + mine, sit out their round, and score what the room
                        scores.
                      </span>
                    </button>
                  </div>
                </Field>
                <Field label="Mode">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      aria-pressed={landmineMode === 'zero_points'}
                      onClick={() => setLandmineMode('zero_points')}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        landmineMode === 'zero_points'
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Zero Points</span>
                      <span className="text-faint text-xs sm:text-sm">Mine scores 0 — everyone plays all rounds</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={landmineMode === 'elimination'}
                      onClick={() => setLandmineMode('elimination')}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        landmineMode === 'elimination'
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Elimination</span>
                      <span className="text-faint text-xs sm:text-sm">Mine knocks you out — last standing wins</span>
                    </button>
                  </div>
                </Field>
                <Field label="Hidden mines each round">
                  <CustomSelect
                    value={landmineMineCount}
                    onChange={setLandmineMineCount}
                    options={[1, 2, 3].map((n) => ({
                      value: n,
                      label: `${n} mine${n > 1 ? 's' : ''}`,
                    }))}
                  />
                  <p className="text-faint text-xs mt-1">
                    How many of the answers are secretly booby-trapped each round. Type a mine and you score 0 (or get
                    knocked out). More mines = riskier.
                  </p>
                </Field>
                {landmineMode === 'elimination' && (
                  <Field label="Time limit">
                    <SegmentedControl
                      value={String(landmineElimSeconds)}
                      onChange={(v) => setLandmineElimSeconds(Number(v))}
                      options={[180, 300, 600, 900].map((s) => ({ value: String(s), label: `${s / 60} min` }))}
                    />
                    <p className="text-faint text-xs mt-1">
                      Elimination plays until one player is left — but if nobody hits a mine it would run forever, so
                      the game ends when the clock runs out and ranks survivors by score.
                    </p>
                  </Field>
                )}
                {landmineMode === 'zero_points' && landmineMineSource === 'system' && (
                  <Field label="Number of rounds">
                    <SegmentedControl
                      value={String(settings.rounds_count)}
                      onChange={(v) => setSettings({ ...settings, rounds_count: Number(v) })}
                      options={[3, 5, 8, 10].map((n) => ({ value: String(n), label: String(n) }))}
                    />
                  </Field>
                )}
                {landmineMode === 'zero_points' && landmineMineSource === 'manual' && (
                  <Field label="Number of rounds">
                    <SegmentedControl
                      value={String(settings.rounds_count)}
                      onChange={(v) => setSettings({ ...settings, rounds_count: Number(v) })}
                      options={[1, 2, 3, 5].map((n) => ({ value: String(n), label: String(n) }))}
                    />
                    <p className="text-faint text-xs mt-1">
                      One round = every player takes a turn setting the mine. So {settings.rounds_count} round
                      {settings.rounds_count === 1 ? '' : 's'} means everyone sets{' '}
                      {settings.rounds_count === 1 ? 'once' : `${settings.rounds_count} times`}.
                    </p>
                  </Field>
                )}
                <Field
                  label={
                    landmineMineSource === 'manual' ? 'Time to set the category & mine' : 'Time to pick a category'
                  }
                >
                  <SegmentedControl
                    value={String(landmineCategoryTimer)}
                    onChange={(v) => setLandmineCategoryTimer(Number(v))}
                    options={[5, 10, 15, 30].map((n) => ({ value: String(n), label: `${n}s` }))}
                  />
                </Field>
                <Field label="Time to answer">
                  <SegmentedControl
                    value={String(settings.timer_seconds)}
                    onChange={(v) => setSettings({ ...settings, timer_seconds: Number(v) })}
                    options={[30, 45, 60, 90].map((n) => ({ value: String(n), label: `${n}s` }))}
                  />
                </Field>
                <Field label="Time to vote on answers">
                  <SegmentedControl
                    value={String(landmineMarkingTimer)}
                    onChange={(v) => setLandmineMarkingTimer(Number(v))}
                    options={[20, 30, 45, 60].map((n) => ({ value: String(n), label: `${n}s` }))}
                  />
                </Field>
                <label className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm font-semibold">Originality bonus (+5 if nobody else said it)</span>
                  <input
                    type="checkbox"
                    checked={landmineOriginality}
                    onChange={(e) => setLandmineOriginality(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm font-semibold">
                    Review answers before reveal
                    <span className="block text-xs font-normal text-faint">
                      {landmineMineSource === 'manual'
                        ? 'The setter checks each answer before scores show.'
                        : 'The round’s caller checks each answer before scores show. Off = instant reveal.'}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={landmineReview}
                    onChange={(e) => setLandmineReview(e.target.checked)}
                  />
                </label>
                {landmineReview && (
                  <Field label="Review time">
                    <SegmentedControl
                      value={String(landmineReviewSeconds)}
                      onChange={(v) => setLandmineReviewSeconds(Number(v))}
                      options={[15, 20, 30, 45, 60].map((n) => ({ value: String(n), label: `${n}s` }))}
                    />
                  </Field>
                )}
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} />
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
                    <CustomSelect
                      value={settings.describe_it_num_teams}
                      onChange={(val) => setSettings({ ...settings, describe_it_num_teams: val })}
                      options={DESCRIBE_IT_TEAM_OPTIONS.map((n) => ({ value: n, label: `${n} teams` }))}
                    />
                  </Field>
                )}
                <Field label={`Max players (up to ${DESCRIBE_IT_MAX_PLAYER_OPTIONS.at(-1)})`}>
                  <CustomSelect
                    value={describeItMaxPlayers}
                    onChange={setDescribeItMaxPlayers}
                    options={DESCRIBE_IT_MAX_PLAYER_OPTIONS.map((n) => ({ value: n, label: `${n} players` }))}
                  />
                </Field>
                <Field
                  label={
                    settings.describe_it_mode === 'individual'
                      ? 'Rounds (everyone describes once per round)'
                      : 'Rounds (each team plays once per round)'
                  }
                >
                  <CustomSelect
                    value={settings.rounds_count}
                    onChange={(val) => setSettings({ ...settings, rounds_count: val })}
                    options={DESCRIBE_IT_ROUND_OPTIONS.map((n) => ({ value: n, label: `${n} rounds` }))}
                  />
                  {settings.describe_it_mode === 'individual' && (
                    <p className="text-faint text-[11px] pt-1">
                      Total turns = players × rounds. E.g. 6 players × {settings.rounds_count} rounds ={' '}
                      {6 * settings.rounds_count} turns — the lobby shows the exact count once everyone joins.
                    </p>
                  )}
                </Field>
                <Field label="Time per turn">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={DESCRIBE_IT_TURN_OPTIONS.map((n) => ({
                      value: n,
                      label: n === 60 ? '1 minute' : n === 120 ? '2 minutes' : `${n} seconds`,
                    }))}
                  />
                </Field>
                <Field label="Words">
                  <SegmentedControl
                    value={questionSource}
                    onChange={(v) => {
                      setQuestionSource(v as QuestionSource)
                      setSelectedPackId(null)
                      setLibraryPackQuestions([])
                      if (v !== 'custom') setDescribeItWords('')
                    }}
                    options={[
                      { value: 'platform', label: 'Platform', hint: 'Use our built-in word bank.' },
                      { value: 'library', label: 'Library', hint: 'Pick a community word pack.' },
                      { value: 'custom', label: 'Your own', hint: 'Add your own words or upload a file.' },
                    ]}
                  />
                </Field>

                {questionSource === 'custom' && questionCustomHint && <CustomContentAiTip hint={questionCustomHint} />}

                {questionSource === 'library' && (
                  <div className="space-y-2 pt-1">
                    <LibraryPackPicker
                      loading={libraryPacksLoading}
                      packs={libraryPacks}
                      search={libraryPackSearch}
                      onSearchChange={setLibraryPackSearch}
                      selectedPackId={selectedPackId}
                      onSelect={selectLibraryPack}
                      noun="words"
                    />
                    {parseDescribeItWords(describeItWords).length > 0 && (
                      <p className="text-faint text-xs text-center">
                        Loaded {parseDescribeItWords(describeItWords).length} words from this pack.
                      </p>
                    )}
                  </div>
                )}

                {questionSource === 'custom' && (
                  <div className="space-y-4 pt-1">
                    <SegmentedControl
                      value={questionTab}
                      onChange={setQuestionTab}
                      options={[
                        { value: 'upload', label: 'Upload file', hint: questionUploadHint('describe_it') },
                        { value: 'manual', label: 'Add manually', hint: 'Type or paste one word per line.' },
                        {
                          value: 'ai',
                          label: 'Generate with AI',
                          hint: 'Give a theme, get a ready-made set in seconds.',
                        },
                      ]}
                    />

                    {questionTab === 'ai' ? (
                      <AiQuestionsGenerator
                        gameType="describe_it"
                        noun="words"
                        defaultCount={30}
                        onThemeChange={handleAiThemeChange}
                        onGenerated={(questions) => {
                          setDescribeItUploadError(null)
                          setDescribeItWords(parseDescribeItWords((questions as string[]).join('\n')).join('\n'))
                        }}
                      />
                    ) : questionTab === 'upload' ? (
                      <div className="space-y-3">
                        <button
                          type="button"
                          onClick={() => describeItFileRef.current?.click()}
                          className="btn-secondary w-full py-2.5 text-sm"
                        >
                          Choose file
                        </button>
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

                    {questionTab !== 'manual' && parseDescribeItWords(describeItWords).length > 0 && (
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
                {categoryUploadField}
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="describe_it" />
                <p className="text-faint text-sm leading-relaxed">
                  {settings.describe_it_mode === 'individual'
                    ? 'Everyone takes turns describing one word while the rest race to guess it. Guessers score by speed and the describer scores per correct guess — highest total on the leaderboard wins.'
                    : 'Teams race the clock: a describer gives clues for secret words while teammates type guesses. Every correct guess scores a point — most words across all rounds wins.'}{' '}
                  Add your own words to use those first (the built-in bank only tops up if you run out); leave it blank
                  for the built-in bank.
                </p>
              </SettingsGroup>
            ) : isWordRush ? (
              <SettingsGroup title="Word Rush room">
                <p className="text-faint text-sm">
                  {settings.word_rush_mode === 'individual'
                    ? `Everyone races to name a valid word each round. ${WORD_RUSH_MIN_PLAYERS_INDIVIDUAL}+ players.`
                    : `Teams race the clock to name as many valid words as possible. ${WORD_RUSH_MIN_PLAYERS}+ players.`}
                </p>
                <Field label="Player mode">
                  <div className="grid grid-cols-2 gap-3">
                    {(['team', 'individual'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSettings({ ...settings, word_rush_mode: mode })}
                        className={[
                          'rounded-2xl border-2 px-4 py-4 text-left capitalize',
                          settings.word_rush_mode === mode
                            ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                            : 'border-[var(--border-strong)] text-muted',
                        ].join(' ')}
                      >
                        <span className="font-bold block text-base">{mode}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Prompt mode">
                  <div className="grid grid-cols-2 gap-3">
                    {(['automatic', 'manual'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSettings({ ...settings, word_rush_prompt_mode: mode })}
                        className={[
                          'rounded-2xl border-2 px-4 py-4 text-left capitalize',
                          settings.word_rush_prompt_mode === mode
                            ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                            : 'border-[var(--border-strong)] text-muted',
                        ].join(' ')}
                      >
                        <span className="font-bold block text-base">{mode}</span>
                        <span className="text-faint text-xs">
                          {mode === 'automatic' ? 'System picks letters' : 'Players pick letters'}
                        </span>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Difficulty">
                  <div className="grid grid-cols-2 gap-3">
                    {(['standard', 'hard'] as const).map((difficulty) => (
                      <button
                        key={difficulty}
                        type="button"
                        onClick={() => setSettings({ ...settings, word_rush_difficulty: difficulty })}
                        className={[
                          'rounded-2xl border-2 px-4 py-4 text-left capitalize',
                          settings.word_rush_difficulty === difficulty
                            ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                            : 'border-[var(--border-strong)] text-muted',
                        ].join(' ')}
                      >
                        <span className="font-bold block text-base">{difficulty}</span>
                        <span className="text-faint text-xs">
                          {difficulty === 'standard'
                            ? '3–20 letter words every round'
                            : 'Min length grows each round (3, 4, 5, 6 — then stays at 6)'}
                        </span>
                      </button>
                    ))}
                  </div>
                </Field>
                {settings.word_rush_mode !== 'individual' && (
                  <Field label="Teams">
                    <CustomSelect
                      value={settings.word_rush_num_teams}
                      onChange={(val) => setSettings({ ...settings, word_rush_num_teams: val })}
                      options={WORD_RUSH_TEAM_OPTIONS.map((n) => ({ value: n, label: `${n} teams` }))}
                    />
                  </Field>
                )}
                <Field
                  label={`Max players (${WORD_RUSH_MIN_PLAYERS_INDIVIDUAL}–${WORD_RUSH_MAX_PLAYER_OPTIONS.at(-1)})`}
                >
                  <CustomSelect
                    value={wordRushMaxPlayers}
                    onChange={setWordRushMaxPlayers}
                    options={WORD_RUSH_MAX_PLAYER_OPTIONS.map((n) => ({ value: n, label: `${n} players` }))}
                  />
                </Field>
                <Field label={settings.word_rush_mode === 'individual' ? 'Round length' : 'Team turn length'}>
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={WORD_RUSH_TURN_OPTIONS.map((n) => ({ value: n, label: formatWordRushTurnTimer(n) }))}
                  />
                </Field>
                <Field label="Rounds">
                  <CustomSelect
                    value={settings.rounds_count}
                    onChange={(val) => setSettings({ ...settings, rounds_count: val })}
                    options={WORD_RUSH_ROUND_OPTIONS.map((n) => ({ value: n, label: `${n} rounds` }))}
                  />
                  {settings.word_rush_mode === 'team' && (
                    <p className="text-faint text-xs mt-1">
                      Each round, every team gets one timed run (e.g. {settings.word_rush_num_teams} teams ×{' '}
                      {settings.rounds_count} rounds = {settings.word_rush_num_teams * settings.rounds_count} team
                      turns).
                    </p>
                  )}
                </Field>
                <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="word_rush" />
              </SettingsGroup>
            ) : isNpat ? (
              <SettingsGroup title="I Call On room">
                <Field label={`Max players (${effectiveLimits.i_call_on.min}–${effectiveLimits.i_call_on.max})`}>
                  <CustomSelect
                    value={npatMaxPlayers}
                    onChange={setNpatMaxPlayers}
                    options={playerCountOptions(effectiveLimits.i_call_on.min, effectiveLimits.i_call_on.max).map(
                      (n) => ({
                        value: n,
                        label: `${n} players`,
                      })
                    )}
                  />
                </Field>
                <Field label="Game length">
                  <CustomSelect
                    value={npatGameDuration}
                    onChange={setNpatGameDuration}
                    options={NPAT_GAME_DURATION_OPTIONS.map((s) => ({ value: s, label: formatNpatGameDuration(s) }))}
                  />
                </Field>
                <Field label="Writing time (per letter)">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={NPAT_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s} seconds` }))}
                  />
                </Field>
                <Field label="Marking time (per letter)">
                  <CustomSelect
                    value={npatMarkingTimer}
                    onChange={setNpatMarkingTimer}
                    options={NPAT_MARKING_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s} seconds` }))}
                  />
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
                  <CustomSelect
                    value={codewordsMaxPlayers}
                    onChange={setCodewordsMaxPlayers}
                    options={playerCountOptions(effectiveLimits.codewords.min, effectiveLimits.codewords.max).map(
                      (n) => ({
                        value: n,
                        label: `${n} players`,
                      })
                    )}
                  />
                </Field>
                <Field label="Spymaster timer (per turn)">
                  <CustomSelect
                    value={settings.timer_seconds}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={CODEWORDS_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s} seconds` }))}
                  />
                </Field>
                <Field label="Operative timer (per turn)">
                  <CustomSelect
                    value={codewordsOperativeTimer}
                    onChange={setCodewordsOperativeTimer}
                    options={CODEWORDS_TIMER_OPTIONS.map((s) => ({ value: s, label: `${s} seconds` }))}
                  />
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
                    onChange={(v) => {
                      setQuestionSource(v as QuestionSource)
                      setSelectedPackId(null)
                      setLibraryPackQuestions([])
                      if (v !== 'custom') setCustomCodewordsWords([])
                    }}
                    options={questionSourceOptions('codewords')}
                  />
                </Field>
                {questionSource === 'custom' && questionCustomHint && <CustomContentAiTip hint={questionCustomHint} />}
                {questionSource === 'library' && (
                  <div className="space-y-2">
                    <LibraryPackPicker
                      loading={libraryPacksLoading}
                      packs={libraryPacks}
                      search={libraryPackSearch}
                      onSearchChange={setLibraryPackSearch}
                      selectedPackId={selectedPackId}
                      onSelect={selectLibraryPack}
                      noun="words"
                    />
                    {customCodewordsWords.length > 0 && (
                      <p className="text-faint text-xs text-center">
                        Loaded {customCodewordsWords.length} words from this pack
                        {customCodewordsWords.length < CODEWORDS_MIN_CUSTOM_POOL
                          ? ` — need ${CODEWORDS_MIN_CUSTOM_POOL} minimum`
                          : ''}
                        .
                      </p>
                    )}
                  </div>
                )}
                {questionSource === 'custom' && (
                  <div className="space-y-4 pt-1">
                    <SegmentedControl
                      value={questionTab}
                      onChange={setQuestionTab}
                      options={[
                        { value: 'upload', label: 'Upload file', hint: questionUploadHint('codewords') },
                        { value: 'manual', label: 'Add manually', hint: 'Type a word, or paste one per line.' },
                        {
                          value: 'ai',
                          label: 'Generate with AI',
                          hint: 'Give a theme, get a ready-made set in seconds.',
                        },
                      ]}
                    />

                    {questionTab === 'ai' ? (
                      <AiQuestionsGenerator
                        gameType="codewords"
                        onThemeChange={handleAiThemeChange}
                        noun="words"
                        defaultCount={Math.max(CODEWORDS_MIN_CUSTOM_POOL, 25)}
                        onGenerated={(questions) => {
                          setQuestionsUploadError(null)
                          setCustomCodewordsWords(mergeCodewordsWords([], questions as string[]))
                        }}
                      />
                    ) : questionTab === 'upload' ? (
                      <div className="space-y-3">
                        <button
                          type="button"
                          onClick={() => codewordsFileRef.current?.click()}
                          className="btn-secondary w-full py-2.5 text-sm"
                        >
                          Choose file
                        </button>
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
                      </div>
                    ) : (
                      <div className="space-y-3">
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
                      </div>
                    )}

                    {questionsUploadError && <p className="text-red-400 text-sm">{questionsUploadError}</p>}
                    {customCodewordsWords.length > 0 && (
                      <div className="surface-inset border border-theme rounded-xl p-3 max-h-36 overflow-y-auto space-y-1.5">
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
                {categoryUploadField}
                <p className="text-faint text-sm leading-relaxed">
                  Two teams of spymasters and operatives. Spymasters give one-word clues — operatives guess words on the
                  5×5 grid. First team to find all their words wins. Avoid the assassin!
                </p>
              </SettingsGroup>
            ) : isWordSearch ? (
              <SettingsGroup title="Word Search room">
                <Field label={`Max players (${effectiveLimits.word_search.min}–${effectiveLimits.word_search.max})`}>
                  <CustomSelect
                    value={wordSearchMaxPlayers}
                    onChange={setWordSearchMaxPlayers}
                    options={playerCountOptions(effectiveLimits.word_search.min, effectiveLimits.word_search.max).map(
                      (n) => ({
                        value: n,
                        label: `${n} players`,
                      })
                    )}
                  />
                </Field>
                <Field label="Words">
                  <SegmentedControl
                    value={questionSource}
                    onChange={(v) => {
                      setQuestionSource(v as QuestionSource)
                      setSelectedPackId(null)
                      setLibraryPackQuestions([])
                      setPuzzleUploadError(null)
                      setPuzzleUploadSummary(null)
                      if (v !== questionSource) setCustomWordSearchWords([])
                    }}
                    options={questionSourceOptions('word_search')}
                  />
                </Field>
                {questionSource === 'library' && (
                  <div className="space-y-2 pt-1">
                    <LibraryPackPicker
                      loading={libraryPacksLoading}
                      packs={libraryPacks}
                      search={libraryPackSearch}
                      onSearchChange={setLibraryPackSearch}
                      selectedPackId={selectedPackId}
                      onSelect={selectLibraryPack}
                      noun="words"
                    />
                    {customWordSearchWords.length > 0 && (
                      <p className="text-faint text-xs text-center">
                        Loaded {customWordSearchWords.length} words from this pack.
                      </p>
                    )}
                  </div>
                )}
                {questionSource === 'custom' && (
                  <PuzzleUpload
                    sample={questionSampleFile('word_search')}
                    hint={questionUploadHint('word_search')}
                    buttonLabel="Choose CSV"
                    fileRef={wordSearchFileRef}
                    error={puzzleUploadError}
                    summary={puzzleUploadSummary}
                    onFile={async (file) => {
                      setPuzzleUploadError(null)
                      setPuzzleUploadSummary(null)
                      try {
                        const result = parseWordSearchEntryImport(await file.text())
                        if (result.questions.length < 4) throw new Error('Need at least 4 words')
                        setCustomWordSearchWords(result.questions)
                        const extra = formatEntryImportSummary(result)
                        setPuzzleUploadSummary(`${result.questions.length} words loaded${extra ? ` · ${extra}` : ''}`)
                      } catch (err) {
                        setCustomWordSearchWords([])
                        setPuzzleUploadError(err instanceof Error ? err.message : 'Could not read that file')
                      }
                    }}
                  />
                )}
                {categoryUploadField}
                {questionSource === 'platform' && (
                  <Field label="Theme">
                    <CustomSelect
                      value={wordSearchTheme}
                      onChange={(val) => {
                        const v = String(val)
                        setWordSearchTheme(v)
                        const locked = lockedPuzzleDifficulty(v)
                        if (locked) setWordSearchDifficulty(locked)
                      }}
                      options={[
                        ...wordSearchThemeOptions().map((t) => ({ value: t.id, label: t.label })),
                        ...puzzleThemes.map((t) => ({
                          value: `pt:${t.id}`,
                          label: `${t.name}${t.difficulty ? ` (${t.difficulty})` : ''}`,
                        })),
                      ]}
                      searchable
                    />
                  </Field>
                )}
                {
                  /* Difficulty = grid size, shown for every source (Platform/Library/Your own). */
                  <Field label="Difficulty">
                    <div className="grid grid-cols-3 gap-3">
                      {WORD_SEARCH_DIFFICULTIES.map((difficulty) => (
                        <button
                          key={difficulty}
                          type="button"
                          disabled={!!wordSearchDiffLock}
                          onClick={() => setWordSearchDifficulty(difficulty)}
                          className={[
                            'rounded-2xl border-2 px-4 py-3 text-center capitalize',
                            wordSearchDifficulty === difficulty
                              ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                              : 'border-[var(--border-strong)] text-muted',
                            wordSearchDiffLock ? 'opacity-50' : '',
                          ].join(' ')}
                        >
                          <span className="font-bold block text-base">{difficulty}</span>
                        </button>
                      ))}
                    </div>
                    {wordSearchDiffLock ? (
                      <p className="mt-2 text-xs text-muted">Difficulty is set by this theme.</p>
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        Sets the grid size, number of words and directions — not how tricky the words are.
                      </p>
                    )}
                  </Field>
                }
                <Field label="Max time limit">
                  <CustomSelect
                    value={wordSearchGameDuration}
                    onChange={setWordSearchGameDuration}
                    options={WORD_SEARCH_GAME_DURATION_OPTIONS.map((seconds) => ({
                      value: seconds,
                      label: seconds === 0 ? 'No timer' : formatWordSearchGameDuration(seconds),
                    }))}
                  />
                </Field>
                {showViewerToggle && (
                  <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="word_search" />
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Race to find every hidden word in the shared grid. Drag from the first letter to the last — each word
                  scores points, with a bonus for finding it first. Harder puzzles hide words diagonally and backwards.
                </p>
              </SettingsGroup>
            ) : isWordScramble ? (
              <SettingsGroup title="Word Scramble room">
                <Field
                  label={`Max players (${effectiveLimits.word_scramble.min}–${effectiveLimits.word_scramble.max})`}
                >
                  <CustomSelect
                    value={wordScrambleMaxPlayers}
                    onChange={setWordScrambleMaxPlayers}
                    options={playerCountOptions(
                      effectiveLimits.word_scramble.min,
                      effectiveLimits.word_scramble.max
                    ).map((n) => ({ value: n, label: `${n} players` }))}
                  />
                </Field>
                <Field label="Words & hints">
                  <SegmentedControl
                    value={questionSource}
                    onChange={(v) => {
                      setQuestionSource(v as QuestionSource)
                      setSelectedPackId(null)
                      setLibraryPackQuestions([])
                      setPuzzleUploadError(null)
                      setPuzzleUploadSummary(null)
                      // Any source switch drops the prior pool so stale custom words can't be
                      // submitted under the Library UI (or vice-versa) without a fresh pick.
                      if (v !== questionSource) setCustomWordScrambleWords([])
                    }}
                    options={questionSourceOptions('word_scramble')}
                  />
                </Field>
                {questionSource === 'library' && (
                  <div className="space-y-2 pt-1">
                    <LibraryPackPicker
                      loading={libraryPacksLoading}
                      packs={libraryPacks}
                      search={libraryPackSearch}
                      onSearchChange={setLibraryPackSearch}
                      selectedPackId={selectedPackId}
                      onSelect={selectLibraryPack}
                      noun="words"
                    />
                    {customWordScrambleWords.length > 0 && (
                      <p className="text-faint text-xs text-center">
                        Loaded {customWordScrambleWords.length} words from this pack.
                      </p>
                    )}
                  </div>
                )}
                {questionSource === 'custom' && (
                  <PuzzleUpload
                    sample={questionSampleFile('word_scramble')}
                    hint={questionUploadHint('word_scramble')}
                    buttonLabel="Choose CSV"
                    fileRef={wordScrambleFileRef}
                    error={puzzleUploadError}
                    summary={puzzleUploadSummary}
                    onFile={async (file) => {
                      setPuzzleUploadError(null)
                      setPuzzleUploadSummary(null)
                      try {
                        const result = parseWordScrambleEntryImport(await file.text())
                        if (result.questions.length < 4) throw new Error('Need at least 4 words')
                        setCustomWordScrambleWords(result.questions)
                        const extra = formatEntryImportSummary(result)
                        setPuzzleUploadSummary(`${result.questions.length} words loaded${extra ? ` · ${extra}` : ''}`)
                      } catch (err) {
                        setCustomWordScrambleWords([])
                        setPuzzleUploadError(err instanceof Error ? err.message : 'Could not read that file')
                      }
                    }}
                  />
                )}
                {categoryUploadField}
                {questionSource === 'platform' && (
                  <Field label="Theme">
                    <CustomSelect
                      value={wordScrambleTheme}
                      onChange={(val) => {
                        const v = String(val)
                        setWordScrambleTheme(v)
                        const locked = lockedPuzzleDifficulty(v)
                        if (locked) setWordScrambleDifficulty(locked)
                      }}
                      options={[
                        ...wordScrambleThemeOptions().map((t) => ({ value: t.id, label: t.label })),
                        ...puzzleThemes.map((t) => ({
                          value: `pt:${t.id}`,
                          label: `${t.name}${t.difficulty ? ` (${t.difficulty})` : ''}`,
                        })),
                      ]}
                      searchable
                    />
                  </Field>
                )}
                {
                  /* Difficulty = grid size, shown for every source (Platform/Library/Your own). */
                  <Field label="Difficulty">
                    <div className="grid grid-cols-3 gap-3">
                      {WORD_SCRAMBLE_DIFFICULTIES.map((difficulty) => (
                        <button
                          key={difficulty}
                          type="button"
                          disabled={!!wordScrambleDiffLock}
                          onClick={() => setWordScrambleDifficulty(difficulty)}
                          className={[
                            'rounded-2xl border-2 px-4 py-3 text-center capitalize',
                            wordScrambleDifficulty === difficulty
                              ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                              : 'border-[var(--border-strong)] text-muted',
                            wordScrambleDiffLock ? 'opacity-50' : '',
                          ].join(' ')}
                        >
                          <span className="font-bold block text-base">{difficulty}</span>
                        </button>
                      ))}
                    </div>
                    {wordScrambleDiffLock ? (
                      <p className="mt-2 text-xs text-muted">Difficulty is set by this theme.</p>
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        Sets the word length — easy uses short words, hard uses longer ones.
                      </p>
                    )}
                  </Field>
                }
                <Field label="Max time limit">
                  <CustomSelect
                    value={wordScrambleGameDuration}
                    onChange={setWordScrambleGameDuration}
                    options={WORD_SCRAMBLE_GAME_DURATION_OPTIONS.map((seconds) => ({
                      value: seconds,
                      label: seconds === 0 ? 'No timer' : formatWordScrambleGameDuration(seconds),
                    }))}
                  />
                </Field>
                {showViewerToggle && (
                  <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="word_scramble" />
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Everyone races the same jumbled words. Type the answer fastest — each solve scores points, with a
                  speed bonus for solving first and extra for longer words.
                </p>
              </SettingsGroup>
            ) : isWordGrouping ? (
              <SettingsGroup title="Word Grouping room">
                <Field
                  label={`Max players (${effectiveLimits.word_grouping.min}–${effectiveLimits.word_grouping.max})`}
                >
                  <select
                    value={wordGroupingMaxPlayers}
                    onChange={(e) => setWordGroupingMaxPlayers(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {playerCountOptions(effectiveLimits.word_grouping.min, effectiveLimits.word_grouping.max).map(
                      (n) => (
                        <option key={n} value={n}>
                          {n} players
                        </option>
                      )
                    )}
                  </select>
                </Field>
                <Field label="Answers & clues">
                  <SegmentedControl
                    value={questionSource}
                    onChange={(v) => {
                      setQuestionSource(v as QuestionSource)
                      setSelectedPackId(null)
                      setLibraryPackQuestions([])
                      setPuzzleUploadError(null)
                      setPuzzleUploadSummary(null)
                    }}
                    options={questionSourceOptions('word_grouping')}
                  />
                </Field>
                {questionSource === 'library' && (
                  <div className="space-y-2 pt-1">
                    <LibraryPackPicker
                      loading={libraryPacksLoading}
                      packs={libraryPacks}
                      search={libraryPackSearch}
                      onSearchChange={setLibraryPackSearch}
                      selectedPackId={selectedPackId}
                      onSelect={selectLibraryPack}
                      noun="puzzles"
                    />
                  </div>
                )}
                {categoryUploadField}
                <Field label="Max time limit">
                  <select
                    value={wordGroupingGameDuration}
                    onChange={(e) => setWordGroupingGameDuration(Number(e.target.value))}
                    className="input-field w-full"
                  >
                    {WORD_GROUPING_GAME_DURATION_OPTIONS.map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds === 0 ? 'No timer' : formatWordGroupingGameDuration(seconds)}
                      </option>
                    ))}
                  </select>
                </Field>
                {showViewerToggle && (
                  <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="word_grouping" />
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Everyone gets the same 16 words in 4 hidden groups. Find all 4 groups with the fewest mistakes —
                  harder groups score more points, and the first to find each group gets a bonus.
                </p>
              </SettingsGroup>
            ) : isCrossword ? (
              <SettingsGroup title="Crossword room">
                <Field label={`Max players (${effectiveLimits.crossword.min}–${effectiveLimits.crossword.max})`}>
                  <CustomSelect
                    value={crosswordMaxPlayers}
                    onChange={setCrosswordMaxPlayers}
                    options={playerCountOptions(effectiveLimits.crossword.min, effectiveLimits.crossword.max).map(
                      (n) => ({
                        value: n,
                        label: `${n} players`,
                      })
                    )}
                  />
                </Field>
                <Field label="Answers & clues">
                  <SegmentedControl
                    value={questionSource}
                    onChange={(v) => {
                      setQuestionSource(v as QuestionSource)
                      setSelectedPackId(null)
                      setLibraryPackQuestions([])
                      setPuzzleUploadError(null)
                      setPuzzleUploadSummary(null)
                      if (v !== questionSource) setCustomCrosswordEntries([])
                    }}
                    options={questionSourceOptions('crossword')}
                  />
                </Field>
                {questionSource === 'library' && (
                  <div className="space-y-2 pt-1">
                    <LibraryPackPicker
                      loading={libraryPacksLoading}
                      packs={libraryPacks}
                      search={libraryPackSearch}
                      onSearchChange={setLibraryPackSearch}
                      selectedPackId={selectedPackId}
                      onSelect={selectLibraryPack}
                      noun="answers"
                    />
                    {customCrosswordEntries.length > 0 && (
                      <p className="text-faint text-xs text-center">
                        Loaded {customCrosswordEntries.length} answers from this pack.
                      </p>
                    )}
                  </div>
                )}
                {questionSource === 'custom' && (
                  <PuzzleUpload
                    sample={questionSampleFile('crossword')}
                    hint={questionUploadHint('crossword')}
                    buttonLabel="Choose CSV"
                    fileRef={crosswordFileRef}
                    error={puzzleUploadError}
                    summary={puzzleUploadSummary}
                    onFile={async (file) => {
                      setPuzzleUploadError(null)
                      setPuzzleUploadSummary(null)
                      try {
                        const result = parseCrosswordEntryImport(await file.text())
                        if (result.questions.length < 4) throw new Error('Need at least 4 answers with clues')
                        setCustomCrosswordEntries(result.questions)
                        const extra = formatEntryImportSummary(result)
                        setPuzzleUploadSummary(`${result.questions.length} answers loaded${extra ? ` · ${extra}` : ''}`)
                      } catch (err) {
                        setCustomCrosswordEntries([])
                        setPuzzleUploadError(err instanceof Error ? err.message : 'Could not read that file')
                      }
                    }}
                  />
                )}
                {categoryUploadField}
                {questionSource === 'platform' && (
                  <Field label="Theme">
                    <CustomSelect
                      value={crosswordTheme}
                      onChange={(val) => {
                        const v = String(val)
                        setCrosswordTheme(v)
                        const locked = lockedPuzzleDifficulty(v)
                        if (locked) setCrosswordDifficulty(locked)
                      }}
                      options={[
                        ...crosswordThemeOptions().map((t) => ({ value: t.id, label: t.label })),
                        ...puzzleThemes.map((t) => ({
                          value: `pt:${t.id}`,
                          label: `${t.name}${t.difficulty ? ` (${t.difficulty})` : ''}`,
                        })),
                      ]}
                      searchable
                    />
                  </Field>
                )}
                {
                  /* Difficulty = grid size, shown for every source (Platform/Library/Your own). */
                  <Field label="Difficulty">
                    <div className="grid grid-cols-3 gap-3">
                      {CROSSWORD_DIFFICULTIES.map((difficulty) => (
                        <button
                          key={difficulty}
                          type="button"
                          disabled={!!crosswordDiffLock}
                          onClick={() => setCrosswordDifficulty(difficulty)}
                          className={[
                            'rounded-2xl border-2 px-4 py-3 text-center capitalize',
                            crosswordDifficulty === difficulty
                              ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                              : 'border-[var(--border-strong)] text-muted',
                            crosswordDiffLock ? 'opacity-50' : '',
                          ].join(' ')}
                        >
                          <span className="font-bold block text-base">{difficulty}</span>
                        </button>
                      ))}
                    </div>
                    {crosswordDiffLock ? (
                      <p className="mt-2 text-xs text-muted">Difficulty is set by this theme.</p>
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        Sets the grid size and number of words — not how tricky the words are.
                      </p>
                    )}
                  </Field>
                }
                <Field label="Max time limit">
                  <CustomSelect
                    value={crosswordGameDuration}
                    onChange={setCrosswordGameDuration}
                    options={CROSSWORD_GAME_DURATION_OPTIONS.map((seconds) => ({
                      value: seconds,
                      label: seconds === 0 ? 'No timer' : formatCrosswordGameDuration(seconds),
                    }))}
                  />
                </Field>
                {showViewerToggle && (
                  <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="crossword" />
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Race to fill the shared crossword. Each word you complete first scores points; reveal a letter for a
                  small penalty. Fastest solver — or the highest score when time runs out — wins.
                </p>
              </SettingsGroup>
            ) : isSudoku ? (
              <SettingsGroup title="Sudoku room">
                <Field label={`Max players (${effectiveLimits.sudoku.min}–${effectiveLimits.sudoku.max})`}>
                  <CustomSelect
                    value={sudokuMaxPlayers}
                    onChange={setSudokuMaxPlayers}
                    options={playerCountOptions(effectiveLimits.sudoku.min, effectiveLimits.sudoku.max).map((n) => ({
                      value: n,
                      label: `${n} players`,
                    }))}
                  />
                </Field>
                <Field label="Max time limit">
                  <CustomSelect
                    value={sudokuGameDuration}
                    onChange={setSudokuGameDuration}
                    options={SUDOKU_GAME_DURATION_OPTIONS.map((seconds) => ({
                      value: seconds,
                      label: seconds === 0 ? 'No timer' : formatSudokuGameDuration(seconds),
                    }))}
                  />
                </Field>
                {showViewerToggle && (
                  <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="sudoku" />
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Race to solve the 9×9 puzzle block by block. First to claim a block gets 10 pts, second 6, third 3,
                  rest 1. Wrong answer? −3 pts, but you can try that block again.
                </p>
              </SettingsGroup>
            ) : isWordHunt ? (
              <SettingsGroup title="Word Hunt room">
                <Field label={`Max players (${effectiveLimits.word_hunt.min}–${effectiveLimits.word_hunt.max})`}>
                  <CustomSelect
                    value={wordHuntMaxPlayers}
                    onChange={setWordHuntMaxPlayers}
                    options={playerCountOptions(effectiveLimits.word_hunt.min, effectiveLimits.word_hunt.max).map(
                      (n) => ({
                        value: n,
                        label: `${n} players`,
                      })
                    )}
                  />
                </Field>
                <Field label="Time limit">
                  <CustomSelect
                    value={wordHuntTimer}
                    onChange={setWordHuntTimer}
                    options={[
                      { value: 60, label: '1 minute' },
                      { value: 120, label: '2 minutes' },
                      { value: 180, label: '3 minutes' },
                      { value: 300, label: '5 minutes' },
                    ]}
                  />
                </Field>
                {showViewerToggle && (
                  <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="word_hunt" />
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Everyone races on the same 4×4 letter grid. Connect adjacent letters to spell valid words — 3 letters
                  = 100 pts, 4 = 400, 5 = 800, and longer words score even more.
                </p>
              </SettingsGroup>
            ) : isMafia ? (
              <SettingsGroup title="Mafia room">
                <Field label={`Max players (${effectiveLimits.mafia.min}–${effectiveLimits.mafia.max})`}>
                  <CustomSelect
                    value={settings.max_players ?? 10}
                    onChange={(val) => setSettings({ ...settings, max_players: val })}
                    options={playerCountOptions(effectiveLimits.mafia.min, effectiveLimits.mafia.max).map((n) => ({
                      value: n,
                      label: `${n} players`,
                    }))}
                  />
                </Field>
                <Field label="Night timer">
                  <CustomSelect
                    value={settings.timer_seconds ?? 60}
                    onChange={(seconds) => setSettings((current) => ({ ...current, timer_seconds: seconds }))}
                    options={[
                      { value: 30, label: '30 seconds' },
                      { value: 45, label: '45 seconds' },
                      { value: 60, label: '1 minute' },
                      { value: 90, label: '1.5 minutes' },
                      { value: 120, label: '2 minutes' },
                      { value: 180, label: '3 minutes' },
                    ]}
                  />
                  <p className="text-faint text-xs mt-1.5">How long night-action roles get to submit their move.</p>
                </Field>
                <Field label="Day discussion timer">
                  <CustomSelect
                    value={settings.mafia_day_seconds ?? 90}
                    onChange={(seconds) => setSettings((current) => ({ ...current, mafia_day_seconds: seconds }))}
                    options={[
                      { value: 45, label: '45 seconds' },
                      { value: 60, label: '1 minute' },
                      { value: 90, label: '1.5 minutes' },
                      { value: 120, label: '2 minutes' },
                      { value: 180, label: '3 minutes' },
                      { value: 300, label: '5 minutes' },
                    ]}
                  />
                  <p className="text-faint text-xs mt-1.5">How long the town gets to talk before voting opens.</p>
                </Field>
                <Field label="Voting timer">
                  <CustomSelect
                    value={settings.mafia_voting_seconds ?? 45}
                    onChange={(seconds) => setSettings((current) => ({ ...current, mafia_voting_seconds: seconds }))}
                    options={[
                      { value: 20, label: '20 seconds' },
                      { value: 30, label: '30 seconds' },
                      { value: 45, label: '45 seconds' },
                      { value: 60, label: '1 minute' },
                      { value: 90, label: '1.5 minutes' },
                    ]}
                  />
                  <p className="text-faint text-xs mt-1.5">How long players get to cast their lynch vote.</p>
                </Field>
                <Field label="Role set">
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, mafia_advanced_mode: false }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                        settings.mafia_advanced_mode !== true
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                          : 'border-[var(--border)] text-muted'
                      }`}
                    >
                      Classic
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, mafia_advanced_mode: true }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                        settings.mafia_advanced_mode === true
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                          : 'border-[var(--border)] text-muted'
                      }`}
                    >
                      Advanced
                    </button>
                  </div>
                  <p className="text-faint text-xs mt-1.5">
                    {settings.mafia_advanced_mode === true
                      ? 'Trapper, Arsonist, and Vigilante replace Bodyguard, Serial Killer, and Priest — Witch and Little Girl join the mix too.'
                      : 'The classic power roles: Bodyguard, Serial Killer, and Priest.'}
                  </p>
                  <p className="text-faint text-xs mt-1.5">
                    Everything else is automatic — Aura Seer/Seer/Detective rotate (only 2 of the 3 each game), and the
                    Mafia&apos;s specialist lineup varies too.
                  </p>
                </Field>
                <Field label="Voting Rules">
                  <div className="mt-2">
                    <Toggle
                      label="Anonymous Votes"
                      description="Hide who voted for whom during the day phase"
                      value={settings.mafia_anonymous_votes !== false}
                      onChange={(v) => setSettings((s) => ({ ...s, mafia_anonymous_votes: v }))}
                    />
                  </div>
                </Field>
                {showViewerToggle && (
                  <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="mafia" />
                )}
                <p className="text-faint text-sm leading-relaxed">
                  Social deduction game. The Mafia tries to eliminate the Villagers without getting caught, while the
                  Villagers use deduction and power roles (Doctor, Detective) to vote out the Mafia.
                </p>
              </SettingsGroup>
            ) : isMatchingPairs ? (
              <SettingsGroup title="Matching Pairs room">
                <Field
                  label={`Max players (${effectiveLimits.matching_pairs.min}–${effectiveLimits.matching_pairs.max})`}
                >
                  <CustomSelect
                    value={settings.max_players ?? effectiveLimits.matching_pairs.max}
                    onChange={(val) => setSettings({ ...settings, max_players: val })}
                    options={playerCountOptions(
                      effectiveLimits.matching_pairs.min,
                      effectiveLimits.matching_pairs.max
                    ).map((n) => ({ value: n, label: `${n} players` }))}
                  />
                </Field>
                <Field label="Time limit">
                  <CustomSelect
                    value={settings.timer_seconds ?? 0}
                    onChange={(val) => setSettings({ ...settings, timer_seconds: val })}
                    options={MATCHING_PAIRS_GAME_DURATION_OPTIONS.map((s) => ({
                      value: s,
                      label: formatMatchingPairsGameDuration(s),
                    }))}
                  />
                </Field>
                <Field label="Rounds">
                  <CustomSelect
                    value={settings.rounds_count ?? 1}
                    onChange={(val) => setSettings({ ...settings, rounds_count: val })}
                    options={[1, 2, 3, 5, 10].map((n) => ({
                      value: n,
                      label: `${n} round${n === 1 ? '' : 's'}`,
                    }))}
                  />
                  <p className="text-faint text-xs mt-1">Scores accumulate across all rounds.</p>
                </Field>
                <Field label="Grid size">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, game_duration_seconds: 0 })}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        (settings.game_duration_seconds ?? 0) === 0
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Standard</span>
                      <span className="text-faint text-xs sm:text-sm">4×4 grid (8 pairs)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, game_duration_seconds: 16 })}
                      className={[
                        'rounded-2xl border-2 px-4 py-4 text-left',
                        (settings.game_duration_seconds ?? 0) === 16
                          ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                          : 'border-[var(--border-strong)] text-muted',
                      ].join(' ')}
                    >
                      <span className="font-bold block text-base">Large</span>
                      <span className="text-faint text-xs sm:text-sm">8×4 grid (16 pairs)</span>
                    </button>
                  </div>
                </Field>
                {showViewerToggle && (
                  <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} gameType="matching_pairs" />
                )}
                <Field label="Public game">
                  <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, isPublic: false })}
                      className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-semibold transition-colors ${
                        !settings.isPublic ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
                      }`}
                    >
                      <Glyph icon={LockIcon} size={15} />
                      Private
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, isPublic: true })}
                      className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-semibold transition-colors ${
                        settings.isPublic ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
                      }`}
                    >
                      <Glyph icon={GlobeIcon} size={15} />
                      Public
                    </button>
                  </div>
                  <p className="text-faint text-xs mt-2">
                    List in Browse so anyone can find and join. Off keeps it invite-only via the share link.
                  </p>
                </Field>
                <p className="text-faint text-sm leading-relaxed">
                  Flip cards and find matching pairs. Race to complete the grid with the most matches. Streaks earn
                  bonus points — every 3 in a row gives extra points.
                </p>
              </SettingsGroup>
            ) : (
              <>
                <SettingsGroup title="Round settings">
                  {isTrivia && (
                    <Field label={`Max players (${effectiveLimits.trivia.min}–${effectiveLimits.trivia.max})`}>
                      <CustomSelect
                        value={triviaMaxPlayers}
                        onChange={setTriviaMaxPlayers}
                        options={playerCountOptions(effectiveLimits.trivia.min, effectiveLimits.trivia.max).map(
                          (n) => ({
                            value: n,
                            label: `${n} players`,
                          })
                        )}
                      />
                    </Field>
                  )}
                  {isTrivia && showViewerToggle && (
                    <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} />
                  )}
                  {isWst ? (
                    <div className="space-y-4">
                      <Field label="Questions">
                        <SegmentedControl
                          value={wstQuoteSource === 'player' ? 'player' : questionSource}
                          onChange={(v) => {
                            if (v === 'player') {
                              setWstQuoteSource('player')
                            } else {
                              setWstQuoteSource('deck')
                              setQuestionSource(v as QuestionSource)
                            }
                          }}
                          options={[
                            {
                              value: 'player',
                              label: 'Players submit',
                              hint: 'Everyone writes a quote + 4 options in the lobby',
                            },
                            { value: 'platform', label: 'Platform', hint: 'Our built-in pack of famous quotes' },
                            { value: 'library', label: 'Library', hint: 'Pick a community quote pack (e.g. anime)' },
                            {
                              value: 'custom',
                              label: 'Your own',
                              hint: 'Upload a CSV of quotes, options, and answers',
                            },
                          ]}
                        />
                      </Field>
                      {wstQuoteSource === 'player' ? (
                        <p className="text-faint text-sm leading-relaxed">
                          Players join and each submits a quote with four options (A–D) and marks the answer. When you
                          start, everyone answers the pooled questions — fastest correct wins.
                        </p>
                      ) : questionSource === 'platform' ? (
                        <p className="text-faint text-sm leading-relaxed">
                          {WST_PLATFORM_DECK.length} famous quotes are built in — players just join and answer like
                          trivia, fastest correct wins. No setup needed.
                        </p>
                      ) : questionSource === 'library' ? (
                        <LibraryPackPicker
                          loading={libraryPacksLoading}
                          packs={libraryPacks}
                          search={libraryPackSearch}
                          onSearchChange={setLibraryPackSearch}
                          selectedPackId={selectedPackId}
                          onSelect={selectLibraryPack}
                        />
                      ) : (
                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={() => wstDeckFileRef.current?.click()}
                            className="btn-secondary w-full py-2.5 text-sm"
                          >
                            {wstDeck.length > 0
                              ? `Replace deck (${wstDeck.length} questions)`
                              : 'Upload deck (CSV or Excel)'}
                          </button>
                          <input
                            ref={wstDeckFileRef}
                            type="file"
                            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="hidden"
                            onChange={handleWstDeckUpload}
                          />
                          {wstDeckError ? <p className="text-xs text-red-400">{wstDeckError}</p> : null}
                          <p className="text-faint text-xs leading-relaxed">
                            Columns:{' '}
                            <span className="font-mono">quote, option_a, option_b, option_c, option_d, correct</span>.
                            The <span className="font-mono">correct</span> column is the answer letter (A–D). Players
                            just join and answer like trivia — fastest correct wins.
                          </p>
                          {categoryUploadField}
                        </div>
                      )}
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
                    <LateJoinField value={lateJoinPolicy} onChange={setLateJoinPolicy} />
                  )}
                </SettingsGroup>

                {isLobbyQuestions && (
                  <SettingsGroup title="Questions">
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
                      </>
                    )}

                    {isLobbyQuestions && (
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

                    {isTrivia && questionSource === 'platform' && (
                      <Field label="Category">
                        <CustomSelect
                          value={triviaCategory}
                          onChange={(v) => setTriviaCategory(v as TriviaCategory)}
                          searchable
                          options={[
                            { value: 'general', label: 'General (All Categories)' },
                            { value: 'tech', label: 'Tech' },
                            { value: 'art', label: 'Art' },
                            { value: 'food', label: 'Food' },
                            { value: 'geography', label: 'Geography' },
                            { value: 'history', label: 'History' },
                            { value: 'language', label: 'Language' },
                            { value: 'literature', label: 'Literature' },
                            { value: 'math', label: 'Math' },
                            { value: 'movies', label: 'Movies' },
                            { value: 'music', label: 'Music' },
                            { value: 'nature', label: 'Nature' },
                            { value: 'pop_culture', label: 'Pop Culture' },
                            { value: 'science', label: 'Science' },
                            { value: 'sports', label: 'Sports' },
                            { value: 'technology', label: 'Technology' },
                            { value: 'world_culture', label: 'World Culture' },
                          ]}
                        />
                      </Field>
                    )}

                    {questionSource === 'custom' && questionCustomHint && (
                      <CustomContentAiTip hint={questionCustomHint} />
                    )}

                    {isLobbyQuestions && questionSource === 'library' && (
                      <div className="space-y-2 pt-1">
                        <LibraryPackPicker
                          loading={libraryPacksLoading}
                          packs={libraryPacks}
                          search={libraryPackSearch}
                          onSearchChange={setLibraryPackSearch}
                          selectedPackId={selectedPackId}
                          onSelect={selectLibraryPack}
                        />
                      </div>
                    )}

                    {isLobbyQuestions && questionSource === 'custom' && (
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
                            {
                              value: 'ai',
                              label: 'Generate with AI',
                              hint: 'Give a theme, get a ready-made set in seconds.',
                            },
                          ]}
                        />

                        {questionTab === 'upload' ? (
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => questionsFileRef.current?.click()}
                              className="btn-secondary w-full py-2.5 text-sm"
                            >
                              Choose file
                            </button>
                            <input
                              ref={questionsFileRef}
                              type="file"
                              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                              className="hidden"
                              onChange={handleQuestionsFileUpload}
                            />
                          </div>
                        ) : questionTab === 'ai' ? (
                          <AiQuestionsGenerator
                            gameType={settings.game_type as AiQuestionGameType}
                            triviaCategory={isTrivia ? triviaCategory : undefined}
                            noun={isTrivia ? 'questions' : 'prompts'}
                            onThemeChange={handleAiThemeChange}
                            defaultCount={Math.min(50, Math.max(settings.rounds_count ?? 10, 10))}
                            onGenerated={(questions) => {
                              setQuestionsUploadError(null)
                              if (isWyr || isTot) setCustomWyrQuestions(questions as WyrQuestion[])
                              else if (isTrivia) setCustomTriviaQuestions(questions as TriviaQuestion[])
                              else setCustomMltQuestions(questions as string[])
                            }}
                          />
                        ) : (
                          <div className="space-y-3">
                            {/* Trivia needs structured input (question + 4 options + correct answer),
                                so it has no single-field add — use bulk paste or CSV upload below. */}
                            {!isTrivia && (
                              <>
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
                              </>
                            )}
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
                                      : isTrivia
                                        ? 'Paste questions (question, option A, B, C, D, correct):\nWhat is the capital of France?, London, Paris, Rome, Berlin, Paris'
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
                        {categoryUploadField}
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
                    !isLandmine &&
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
                  !isLandmine &&
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

                {/* The "Advanced" group (timer-behavior / anonymous / auto-reveal) is hidden from
                    the create screen — the defaults in the initial settings state are used as-is. */}
              </>
            )}

            {isEliminationCompatible && (
              <SettingsGroup title="Elimination">
                <div className="space-y-3">
                  <Toggle
                    label="Enable elimination"
                    description="Knock players out as the game goes on"
                    value={eliminationEnabled}
                    onChange={setEliminationEnabled}
                  />

                  {eliminationEnabled && (
                    <div className="surface-inset rounded-xl p-4 space-y-4 animate-stagger">
                      <SegmentedControl
                        value={eliminationMode}
                        onChange={setEliminationMode}
                        options={[
                          { value: 'per-round', label: 'Per-Round', hint: 'Eliminate players every round' },
                          { value: 'lives', label: 'Lives', hint: 'Players start with lives and lose them over time' },
                        ]}
                      />

                      {eliminationMode === 'per-round' && (
                        <div className="space-y-3">
                          <SegmentedControl
                            value={eliminationRule}
                            onChange={setEliminationRule}
                            options={[
                              { value: 'bottom-n', label: 'Bottom N' },
                              { value: 'score-threshold', label: 'Score Threshold' },
                            ]}
                          />

                          {eliminationRule === 'bottom-n' ? (
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-body text-sm font-medium">Eliminate per round</p>
                                <p className="text-faint text-xs mt-0.5">Lowest scorers each round are out</p>
                              </div>
                              <input
                                type="number"
                                aria-label="Players eliminated per round"
                                min={1}
                                max={10}
                                value={eliminateCount}
                                onChange={(e) => setEliminateCount(Number(e.target.value) || 1)}
                                className="input-field w-20 text-center"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-body text-sm font-medium">Score threshold</p>
                                <p className="text-faint text-xs mt-0.5">Players below this score are out</p>
                              </div>
                              <input
                                type="number"
                                aria-label="Elimination score threshold"
                                min={0}
                                value={scoreThreshold}
                                onChange={(e) => setScoreThreshold(Number(e.target.value) || 0)}
                                className="input-field w-24 text-center"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {eliminationMode === 'lives' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-body text-sm font-medium">Starting lives</p>
                              <p className="text-faint text-xs mt-0.5">How many each player begins with</p>
                            </div>
                            <input
                              type="number"
                              aria-label="Starting lives"
                              min={1}
                              max={10}
                              value={startingLives}
                              onChange={(e) => setStartingLives(Number(e.target.value) || 3)}
                              className="input-field w-20 text-center"
                            />
                          </div>
                          <div className="divider-soft" />
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-body text-sm font-medium">Lose life (bottom N)</p>
                              <p className="text-faint text-xs mt-0.5">Lowest scorers lose a life each round</p>
                            </div>
                            <input
                              type="number"
                              aria-label="Players who lose a life each round"
                              min={1}
                              max={10}
                              value={eliminateCount}
                              onChange={(e) => setEliminateCount(Number(e.target.value) || 1)}
                              className="input-field w-20 text-center"
                            />
                          </div>
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
                  : formatThemedText(gameHowItWorks(settings.game_type, settings.participant_mode), settings.theme)}
              </p>
            </SettingsGroup>
          </div>

          {templatableGame(settings.game_type) && (
            <>
              <button
                type="button"
                onClick={() => openSaveTemplateModal()}
                className="btn-secondary w-full py-2.5 text-sm"
              >
                Save current settings as template
              </button>
              <SaveTemplateModal
                open={templateModal.open}
                slots={templateSlots ?? [null, null]}
                presetSlot={templateModal.presetSlot}
                onClose={() => setTemplateModal({ open: false, presetSlot: null })}
                onConfirm={confirmSaveTemplate}
              />
            </>
          )}

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
          gameType={settings.game_type}
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
              {uploadError && <p className="text-red-400 text-sm">{uploadError}</p>}
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

  // Every create step renders above. Once a game is created we navigate straight to
  // /host/[code], so there is no post-create screen to render here.
  return null
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
