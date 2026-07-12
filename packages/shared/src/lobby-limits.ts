import { ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS } from './anonymous-messages'
import { BINGO_DEFAULT_MAX_PLAYERS, BINGO_MAX_PLAYERS, BINGO_MIN_PLAYERS } from './bingo'
import { CODEWORDS_MAX_PLAYERS, CODEWORDS_MIN_PLAYERS } from './codewords'
import { CROSSWORD_DEFAULT_MAX_PLAYERS, CROSSWORD_MAX_PLAYERS, CROSSWORD_MIN_PLAYERS } from './crossword'
import { WORD_SEARCH_DEFAULT_MAX_PLAYERS, WORD_SEARCH_MAX_PLAYERS, WORD_SEARCH_MIN_PLAYERS } from './word-search'
import { CRAZY8_DEFAULT_MAX_PLAYERS, CRAZY8_MAX_PLAYERS, CRAZY8_MIN_PLAYERS } from './crazy-eights'
import {
  DESCRIBE_IT_DEFAULT_MAX_PLAYERS,
  DESCRIBE_IT_MAX_PLAYERS,
  DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL,
} from './describe-it'
import { LUDO_DEFAULT_MAX_PLAYERS, LUDO_MAX_PLAYERS, LUDO_MIN_PLAYERS } from './ludo'
import { MAFIA_MAX_PLAYERS, MAFIA_MIN_PLAYERS } from './mafia'
import { MONOPOLY_DEFAULT_MAX_PLAYERS, MONOPOLY_MAX_PLAYERS, MONOPOLY_MIN_PLAYERS } from './monopoly-board'
import { NPAT_DEFAULT_MAX_PLAYERS, NPAT_MAX_PLAYERS, NPAT_MIN_PLAYERS } from './npat'
import { QUICK_DRAW_MIN_PLAYERS } from './quick-draw-lie'
import { QUIPLASH_DEFAULT_MAX_PLAYERS, QUIPLASH_MAX_PLAYERS, QUIPLASH_MIN_PLAYERS } from './quiplash'
import { SNAKE_LADDER_DEFAULT_MAX_PLAYERS, SNAKE_LADDER_MAX_PLAYERS, SNAKE_LADDER_MIN_PLAYERS } from './snake-and-ladder'
import { TTL_DEFAULT_MAX_PLAYERS, TTL_MAX_PLAYERS, TTL_MIN_PLAYERS } from './two-truths'
import { WHOT_DEFAULT_MAX_PLAYERS, WHOT_MAX_PLAYERS, WHOT_MIN_PLAYERS } from './whot'
import { WORD_HUNT_DEFAULT_MAX_PLAYERS, WORD_HUNT_MAX_PLAYERS, WORD_HUNT_MIN_PLAYERS } from './word-hunt'
import { WORD_RUSH_DEFAULT_MAX_PLAYERS, WORD_RUSH_MAX_PLAYERS, WORD_RUSH_MIN_PLAYERS } from './word-rush'
import { YAHTZEE_DEFAULT_MAX_PLAYERS, YAHTZEE_MAX_PLAYERS, YAHTZEE_MIN_PLAYERS } from './yahtzee'

export const LOBBY_LIMIT_GAME_TYPES = [
  'anonymous_messages',
  'bingo',
  'codewords',
  'trivia',
  'two_truths',
  'monopoly',
  'yahtzee',
  'whot',
  'crazy_eights',
  'ludo',
  'mahjong',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'checkers',
  'scrabble',
  'describe_it',
  'snake_and_ladder',
  'mafia',
  'matching_pairs',
  'quiplash',
  'quick_draw',
  'word_rush',
  'ayo',
  'crossword',
  'word_search',
] as const

export type LobbyLimitGameType = (typeof LOBBY_LIMIT_GAME_TYPES)[number]

export type GameLimitConfig = {
  min: number
  max: number
  default: number
}

export type GamePlayerLimitsMap = Record<LobbyLimitGameType, GameLimitConfig>

const ANONYMOUS_ROOM_MIN_PLAYERS = 2
const ANONYMOUS_ROOM_MAX_PLAYERS = 50

