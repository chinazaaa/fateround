import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS,
  ANONYMOUS_ROOM_MAX_PLAYERS,
  ANONYMOUS_ROOM_MIN_PLAYERS,
} from '@/lib/anonymous-messages'
import { BINGO_DEFAULT_MAX_PLAYERS, BINGO_MAX_PLAYERS, BINGO_MIN_PLAYERS } from '@/lib/bingo'
import { CODEWORDS_DEFAULT_MAX_PLAYERS, CODEWORDS_MAX_PLAYERS, CODEWORDS_MIN_PLAYERS } from '@/lib/codewords'
import { TRIVIA_DEFAULT_MAX_PLAYERS, TRIVIA_MAX_PLAYERS, TRIVIA_MIN_PLAYERS } from '@/lib/trivia'
import { TTL_DEFAULT_MAX_PLAYERS, TTL_MAX_PLAYERS, TTL_MIN_PLAYERS } from '@/lib/two-truths'
import { MONOPOLY_DEFAULT_MAX_PLAYERS, MONOPOLY_MAX_PLAYERS, MONOPOLY_MIN_PLAYERS } from '@/lib/monopoly'
import { YAHTZEE_DEFAULT_MAX_PLAYERS, YAHTZEE_MAX_PLAYERS, YAHTZEE_MIN_PLAYERS } from '@/lib/yahtzee'
import { WHOT_DEFAULT_MAX_PLAYERS, WHOT_MAX_PLAYERS, WHOT_MIN_PLAYERS } from '@/lib/whot'
import { LUDO_DEFAULT_MAX_PLAYERS, LUDO_MAX_PLAYERS, LUDO_MIN_PLAYERS } from '@/lib/ludo'
import { NPAT_DEFAULT_MAX_PLAYERS, NPAT_MAX_PLAYERS, NPAT_MIN_PLAYERS } from '@/lib/npat'
import { TIC_TAC_TOE_DEFAULT_MAX_PLAYERS, TIC_TAC_TOE_MAX_PLAYERS, TIC_TAC_TOE_MIN_PLAYERS } from '@/lib/tic-tac-toe'
import { WORD_HUNT_DEFAULT_MAX_PLAYERS, WORD_HUNT_MAX_PLAYERS, WORD_HUNT_MIN_PLAYERS } from '@/lib/word-hunt'
import { CHESS_DEFAULT_MAX_PLAYERS, CHESS_MAX_PLAYERS, CHESS_MIN_PLAYERS } from '@/lib/chess'
import { DESCRIBE_IT_DEFAULT_MAX_PLAYERS, DESCRIBE_IT_MAX_PLAYERS, DESCRIBE_IT_MIN_PLAYERS } from '@/lib/describe-it'

export const LOBBY_LIMIT_GAME_TYPES = [
  'anonymous_messages',
  'bingo',
  'codewords',
  'trivia',
  'two_truths',
  'monopoly',
  'yahtzee',
  'whot',
  'ludo',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
] as const

export type LobbyLimitGameType = (typeof LOBBY_LIMIT_GAME_TYPES)[number]

export type GameLimitConfig = {
  min: number
  max: number
  default: number
}

export type GamePlayerLimitsMap = Record<LobbyLimitGameType, GameLimitConfig>

/** Hard ceiling for admin edits and DB validation. */
export const GAME_LIMIT_ABSOLUTE_MAX = 100

export const GAME_LIMIT_CODE_DEFAULTS: GamePlayerLimitsMap = {
  anonymous_messages: {
    min: ANONYMOUS_ROOM_MIN_PLAYERS,
    max: ANONYMOUS_ROOM_MAX_PLAYERS,
    default: ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS,
  },
  bingo: {
    min: BINGO_MIN_PLAYERS,
    max: BINGO_MAX_PLAYERS,
    default: BINGO_DEFAULT_MAX_PLAYERS,
  },
  codewords: {
    min: CODEWORDS_MIN_PLAYERS,
    max: CODEWORDS_MAX_PLAYERS,
    default: CODEWORDS_DEFAULT_MAX_PLAYERS,
  },
  trivia: {
    min: TRIVIA_MIN_PLAYERS,
    max: TRIVIA_MAX_PLAYERS,
    default: TRIVIA_DEFAULT_MAX_PLAYERS,
  },
  two_truths: {
    min: TTL_MIN_PLAYERS,
    max: TTL_MAX_PLAYERS,
    default: TTL_DEFAULT_MAX_PLAYERS,
  },
  monopoly: {
    min: MONOPOLY_MIN_PLAYERS,
    max: MONOPOLY_MAX_PLAYERS,
    default: MONOPOLY_DEFAULT_MAX_PLAYERS,
  },
  yahtzee: {
    min: YAHTZEE_MIN_PLAYERS,
    max: YAHTZEE_MAX_PLAYERS,
    default: YAHTZEE_DEFAULT_MAX_PLAYERS,
  },
  whot: {
    min: WHOT_MIN_PLAYERS,
    max: WHOT_MAX_PLAYERS,
    default: WHOT_DEFAULT_MAX_PLAYERS,
  },
  ludo: {
    min: LUDO_MIN_PLAYERS,
    max: LUDO_MAX_PLAYERS,
    default: LUDO_DEFAULT_MAX_PLAYERS,
  },
  i_call_on: {
    min: NPAT_MIN_PLAYERS,
    max: NPAT_MAX_PLAYERS,
    default: NPAT_DEFAULT_MAX_PLAYERS,
  },
  sudoku: {
    min: 2,
    max: 20,
    default: 20,
  },
  tic_tac_toe: {
    min: TIC_TAC_TOE_MIN_PLAYERS,
    max: TIC_TAC_TOE_MAX_PLAYERS,
    default: TIC_TAC_TOE_DEFAULT_MAX_PLAYERS,
  },
  word_hunt: {
    min: WORD_HUNT_MIN_PLAYERS,
    max: WORD_HUNT_MAX_PLAYERS,
    default: WORD_HUNT_DEFAULT_MAX_PLAYERS,
  },
  chess: {
    min: CHESS_MIN_PLAYERS,
    max: CHESS_MAX_PLAYERS,
    default: CHESS_DEFAULT_MAX_PLAYERS,
  },
  describe_it: {
    min: DESCRIBE_IT_MIN_PLAYERS,
    max: DESCRIBE_IT_MAX_PLAYERS,
    default: DESCRIBE_IT_DEFAULT_MAX_PLAYERS,
  },
}

