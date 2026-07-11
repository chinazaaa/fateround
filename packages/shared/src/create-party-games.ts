import type {
  DescribeItMode,
  GameType,
  PairVoteMode,
  QuickDrawPlayMode,
  QuickDrawVariant,
  TriviaCategory,
  WordRushDifficulty,
  WordRushMode,
  WordRushPromptMode,
} from './types'
import {
  BATCH_2_POLL_GAMES,
  isPairGame,
  isPickANumber,
  isThreeChoiceGame,
  isUnaryPollGame,
  isWhoSaidThis,
  parsePairVoteMode,
} from './poll-games'

export type BingoCallMode = 'manual' | 'auto'
export const POLL_DEFAULT_ROUNDS = 3
export const POLL_ROUND_TIMER_OPTIONS = [15, 30, 60] as const
export const POLL_DEFAULT_TIMER = 30
export const STANDARD_ROUND_OPTIONS = [2, 3, 4, 5, 6, 8, 10] as const

export const TRIVIA_DEFAULT_ROUNDS = 10
export const TRIVIA_DEFAULT_TIMER = 10
export const TRIVIA_TIMER_OPTIONS = [10, 15, 30, 60] as const
export const TRIVIA_MIN_ROUNDS = 3
export const TRIVIA_MAX_ROUNDS = 25
/** Platform trivia pool size — caps round picker on mobile create. */
export const TRIVIA_PLATFORM_QUESTION_CAP = 40

export const BINGO_DEFAULT_CALL_MODE: BingoCallMode = 'auto'
export const BINGO_CALL_INTERVAL_OPTIONS = [3, 5, 8, 10, 15] as const
export const BINGO_DEFAULT_CALL_INTERVAL = 5

export const QUICK_DRAW_DEFAULT_ROUNDS = 3
export const QUICK_DRAW_MIN_ROUNDS = 2
export const QUICK_DRAW_MAX_ROUNDS = 5
export const QUICK_DRAW_DEFAULT_DRAW_TIMER = 90
export const QUICK_DRAW_DEFAULT_TITLE_TIMER = 45
export const QUICK_DRAW_DEFAULT_VOTE_TIMER = 20
export const QUICK_DRAW_DRAW_TIMER_OPTIONS = [60, 75, 90, 120] as const
export const QUICK_DRAW_TITLE_TIMER_OPTIONS = [30, 45, 60, 90] as const
export const QUICK_DRAW_VOTE_TIMER_OPTIONS = [15, 20, 30, 45] as const

export const CODEWORDS_DEFAULT_SPYMASTER_TIMER = 60
export const CODEWORDS_DEFAULT_OPERATIVE_TIMER = 60
export const CODEWORDS_TIMER_OPTIONS = [30, 45, 60, 90, 120] as const

export type CodewordsTeamAssignment = 'players' | 'host' | 'randomize'

export const MAFIA_PHASE_TIMER_OPTIONS = [30, 45, 60, 90, 120, 180] as const
export const MAFIA_DEFAULT_PHASE_TIMER = 60

export const DESCRIBE_IT_ROUND_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 10] as const
export const DESCRIBE_IT_TURN_OPTIONS = [60, 90, 120] as const

export const HOT_SEAT_MIN_PLAYERS = 2
export const HOT_SEAT_DEFAULT_MAX_ROUNDS = 20

export const PAN_MAX_ROUNDS = 100
export const PAN_DEFAULT_ROUNDS = 5

export const MATCHING_PAIRS_ROUND_OPTIONS = [1, 2, 3, 5, 10] as const
export const MATCHING_PAIRS_GAME_DURATION_OPTIONS = [0, 30, 45, 60, 120, 180, 300, 600] as const

export const SUDOKU_GAME_DURATION_OPTIONS = [0, 300, 600, 900, 1200, 1800] as const

/** Most Likely To platform pool — approximate cap for round picker. */
export const MLT_PLATFORM_ROUND_CAP = 20