const MAFIA_DEFAULT_MAX_PLAYERS = 16
const TRIVIA_MIN_PLAYERS = 2
const TRIVIA_MAX_PLAYERS = 50
const TRIVIA_DEFAULT_MAX_PLAYERS = 30

const CODEWORDS_DEFAULT_MAX_PLAYERS = 8

const QUICK_DRAW_MAX_PLAYERS = 20
const QUICK_DRAW_DEFAULT_MAX_PLAYERS = 10

const MAHJONG_MIN_PLAYERS = 4
const MAHJONG_MAX_PLAYERS = 4
const MAHJONG_DEFAULT_MAX_PLAYERS = 4

const SUDOKU_MIN_PLAYERS = 2
const SUDOKU_MAX_PLAYERS = 30

const TIC_TAC_TOE_MIN_PLAYERS = 2
const TIC_TAC_TOE_MAX_PLAYERS = 2
const TIC_TAC_TOE_DEFAULT_MAX_PLAYERS = 2

const CHESS_MIN_PLAYERS = 2
const CHESS_MAX_PLAYERS = 2
const CHESS_DEFAULT_MAX_PLAYERS = 2

const CHECKERS_MIN_PLAYERS = 2
const CHECKERS_MAX_PLAYERS = 2
const CHECKERS_DEFAULT_MAX_PLAYERS = 2

const AYO_MIN_PLAYERS = 2
const AYO_MAX_PLAYERS = 2
const AYO_DEFAULT_MAX_PLAYERS = 2

const SCRABBLE_MIN_PLAYERS = 2
const SCRABBLE_MAX_PLAYERS = 4

const MATCHING_PAIRS_MIN_PLAYERS = 2
const MATCHING_PAIRS_MAX_PLAYERS = 30
const MATCHING_PAIRS_DEFAULT_MAX_PLAYERS = 20