export function isLobbyLimitGameType(value: string): value is LobbyLimitGameType {
  return (LOBBY_LIMIT_GAME_TYPES as readonly string[]).includes(value)
}

export function getCodeDefaultLimits(): GamePlayerLimitsMap {
  return {
    anonymous_messages: { ...GAME_LIMIT_CODE_DEFAULTS.anonymous_messages },
    bingo: { ...GAME_LIMIT_CODE_DEFAULTS.bingo },
    codewords: { ...GAME_LIMIT_CODE_DEFAULTS.codewords },
    trivia: { ...GAME_LIMIT_CODE_DEFAULTS.trivia },
    two_truths: { ...GAME_LIMIT_CODE_DEFAULTS.two_truths },
    monopoly: { ...GAME_LIMIT_CODE_DEFAULTS.monopoly },
    yahtzee: { ...GAME_LIMIT_CODE_DEFAULTS.yahtzee },
    whot: { ...GAME_LIMIT_CODE_DEFAULTS.whot },
    ludo: { ...GAME_LIMIT_CODE_DEFAULTS.ludo },
    i_call_on: { ...GAME_LIMIT_CODE_DEFAULTS.i_call_on },
    sudoku: { ...GAME_LIMIT_CODE_DEFAULTS.sudoku },
    tic_tac_toe: { ...GAME_LIMIT_CODE_DEFAULTS.tic_tac_toe },
    word_hunt: { ...GAME_LIMIT_CODE_DEFAULTS.word_hunt },
    chess: { ...GAME_LIMIT_CODE_DEFAULTS.chess },
    describe_it: { ...GAME_LIMIT_CODE_DEFAULTS.describe_it },
  }
}

function clampAdminMax(gameType: LobbyLimitGameType, maxPlayers: number): number {
  const { min } = GAME_LIMIT_CODE_DEFAULTS[gameType]
  return Math.min(GAME_LIMIT_ABSOLUTE_MAX, Math.max(min, Math.floor(maxPlayers)))
}

function mergeLimitRows(rows: { game_type: string; max_players: number }[]): GamePlayerLimitsMap {
  const limits = getCodeDefaultLimits()
  for (const row of rows) {
    if (!isLobbyLimitGameType(row.game_type)) continue
    limits[row.game_type] = {
      ...limits[row.game_type],
      max: clampAdminMax(row.game_type, row.max_players),
    }
  }
  return limits
}

let cache: { limits: GamePlayerLimitsMap; expiresAt: number } | null = null
const CACHE_MS = 30_000

export function invalidateGamePlayerLimitsCache(): void {
  cache = null
}

export async function fetchGamePlayerLimits(client: SupabaseClient): Promise<GamePlayerLimitsMap> {
  if (cache && Date.now() < cache.expiresAt) return cache.limits

  const { data, error } = await client.from('game_player_limits').select('game_type, max_players')
  if (error) return getCodeDefaultLimits()

  const limits = mergeLimitRows(data ?? [])
  cache = { limits, expiresAt: Date.now() + CACHE_MS }
  return limits
}

export function clampLobbyMaxPlayers(gameType: LobbyLimitGameType, value: number, limits: GamePlayerLimitsMap): number {
  const cfg = limits[gameType]
  return Math.min(cfg.max, Math.max(cfg.min, Math.floor(value)))
}

export function lobbyMaxPlayersFromGame(
  gameType: LobbyLimitGameType,
  game: { max_players?: number | null },
  limits: GamePlayerLimitsMap
): number {
  const cfg = limits[gameType]
  if (game.max_players == null) return cfg.default
  return clampLobbyMaxPlayers(gameType, game.max_players, limits)
}

export function lobbyDefaultMaxPlayers(gameType: LobbyLimitGameType, limits: GamePlayerLimitsMap): number {
  return limits[gameType].default
}

export function playerCountOptions(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => i + min)
}