export const BATCH_20_PARTY_GAMES: GameType[] = [
  'would_you_rather',
  'this_or_that',
  'never_have_i_ever',
  'most_likely_to',
  'smash_marry_kill',
  'smash_or_pass',
  'red_flag_green_flag',
  'pick_a_number',
  'parent_approval',
  'trivia',
  'bingo',
  'quiplash',
  'quick_draw',
  'describe_it',
  'word_rush',
  'two_truths',
  'hot_seat',
  'mafia',
  'codewords',
  'word_hunt',
  'sudoku',
  'matching_pairs',
  'i_call_on',
]

export function hasPartyRoomSettings(gameType: GameType): boolean {
  return BATCH_20_PARTY_GAMES.includes(gameType)
}

export function isPollPartyGame(gameType: GameType): boolean {
  return BATCH_2_POLL_GAMES.includes(gameType) && !isWhoSaidThis(gameType)
}

export function supportsGenderToggle(gameType: GameType | string | undefined): boolean {
  return isThreeChoiceGame(gameType) || isPairGame(gameType) || isUnaryPollGame(gameType)
}

export function defaultGenderBasedForType(gameType: GameType | string | undefined): boolean {
  return supportsGenderToggle(gameType)
}

export function pairVoteModeOptions(gameType: GameType | string): {
  value: PairVoteMode
  label: string
  hint: string
}[] {
  const type = gameType as GameType
  const positive = type === 'smash_or_pass' ? 'Smash' : 'Green'
  const negative = type === 'smash_or_pass' ? 'Pass' : 'Red'
  return [
    {
      value: 'one_each',
      label: 'One each',
      hint: `Must pick one ${positive} and one ${negative} every round.`,
    },
    {
      value: 'any',
      label: 'Any',
      hint: `Pick any mix of ${positive} and ${negative}.`,
    },
  ]
}

export function questionRoundPickerOptions(max: number): number[] {
  const cap = Math.max(max, 0)
  if (cap <= 0) return []
  const presets = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50, 60, 80, 100]
  const opts = presets.filter((n) => n <= cap)
  return opts.includes(cap) ? opts : [...opts, cap]
}

export function partyRoundCap(gameType: GameType): number {
  if (gameType === 'trivia') return Math.min(TRIVIA_PLATFORM_QUESTION_CAP, TRIVIA_MAX_ROUNDS)
  if (gameType === 'most_likely_to') return MLT_PLATFORM_ROUND_CAP
  if (isPickANumber(gameType)) return PAN_MAX_ROUNDS
  if (gameType === 'quiplash') return 5
  if (gameType === 'quick_draw') return QUICK_DRAW_MAX_ROUNDS
  if (gameType === 'describe_it') return 10
  if (gameType === 'word_rush') return 10
  if (gameType === 'matching_pairs') return 10
  if (gameType === 'hot_seat') return HOT_SEAT_DEFAULT_MAX_ROUNDS
  return 10
}

export function partyRoundOptions(gameType: GameType): number[] {
  if (gameType === 'trivia') {
    return questionRoundPickerOptions(Math.min(TRIVIA_PLATFORM_QUESTION_CAP, TRIVIA_MAX_ROUNDS))
  }
  if (gameType === 'quiplash') return [3, 4, 5]
  if (gameType === 'quick_draw') {
    return Array.from(
      { length: QUICK_DRAW_MAX_ROUNDS - QUICK_DRAW_MIN_ROUNDS + 1 },
      (_, index) => index + QUICK_DRAW_MIN_ROUNDS
    )
  }
  if (gameType === 'describe_it') return [...DESCRIBE_IT_ROUND_OPTIONS]
  if (gameType === 'word_rush') return [3, 5, 7, 10]
  if (gameType === 'matching_pairs') return [...MATCHING_PAIRS_ROUND_OPTIONS]
  if (isPickANumber(gameType)) return questionRoundPickerOptions(PAN_MAX_ROUNDS)
  if (gameType === 'most_likely_to') return questionRoundPickerOptions(MLT_PLATFORM_ROUND_CAP)
  if (gameType === 'hot_seat') {
    return questionRoundPickerOptions(HOT_SEAT_DEFAULT_MAX_ROUNDS).filter((n) => n >= HOT_SEAT_MIN_PLAYERS)
  }
  if (isPollPartyGame(gameType)) return [...STANDARD_ROUND_OPTIONS]
  return [...STANDARD_ROUND_OPTIONS]
}

