import type {
  CrosswordDifficulty,
  DescribeItMode,
  GameType,
  PairVoteMode,
  QuickDrawPlayMode,
  QuickDrawVariant,
  TriviaCategory,
  WordRushDifficulty,
  WordRushMode,
  WordRushPromptMode,
  WordSearchDifficulty,
} from '@fateround/shared'
import {
  CROSSWORD_DEFAULT_DIFFICULTY,
  CROSSWORD_DEFAULT_DURATION,
  CROSSWORD_DEFAULT_THEME,
  clampCrosswordGameDuration,
  parseCrosswordDifficulty,
} from '@fateround/shared/crossword'
import {
  WORD_SEARCH_DEFAULT_DIFFICULTY,
  WORD_SEARCH_DEFAULT_DURATION,
  WORD_SEARCH_DEFAULT_THEME,
  clampWordSearchGameDuration,
  parseWordSearchDifficulty,
} from '@fateround/shared/word-search'
import {
  WORD_SCRAMBLE_DEFAULT_DIFFICULTY,
  WORD_SCRAMBLE_DEFAULT_DURATION,
  WORD_SCRAMBLE_DEFAULT_THEME,
  clampWordScrambleGameDuration,
  parseWordScrambleDifficulty,
  type WordScrambleDifficulty,
} from '@fateround/shared/word-scramble'
import type { BingoCallMode } from '@fateround/shared/create-party-games'
import {
  clampBingoCallInterval,
  clampBingoCallMode,
  clampCodewordsTeamAssignment,
  clampPartyRounds,
  clampQuickDrawVariant,
  clampTriviaCategory,
  codewordsTeamAssignmentFlags,
  codewordsTeamAssignmentFromFlags,
  defaultGenderBasedForType,
  defaultPartyRounds,
  hasPartyRoomSettings,
  isPollPartyGame,
  MAFIA_DEFAULT_PHASE_TIMER,
  POLL_DEFAULT_TIMER,
  QUICK_DRAW_DEFAULT_DRAW_TIMER,
  QUICK_DRAW_DEFAULT_TITLE_TIMER,
  QUICK_DRAW_DEFAULT_VOTE_TIMER,
  TRIVIA_DEFAULT_TIMER,
  BATCH_20_PARTY_GAMES,
  BINGO_DEFAULT_CALL_INTERVAL,
  BINGO_DEFAULT_CALL_MODE,
  CODEWORDS_DEFAULT_OPERATIVE_TIMER,
  CODEWORDS_DEFAULT_SPYMASTER_TIMER,
  HOT_SEAT_DEFAULT_MAX_ROUNDS,
  type CodewordsTeamAssignment,
} from '@fateround/shared/create-party-games'
import {
  clampDescribeItMode,
  clampDescribeItTeams,
  DESCRIBE_IT_DEFAULT_TURN_SECONDS,
  DESCRIBE_IT_TEAM_OPTIONS,
} from '@fateround/shared/describe-it'
import {
  clampNpatGameDuration,
  clampNpatMarkingTimer,
  clampNpatTimer,
  NPAT_DEFAULT_GAME_DURATION,
  NPAT_DEFAULT_MARKING_TIMER,
  NPAT_DEFAULT_TIMER,
} from '@fateround/shared/npat'
import { isPairGame, parsePairVoteMode } from '@fateround/shared/poll-games'
import {
  QUICK_DRAW_GUESS_TEAM_OPTIONS,
  clampQuickDrawNumTeams,
  clampQuickDrawPlayMode,
} from '@fateround/shared/quick-draw-guess'
import {
  QUIPLASH_DEFAULT_SUBMIT_TIMER,
  QUIPLASH_DEFAULT_VOTE_TIMER,
  clampQuiplashSubmitTimer,
  clampQuiplashVoteTimer,
} from '@fateround/shared/quiplash'
import { TTL_DEFAULT_TIMER } from '@fateround/shared/two-truths'
import {
  clampWordRushDifficulty,
  clampWordRushMode,
  clampWordRushPromptMode,
  clampWordRushTeams,
  clampWordRushTurnSeconds,
  WORD_RUSH_DEFAULT_TURN_SECONDS,
  WORD_RUSH_TEAM_OPTIONS,
} from '@fateround/shared/word-rush'
import { WORD_HUNT_DEFAULT_TIMER } from '@fateround/shared/word-hunt'