export const GAME_LIMIT_CODE_DEFAULTS: GamePlayerLimitsMap = {
  anonymous_messages: {
    min: ANONYMOUS_ROOM_MIN_PLAYERS,
    max: ANONYMOUS_ROOM_MAX_PLAYERS,
    default: ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS,
  },
  bingo: { min: BINGO_MIN_PLAYERS, max: BINGO_MAX_PLAYERS, default: BINGO_DEFAULT_MAX_PLAYERS },
  codewords: { min: CODEWORDS_MIN_PLAYERS, max: CODEWORDS_MAX_PLAYERS, default: CODEWORDS_DEFAULT_MAX_PLAYERS },
  trivia: { min: TRIVIA_MIN_PLAYERS, max: TRIVIA_MAX_PLAYERS, default: TRIVIA_DEFAULT_MAX_PLAYERS },
  two_truths: { min: TTL_MIN_PLAYERS, max: TTL_MAX_PLAYERS, default: TTL_DEFAULT_MAX_PLAYERS },
  quiplash: { min: QUIPLASH_MIN_PLAYERS, max: QUIPLASH_MAX_PLAYERS, default: QUIPLASH_DEFAULT_MAX_PLAYERS },
  quick_draw: {
    min: QUICK_DRAW_MIN_PLAYERS,
    max: QUICK_DRAW_MAX_PLAYERS,
    default: QUICK_DRAW_DEFAULT_MAX_PLAYERS,
  },
  monopoly: { min: MONOPOLY_MIN_PLAYERS, max: MONOPOLY_MAX_PLAYERS, default: MONOPOLY_DEFAULT_MAX_PLAYERS },
  yahtzee: { min: YAHTZEE_MIN_PLAYERS, max: YAHTZEE_MAX_PLAYERS, default: YAHTZEE_DEFAULT_MAX_PLAYERS },
  whot: { min: WHOT_MIN_PLAYERS, max: WHOT_MAX_PLAYERS, default: WHOT_DEFAULT_MAX_PLAYERS },
  crazy_eights: { min: CRAZY8_MIN_PLAYERS, max: CRAZY8_MAX_PLAYERS, default: CRAZY8_DEFAULT_MAX_PLAYERS },
  ludo: { min: LUDO_MIN_PLAYERS, max: LUDO_MAX_PLAYERS, default: LUDO_DEFAULT_MAX_PLAYERS },
  mahjong: { min: MAHJONG_MIN_PLAYERS, max: MAHJONG_MAX_PLAYERS, default: MAHJONG_DEFAULT_MAX_PLAYERS },
  i_call_on: { min: NPAT_MIN_PLAYERS, max: NPAT_MAX_PLAYERS, default: NPAT_DEFAULT_MAX_PLAYERS },
  sudoku: { min: SUDOKU_MIN_PLAYERS, max: SUDOKU_MAX_PLAYERS, default: SUDOKU_MAX_PLAYERS },
  tic_tac_toe: {
    min: TIC_TAC_TOE_MIN_PLAYERS,
    max: TIC_TAC_TOE_MAX_PLAYERS,
    default: TIC_TAC_TOE_DEFAULT_MAX_PLAYERS,
  },
  word_hunt: { min: WORD_HUNT_MIN_PLAYERS, max: WORD_HUNT_MAX_PLAYERS, default: WORD_HUNT_DEFAULT_MAX_PLAYERS },
  chess: { min: CHESS_MIN_PLAYERS, max: CHESS_MAX_PLAYERS, default: CHESS_DEFAULT_MAX_PLAYERS },
  checkers: { min: CHECKERS_MIN_PLAYERS, max: CHECKERS_MAX_PLAYERS, default: CHECKERS_DEFAULT_MAX_PLAYERS },
  ayo: { min: AYO_MIN_PLAYERS, max: AYO_MAX_PLAYERS, default: AYO_DEFAULT_MAX_PLAYERS },
  scrabble: { min: SCRABBLE_MIN_PLAYERS, max: SCRABBLE_MAX_PLAYERS, default: SCRABBLE_MAX_PLAYERS },
  describe_it: {
    // Absolute floor for the max-players cap; individual mode can run with 2.
    // Team mode's higher start minimum is enforced server-side at game start.
    min: DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL,
    max: DESCRIBE_IT_MAX_PLAYERS,
    default: DESCRIBE_IT_DEFAULT_MAX_PLAYERS,
  },
  word_rush: { min: WORD_RUSH_MIN_PLAYERS, max: WORD_RUSH_MAX_PLAYERS, default: WORD_RUSH_DEFAULT_MAX_PLAYERS },
  snake_and_ladder: {
    min: SNAKE_LADDER_MIN_PLAYERS,
    max: SNAKE_LADDER_MAX_PLAYERS,
    default: SNAKE_LADDER_DEFAULT_MAX_PLAYERS,
  },
  mafia: { min: MAFIA_MIN_PLAYERS, max: MAFIA_MAX_PLAYERS, default: MAFIA_DEFAULT_MAX_PLAYERS },
  matching_pairs: {
    min: MATCHING_PAIRS_MIN_PLAYERS,
    max: MATCHING_PAIRS_MAX_PLAYERS,
    default: MATCHING_PAIRS_DEFAULT_MAX_PLAYERS,
  },
  crossword: { min: CROSSWORD_MIN_PLAYERS, max: CROSSWORD_MAX_PLAYERS, default: CROSSWORD_DEFAULT_MAX_PLAYERS },
  word_search: { min: WORD_SEARCH_MIN_PLAYERS, max: WORD_SEARCH_MAX_PLAYERS, default: WORD_SEARCH_DEFAULT_MAX_PLAYERS },
}

export function isLobbyLimitGameType(value: string): value is LobbyLimitGameType {
  return (LOBBY_LIMIT_GAME_TYPES as readonly string[]).includes(value)
}

export function getCodeDefaultLimits(): GamePlayerLimitsMap {
  return Object.fromEntries(
    LOBBY_LIMIT_GAME_TYPES.map((gameType) => [gameType, { ...GAME_LIMIT_CODE_DEFAULTS[gameType] }])
  ) as GamePlayerLimitsMap
}

export function playerCountOptions(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, index) => index + min)
}

export function clampLobbyMaxPlayers(
  gameType: LobbyLimitGameType,
  value: number,
  limits: GamePlayerLimitsMap
): number {
  const cfg = limits[gameType]
  return Math.min(cfg.max, Math.max(cfg.min, Math.floor(value)))
}

export function lobbyDefaultMaxPlayers(gameType: LobbyLimitGameType, limits: GamePlayerLimitsMap): number {
  return limits[gameType].default
}