export function clampPartyRounds(gameType: GameType, value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return defaultPartyRounds(gameType)
  const cap = partyRoundCap(gameType)
  const min = gameType === 'matching_pairs' ? 1 : gameType === 'quiplash' ? 3 : 2
  return Math.min(cap, Math.max(min, n))
}

export function defaultPartyRounds(gameType: GameType): number {
  if (gameType === 'trivia') return TRIVIA_DEFAULT_ROUNDS
  if (gameType === 'quiplash') return 3
  if (gameType === 'quick_draw') return QUICK_DRAW_DEFAULT_ROUNDS
  if (gameType === 'describe_it') return 3
  if (gameType === 'word_rush') return 5
  if (gameType === 'matching_pairs') return 1
  if (isPickANumber(gameType)) return PAN_DEFAULT_ROUNDS
  if (gameType === 'hot_seat') return HOT_SEAT_DEFAULT_MAX_ROUNDS
  if (gameType === 'bingo' || gameType === 'two_truths') return 1
  return POLL_DEFAULT_ROUNDS
}

export function clampQuickDrawVariant(value: unknown): QuickDrawVariant {
  return value === 'guess' ? 'guess' : 'lie'
}

export function clampCodewordsTeamAssignment(value: unknown): CodewordsTeamAssignment {
  if (value === 'host' || value === 'randomize') return value
  return 'players'
}

export function codewordsTeamAssignmentFromFlags(
  playerPicks: boolean,
  randomizeTeams: boolean
): CodewordsTeamAssignment {
  if (randomizeTeams) return 'randomize'
  return playerPicks ? 'players' : 'host'
}

export function codewordsTeamAssignmentFlags(assignment: CodewordsTeamAssignment): {
  codewords_player_picks: boolean
  codewords_randomize_teams: boolean
} {
  if (assignment === 'randomize') return { codewords_player_picks: false, codewords_randomize_teams: true }
  if (assignment === 'host') return { codewords_player_picks: false, codewords_randomize_teams: false }
  return { codewords_player_picks: true, codewords_randomize_teams: false }
}

export function formatPollRoundTimer(seconds: number): string {
  return `${seconds}s`
}

export function formatQuickDrawTurnTimer(seconds: number): string {
  if (seconds === 60) return '1 min'
  if (seconds === 75) return '1.25 min'
  if (seconds === 90) return '1.5 min'
  if (seconds === 120) return '2 min'
  if (seconds % 60 === 0) {
    const mins = seconds / 60
    return mins === 1 ? '1 min' : `${mins} min`
  }
  return `${seconds}s`
}

export function formatMatchingPairsGameDuration(seconds: number): string {
  if (!seconds) return 'No limit'
  if (seconds < 60) return `${seconds}s`
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds}s`
}

export function formatSudokuGameDuration(seconds: number): string {
  if (!seconds) return 'No timer'
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds}s`
}

export function clampTriviaCategory(value: unknown): TriviaCategory {
  return value === 'tech' ? 'tech' : 'general'
}

export function clampBingoCallMode(value: unknown): BingoCallMode {
  return value === 'manual' ? 'manual' : 'auto'
}

export function clampBingoCallInterval(value: unknown): number {
  const n = Number(value)
  return (BINGO_CALL_INTERVAL_OPTIONS as readonly number[]).includes(n) ? n : BINGO_DEFAULT_CALL_INTERVAL
}

export { parsePairVoteMode }