export { BATCH_20_PARTY_GAMES, hasPartyRoomSettings, isPollPartyGame }

export type PartyRoomSettings = {
  roundsCount: number
  timerSeconds: number
  anonymous: boolean
  genderBased: boolean
  pairVoteMode: PairVoteMode
  triviaCategory: TriviaCategory
  bingoCallMode: BingoCallMode
  bingoCallInterval: number
  quiplashVoteTimer: number
  quickDrawVariant: QuickDrawVariant
  quickDrawPlayMode: QuickDrawPlayMode
  quickDrawNumTeams: number
  quickDrawTitleTimer: number
  quickDrawVoteTimer: number
  describeItMode: DescribeItMode
  describeItNumTeams: number
  wordRushMode: WordRushMode
  wordRushPromptMode: WordRushPromptMode
  wordRushDifficulty: WordRushDifficulty
  wordRushNumTeams: number
  codewordsOperativeTimer: number
  codewordsTeamAssignment: CodewordsTeamAssignment
  mafiaDoctorEnabled: boolean
  mafiaDetectiveEnabled: boolean
  mafiaAnonymousVotes: boolean
  npatMarkingTimer: number
  gameDurationSeconds: number
  matchingPairsLargeGrid: boolean
  crosswordTheme: string
  crosswordDifficulty: CrosswordDifficulty
  wordSearchTheme: string
  wordSearchDifficulty: WordSearchDifficulty
  wordScrambleTheme: string
  wordScrambleDifficulty: WordScrambleDifficulty
}

export function defaultPartyRoomSettings(gameType: GameType): PartyRoomSettings {
  return {
    roundsCount: defaultPartyRounds(gameType),
    timerSeconds: defaultTimerForGame(gameType),
    anonymous: true,
    genderBased: defaultGenderBasedForType(gameType),
    pairVoteMode: 'one_each',
    triviaCategory: 'general',
    bingoCallMode: BINGO_DEFAULT_CALL_MODE,
    bingoCallInterval: BINGO_DEFAULT_CALL_INTERVAL,
    quiplashVoteTimer: QUIPLASH_DEFAULT_VOTE_TIMER,
    quickDrawVariant: 'guess',
    quickDrawPlayMode: 'team',
    quickDrawNumTeams: 2,
    quickDrawTitleTimer: QUICK_DRAW_DEFAULT_TITLE_TIMER,
    quickDrawVoteTimer: QUICK_DRAW_DEFAULT_VOTE_TIMER,
    describeItMode: 'team',
    describeItNumTeams: 2,
    wordRushMode: 'team',
    wordRushPromptMode: 'automatic',
    wordRushDifficulty: 'standard',
    wordRushNumTeams: 2,
    codewordsOperativeTimer: CODEWORDS_DEFAULT_OPERATIVE_TIMER,
    codewordsTeamAssignment: 'players',
    mafiaDoctorEnabled: true,
    mafiaDetectiveEnabled: true,
    mafiaAnonymousVotes: true,
    npatMarkingTimer: NPAT_DEFAULT_MARKING_TIMER,
    gameDurationSeconds:
      gameType === 'i_call_on'
        ? NPAT_DEFAULT_GAME_DURATION
        : gameType === 'crossword'
          ? CROSSWORD_DEFAULT_DURATION
          : gameType === 'word_search'
            ? WORD_SEARCH_DEFAULT_DURATION
            : gameType === 'word_scramble'
              ? WORD_SCRAMBLE_DEFAULT_DURATION
              : 0,
    matchingPairsLargeGrid: false,
    crosswordTheme: CROSSWORD_DEFAULT_THEME,
    crosswordDifficulty: CROSSWORD_DEFAULT_DIFFICULTY,
    wordSearchTheme: WORD_SEARCH_DEFAULT_THEME,
    wordSearchDifficulty: WORD_SEARCH_DEFAULT_DIFFICULTY,
    wordScrambleTheme: WORD_SCRAMBLE_DEFAULT_THEME,
    wordScrambleDifficulty: WORD_SCRAMBLE_DEFAULT_DIFFICULTY,
  }
}

