import type { GameType } from '@fateround/shared'
import type { LudoVariant, MahjongRuleset } from '@fateround/shared/types'
import type { AyoVariant } from '@fateround/shared/create-board-games'
import {
  AYO_VARIANT_OPTIONS,
  CHESS_DEFAULT_BOARD_THEME,
  CHESS_DEFAULT_PIECE_SET,
  defaultBoardGameTurnTimer,
  parseAyoVariant,
  parseScrabbleClockMode,
  type ScrabbleClockMode,
} from '@fateround/shared/create-board-games'
import { parseLudoVariant } from '@fateround/shared/ludo'
import { parseMultiPlayMode, type UnoMultiPlayMode } from '@fateround/shared/uno'
import { DEFAULT_MAHJONG_RULESET, DEFAULT_MAHJONG_RULE_OPTIONS } from '@fateround/shared/mahjong-rulesets'
import type { ScrabbleDictionaryId } from '@fateround/shared/scrabble-dictionary-meta'
import { SCRABBLE_DEFAULT_DICTIONARY, parseScrabbleDictionaryId } from '@fateround/shared/scrabble-dictionary-meta'

export const BATCH_19_BOARD_GAMES: GameType[] = [
  'ludo',
  'snake_and_ladder',
  'yahtzee',
  'tic_tac_toe',
  'chess',
  'checkers',
  'checkers_international',
  'checkers_nigeria',
  'ayo',
  'whot',
  'crazy_eights',
  'uno',
  'scrabble',
  'mahjong',
  'monopoly',
]

export type GameRoomSettings = {
  timerSeconds: number
  gameDurationSeconds: number
  ludoVariant: LudoVariant
  ayoVariant: AyoVariant
  chessBoardTheme: string
  chessPieceSet: string
  whotPick3Enabled: boolean
  whotPick2Stacking: boolean
  whotCardsEnabled: boolean
  whotNumberCallsEnabled: boolean
  crazy8ActionCards: boolean
  crazy8Jokers: boolean
  crazy8Pick2Stacking: boolean
  unoWd4Challenge: boolean
  unoUnoPenalty: number
  unoZeroSeven: boolean
  unoStacking: boolean
  unoJumpIn: boolean
  unoMultiPlayMode: UnoMultiPlayMode
  unoTeamMode: boolean
  scrabbleDictionaryId: ScrabbleDictionaryId
  scrabbleClockMode: ScrabbleClockMode
  scrabbleClockSeconds: number
  mahjongRuleset: MahjongRuleset
  /** Nigerian Draughts only — opt-in "Street Rules" (huffing) house rule. Off by default. */
  checkersNigeriaStreetRules: boolean
  /** Estate Kings board size — 40 (classic) or 48 (expanded, requires max_players >= 6). */
  monopolyBoardSize: 40 | 48
  monopolyDoubleGoSalary: boolean
  monopolyForcedAuctions: boolean
  monopolyAuctionTimerSeconds: number
  monopolyNoRentInJail: boolean
  monopolyEstateDividend: boolean
  monopolyLoansEnabled: boolean
  monopolyLoanInterest: number
  monopolyLoanTermRounds: number
}

export function defaultGameRoomSettings(gameType: GameType): GameRoomSettings {
  const timerKey = boardGameTimerKey(gameType)
  // Never default a turn timer to 0 — a game with no turn timer can stall on an
  // AFK player. Use the shared per-game default (parity with web create).
  const defaultTimer = timerKey ? defaultBoardGameTurnTimer(timerKey) : 0

  return {
    timerSeconds: defaultTimer,
    gameDurationSeconds: 0,
    ludoVariant: 'modern',
    ayoVariant: 'traditional',
    chessBoardTheme: CHESS_DEFAULT_BOARD_THEME,
    chessPieceSet: CHESS_DEFAULT_PIECE_SET,
    whotPick3Enabled: true,
    whotPick2Stacking: true,
    whotCardsEnabled: true,
    whotNumberCallsEnabled: true,
    crazy8ActionCards: true,
    crazy8Jokers: false,
    crazy8Pick2Stacking: true,
    unoWd4Challenge: true,
    unoUnoPenalty: 2,
    unoZeroSeven: false,
    unoStacking: false,
    unoJumpIn: false,
    unoMultiPlayMode: 'off',
    unoTeamMode: false,
    scrabbleDictionaryId: SCRABBLE_DEFAULT_DICTIONARY,
    scrabbleClockMode: 'standard',
    scrabbleClockSeconds: 600,
    mahjongRuleset: DEFAULT_MAHJONG_RULESET,
    checkersNigeriaStreetRules: false,
    monopolyBoardSize: 40,
    monopolyDoubleGoSalary: false,
    monopolyForcedAuctions: false,
    monopolyAuctionTimerSeconds: 10,
    monopolyNoRentInJail: false,
    monopolyEstateDividend: false,
    monopolyLoansEnabled: true,
    monopolyLoanInterest: 15,
    monopolyLoanTermRounds: 4,
  }
}

export function hasGameRoomSettings(gameType: GameType): boolean {
  return BATCH_19_BOARD_GAMES.includes(gameType)
}