function defaultTimerForGame(gameType: GameType): number {
  if (gameType === 'trivia') return TRIVIA_DEFAULT_TIMER
  if (gameType === 'quiplash') return QUIPLASH_DEFAULT_SUBMIT_TIMER
  if (gameType === 'quick_draw') return QUICK_DRAW_DEFAULT_DRAW_TIMER
  if (gameType === 'describe_it') return DESCRIBE_IT_DEFAULT_TURN_SECONDS
  if (gameType === 'word_rush') return WORD_RUSH_DEFAULT_TURN_SECONDS
  if (gameType === 'two_truths') return TTL_DEFAULT_TIMER
  if (gameType === 'word_hunt') return WORD_HUNT_DEFAULT_TIMER
  if (gameType === 'codewords') return CODEWORDS_DEFAULT_SPYMASTER_TIMER
  if (gameType === 'mafia') return MAFIA_DEFAULT_PHASE_TIMER
  if (gameType === 'i_call_on') return NPAT_DEFAULT_TIMER
  if (gameType === 'hot_seat') return POLL_DEFAULT_TIMER
  if (isPollPartyGame(gameType)) return POLL_DEFAULT_TIMER
  return POLL_DEFAULT_TIMER
}

export function partyRoomSettingsPayload(gameType: GameType, party: PartyRoomSettings): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if (isPollPartyGame(gameType)) {
    payload.rounds_count = clampPartyRounds(gameType, party.roundsCount)
    payload.timer_seconds = party.timerSeconds
    payload.anonymous = party.anonymous
    payload.gender_based = party.genderBased
    if (isPairGame(gameType)) payload.pair_vote_mode = parsePairVoteMode(party.pairVoteMode)
    return payload
  }

  if (gameType === 'trivia') {
    payload.rounds_count = clampPartyRounds(gameType, party.roundsCount)
    payload.timer_seconds = party.timerSeconds
    payload.trivia_category = clampTriviaCategory(party.triviaCategory)
    return payload
  }

  if (gameType === 'bingo') {
    payload.rounds_count = 1
    payload.bingo_call_mode = clampBingoCallMode(party.bingoCallMode)
    payload.bingo_call_interval_seconds = clampBingoCallInterval(party.bingoCallInterval)
    return payload
  }

  if (gameType === 'quiplash') {
    payload.rounds_count = clampPartyRounds(gameType, party.roundsCount)
    payload.timer_seconds = clampQuiplashSubmitTimer(party.timerSeconds)
    payload.operative_timer_seconds = clampQuiplashVoteTimer(party.quiplashVoteTimer)
    return payload
  }

  if (gameType === 'quick_draw') {
    const variant = clampQuickDrawVariant(party.quickDrawVariant)
    payload.quick_draw_variant = variant
    payload.rounds_count = clampPartyRounds(gameType, party.roundsCount)
    payload.timer_seconds = party.timerSeconds
    if (variant === 'guess') {
      payload.quick_draw_play_mode = clampQuickDrawPlayMode(party.quickDrawPlayMode)
      if (party.quickDrawPlayMode !== 'individual') {
        payload.quick_draw_num_teams = clampQuickDrawNumTeams(party.quickDrawNumTeams)
      }
    } else {
      payload.operative_timer_seconds = party.quickDrawTitleTimer
      payload.game_duration_seconds = party.quickDrawVoteTimer
    }
    return payload
  }

  if (gameType === 'describe_it') {
    const mode = clampDescribeItMode(party.describeItMode)
    payload.describe_it_mode = mode
    payload.rounds_count = clampPartyRounds(gameType, party.roundsCount)
    payload.timer_seconds = party.timerSeconds
    if (mode !== 'individual') payload.describe_it_num_teams = clampDescribeItTeams(party.describeItNumTeams)
    return payload
  }

  if (gameType === 'word_rush') {
    const mode = clampWordRushMode(party.wordRushMode)
    payload.word_rush_mode = mode
    payload.word_rush_prompt_mode = clampWordRushPromptMode(party.wordRushPromptMode)
    payload.word_rush_difficulty = clampWordRushDifficulty(party.wordRushDifficulty)
    payload.rounds_count = clampPartyRounds(gameType, party.roundsCount)
    payload.timer_seconds = clampWordRushTurnSeconds(party.timerSeconds)
    if (mode !== 'individual') payload.word_rush_num_teams = clampWordRushTeams(party.wordRushNumTeams)
    return payload
  }

  if (gameType === 'two_truths') {
    payload.rounds_count = 1
    payload.timer_seconds = party.timerSeconds
    return payload
  }

  if (gameType === 'hot_seat') {
    payload.rounds_count = clampPartyRounds(gameType, party.roundsCount || HOT_SEAT_DEFAULT_MAX_ROUNDS)
    payload.timer_seconds = party.timerSeconds
    return payload
  }

  if (gameType === 'codewords') {
    payload.timer_seconds = party.timerSeconds
    payload.operative_timer_seconds = party.codewordsOperativeTimer
    Object.assign(payload, codewordsTeamAssignmentFlags(party.codewordsTeamAssignment))
    return payload
  }

  if (gameType === 'mafia') {
    payload.timer_seconds = party.timerSeconds
    payload.mafia_doctor_enabled = party.mafiaDoctorEnabled
    payload.mafia_detective_enabled = party.mafiaDetectiveEnabled
    payload.mafia_anonymous_votes = party.mafiaAnonymousVotes
    return payload
  }

  if (gameType === 'word_hunt') {
    payload.rounds_count = 1
    payload.timer_seconds = party.timerSeconds
    return payload
  }

  if (gameType === 'sudoku') {
    payload.rounds_count = 1
    payload.game_duration_seconds = party.gameDurationSeconds
    return payload
  }

  if (gameType === 'crossword') {
    payload.rounds_count = 1
    payload.game_duration_seconds = clampCrosswordGameDuration(party.gameDurationSeconds)
    payload.crossword_theme = party.crosswordTheme
    payload.crossword_difficulty = parseCrosswordDifficulty(party.crosswordDifficulty)
    return payload
  }

  if (gameType === 'word_search') {
    payload.rounds_count = 1
    payload.game_duration_seconds = clampWordSearchGameDuration(party.gameDurationSeconds)
    payload.word_search_theme = party.wordSearchTheme
    payload.word_search_difficulty = parseWordSearchDifficulty(party.wordSearchDifficulty)
    return payload
  }

  if (gameType === 'word_scramble') {
    payload.rounds_count = 1
    payload.game_duration_seconds = clampWordScrambleGameDuration(party.gameDurationSeconds)
    payload.word_scramble_theme = party.wordScrambleTheme
    payload.word_scramble_difficulty = parseWordScrambleDifficulty(party.wordScrambleDifficulty)
    return payload
  }

  if (gameType === 'matching_pairs') {
    payload.rounds_count = clampPartyRounds(gameType, party.roundsCount)
    payload.timer_seconds = party.timerSeconds
    payload.game_duration_seconds = party.matchingPairsLargeGrid ? 16 : 0
    return payload
  }

  if (gameType === 'i_call_on') {
    payload.rounds_count = 1
    payload.timer_seconds = clampNpatTimer(party.timerSeconds)
    payload.operative_timer_seconds = clampNpatMarkingTimer(party.npatMarkingTimer)
    payload.game_duration_seconds = clampNpatGameDuration(party.gameDurationSeconds)
    return payload
  }

  return payload
}

export {
  DESCRIBE_IT_TEAM_OPTIONS,
  QUICK_DRAW_GUESS_TEAM_OPTIONS,
  WORD_RUSH_TEAM_OPTIONS,
  codewordsTeamAssignmentFromFlags,
  clampCodewordsTeamAssignment,
}