export function boardGameTimerKey(
  gameType: GameType
):
  | 'monopoly'
  | 'yahtzee'
  | 'whot'
  | 'crazy_eights'
  | 'uno'
  | 'ludo'
  | 'mahjong'
  | 'snake_and_ladder'
  | 'tic_tac_toe'
  | 'chess'
  | 'checkers'
  | 'ayo'
  | 'scrabble'
  | null {
  if (gameType === 'ludo') return 'ludo'
  if (gameType === 'snake_and_ladder') return 'snake_and_ladder'
  if (gameType === 'yahtzee') return 'yahtzee'
  if (gameType === 'tic_tac_toe') return 'tic_tac_toe'
  if (gameType === 'chess') return 'chess'
  if (gameType === 'checkers' || gameType === 'checkers_international' || gameType === 'checkers_nigeria')
    return 'checkers'
  if (gameType === 'ayo') return 'ayo'
  if (gameType === 'whot') return 'whot'
  if (gameType === 'crazy_eights') return 'crazy_eights'
  if (gameType === 'uno') return 'uno'
  if (gameType === 'scrabble') return 'scrabble'
  if (gameType === 'mahjong') return 'mahjong'
  if (gameType === 'monopoly') return 'monopoly'
  return null
}

export function gameRoomSettingsPayload(gameType: GameType, room: GameRoomSettings): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if (gameType === 'ludo') {
    payload.ludo_variant = parseLudoVariant(room.ludoVariant)
    payload.timer_seconds = room.timerSeconds
    return payload
  }

  if (gameType === 'ayo') {
    payload.ayo_variant = parseAyoVariant(room.ayoVariant)
    payload.timer_seconds = room.timerSeconds
    return payload
  }

  if (gameType === 'chess') {
    payload.timer_seconds = room.timerSeconds
    payload.chess_board_theme = room.chessBoardTheme
    payload.chess_piece_set = room.chessPieceSet
    return payload
  }

  if (gameType === 'checkers' || gameType === 'checkers_international' || gameType === 'checkers_nigeria') {
    payload.timer_seconds = room.timerSeconds
    if (gameType === 'checkers_nigeria') {
      payload.checkers_nigeria_street_rules = room.checkersNigeriaStreetRules
    }
    return payload
  }

  if (gameType === 'whot') {
    payload.timer_seconds = room.timerSeconds
    payload.game_duration_seconds = room.gameDurationSeconds
    payload.whot_pick3_enabled = room.whotPick3Enabled
    payload.whot_pick2_stacking = room.whotPick2Stacking
    payload.whot_cards_enabled = room.whotCardsEnabled
    payload.whot_number_calls_enabled = room.whotNumberCallsEnabled
    return payload
  }

  if (gameType === 'crazy_eights') {
    payload.timer_seconds = room.timerSeconds
    payload.game_duration_seconds = room.gameDurationSeconds
    payload.crazy8_action_cards = room.crazy8ActionCards
    payload.crazy8_jokers = room.crazy8Jokers
    payload.crazy8_pick2_stacking = room.crazy8Pick2Stacking
    return payload
  }

  if (gameType === 'uno') {
    payload.timer_seconds = room.timerSeconds
    payload.game_duration_seconds = room.gameDurationSeconds
    payload.uno_wd4_challenge = room.unoWd4Challenge
    payload.uno_uno_penalty = room.unoUnoPenalty
    payload.uno_zero_seven = room.unoZeroSeven
    payload.uno_stacking = room.unoStacking
    payload.uno_jump_in = room.unoJumpIn
    payload.uno_multi_play_mode = parseMultiPlayMode(room.unoMultiPlayMode)
    payload.uno_team_mode = room.unoTeamMode
    if (room.unoTeamMode) payload.max_players = 4
    return payload
  }

  if (gameType === 'scrabble') {
    payload.scrabble_dictionary_id = parseScrabbleDictionaryId(room.scrabbleDictionaryId)
    payload.scrabble_clock_mode = parseScrabbleClockMode(room.scrabbleClockMode)
    if (room.scrabbleClockMode === 'chess') {
      payload.scrabble_clock_seconds = room.scrabbleClockSeconds
      payload.timer_seconds = 0
      payload.game_duration_seconds = 0
    } else {
      payload.timer_seconds = room.timerSeconds
      payload.game_duration_seconds = room.gameDurationSeconds
    }
    return payload
  }

  if (gameType === 'mahjong') {
    payload.timer_seconds = room.timerSeconds
    payload.mahjong_ruleset = room.mahjongRuleset
    payload.mahjong_rule_options = DEFAULT_MAHJONG_RULE_OPTIONS
    return payload
  }

  if (gameType === 'monopoly') {
    payload.timer_seconds = room.timerSeconds
    payload.game_duration_seconds = room.gameDurationSeconds
    // 48-space board requires >=6 seats; server clamps to 40 when max_players < 6
    // (see /api/games/[code]/lobby-settings and the web create flow).
    payload.monopoly_board_size = room.monopolyBoardSize === 48 ? 48 : 40
    payload.monopoly_double_go_salary = room.monopolyDoubleGoSalary
    payload.monopoly_forced_auctions = room.monopolyForcedAuctions
    payload.monopoly_auction_timer_seconds = room.monopolyAuctionTimerSeconds
    payload.monopoly_no_rent_in_jail = room.monopolyNoRentInJail
    payload.monopoly_estate_dividend = room.monopolyEstateDividend
    payload.monopoly_loans_enabled = room.monopolyLoansEnabled
    payload.monopoly_loan_interest = room.monopolyLoanInterest
    payload.monopoly_loan_term_rounds = room.monopolyLoanTermRounds
    return payload
  }

  if (gameType === 'snake_and_ladder' || gameType === 'yahtzee' || gameType === 'tic_tac_toe') {
    payload.timer_seconds = room.timerSeconds
    return payload
  }

  return payload
}

export { AYO_VARIANT_OPTIONS }
