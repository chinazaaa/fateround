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
import { CRAZY8_DEFAULT_MAX_PLAYERS, CRAZY8_MAX_PLAYERS, CRAZY8_MIN_PLAYERS } from '@/lib/crazy-eights'
import { LUDO_DEFAULT_MAX_PLAYERS, LUDO_MAX_PLAYERS, LUDO_MIN_PLAYERS } from '@/lib/ludo'
import { MAHJONG_DEFAULT_MAX_PLAYERS, MAHJONG_MAX_PLAYERS, MAHJONG_MIN_PLAYERS } from '@/lib/mahjong'
import { NPAT_DEFAULT_MAX_PLAYERS, NPAT_MAX_PLAYERS, NPAT_MIN_PLAYERS } from '@/lib/npat'
import { TIC_TAC_TOE_DEFAULT_MAX_PLAYERS, TIC_TAC_TOE_MAX_PLAYERS, TIC_TAC_TOE_MIN_PLAYERS } from '@/lib/tic-tac-toe'
import { WORD_HUNT_DEFAULT_MAX_PLAYERS, WORD_HUNT_MAX_PLAYERS, WORD_HUNT_MIN_PLAYERS } from '@/lib/word-hunt'
import { CHESS_DEFAULT_MAX_PLAYERS, CHESS_MAX_PLAYERS, CHESS_MIN_PLAYERS } from '@/lib/chess'
import { CHECKERS_DEFAULT_MAX_PLAYERS, CHECKERS_MAX_PLAYERS, CHECKERS_MIN_PLAYERS } from '@/lib/checkers'
import { AYO_DEFAULT_MAX_PLAYERS, AYO_MAX_PLAYERS, AYO_MIN_PLAYERS } from '@/lib/ayo'
import { SCRABBLE_MAX_PLAYERS, SCRABBLE_MIN_PLAYERS } from '@/lib/scrabble'
import { SUDOKU_MAX_PLAYERS, SUDOKU_MIN_PLAYERS } from '@/lib/sudoku'
import {
  DESCRIBE_IT_DEFAULT_MAX_PLAYERS,
  DESCRIBE_IT_MAX_PLAYERS,
  DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL,
} from '@/lib/describe-it'
import {
  SNAKE_LADDER_DEFAULT_MAX_PLAYERS,
  SNAKE_LADDER_MAX_PLAYERS,
  SNAKE_LADDER_MIN_PLAYERS,
} from '@/lib/snake-and-ladder'
import { MAFIA_MIN_PLAYERS, MAFIA_MAX_PLAYERS, MAFIA_DEFAULT_MAX_PLAYERS } from '@/lib/mafia'
import {
  MATCHING_PAIRS_MIN_PLAYERS,
  MATCHING_PAIRS_MAX_PLAYERS,
  MATCHING_PAIRS_DEFAULT_MAX_PLAYERS,
} from '@/lib/memory-match'
import { QUIPLASH_MIN_PLAYERS, QUIPLASH_MAX_PLAYERS, QUIPLASH_DEFAULT_MAX_PLAYERS } from '@/lib/quiplash'
import { QUICK_DRAW_MIN_PLAYERS, QUICK_DRAW_MAX_PLAYERS, QUICK_DRAW_DEFAULT_MAX_PLAYERS } from '@/lib/quick-draw'
import { WORD_RUSH_MIN_PLAYERS, WORD_RUSH_MAX_PLAYERS, WORD_RUSH_DEFAULT_MAX_PLAYERS } from '@/lib/word-rush'
import { CROSSWORD_MIN_PLAYERS, CROSSWORD_MAX_PLAYERS, CROSSWORD_DEFAULT_MAX_PLAYERS } from '@/lib/crossword'
import { WORD_SEARCH_MIN_PLAYERS, WORD_SEARCH_MAX_PLAYERS, WORD_SEARCH_DEFAULT_MAX_PLAYERS } from '@/lib/word-search'
import {
  WORD_SCRAMBLE_MIN_PLAYERS,
  WORD_SCRAMBLE_MAX_PLAYERS,
  WORD_SCRAMBLE_DEFAULT_MAX_PLAYERS,
} from '@/lib/word-scramble'
import { LANDMINE_MIN_PLAYERS, LANDMINE_MAX_PLAYERS, LANDMINE_DEFAULT_MAX_PLAYERS } from '@/lib/landmine'

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
  'word_scramble',
  'landmine',
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
  quiplash: {
    min: QUIPLASH_MIN_PLAYERS,
    max: QUIPLASH_MAX_PLAYERS,
    default: QUIPLASH_DEFAULT_MAX_PLAYERS,
  },
  quick_draw: {
    min: QUICK_DRAW_MIN_PLAYERS,
    max: QUICK_DRAW_MAX_PLAYERS,
    default: QUICK_DRAW_DEFAULT_MAX_PLAYERS,
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
  crazy_eights: {
    min: CRAZY8_MIN_PLAYERS,
    max: CRAZY8_MAX_PLAYERS,
    default: CRAZY8_DEFAULT_MAX_PLAYERS,
  },
  ludo: {
    min: LUDO_MIN_PLAYERS,
    max: LUDO_MAX_PLAYERS,
    default: LUDO_DEFAULT_MAX_PLAYERS,
  },
  mahjong: {
    min: MAHJONG_MIN_PLAYERS,
    max: MAHJONG_MAX_PLAYERS,
    default: MAHJONG_DEFAULT_MAX_PLAYERS,
  },
  i_call_on: {
    min: NPAT_MIN_PLAYERS,
    max: NPAT_MAX_PLAYERS,
    default: NPAT_DEFAULT_MAX_PLAYERS,
  },
  sudoku: {
    min: SUDOKU_MIN_PLAYERS,
    max: SUDOKU_MAX_PLAYERS,
    default: SUDOKU_MAX_PLAYERS,
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
  checkers: {
    min: CHECKERS_MIN_PLAYERS,
    max: CHECKERS_MAX_PLAYERS,
    default: CHECKERS_DEFAULT_MAX_PLAYERS,
  },
  ayo: {
    min: AYO_MIN_PLAYERS,
    max: AYO_MAX_PLAYERS,
    default: AYO_DEFAULT_MAX_PLAYERS,
  },
  scrabble: {
    min: SCRABBLE_MIN_PLAYERS,
    max: SCRABBLE_MAX_PLAYERS,
    default: SCRABBLE_MAX_PLAYERS,
  },
  describe_it: {
    // Absolute floor for the max-players cap; individual mode can run with 2.
    // Team mode's higher start minimum is enforced server-side at game start.
    min: DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL,
    max: DESCRIBE_IT_MAX_PLAYERS,
    default: DESCRIBE_IT_DEFAULT_MAX_PLAYERS,
  },
  word_rush: {
    min: WORD_RUSH_MIN_PLAYERS,
    max: WORD_RUSH_MAX_PLAYERS,
    default: WORD_RUSH_DEFAULT_MAX_PLAYERS,
  },
  snake_and_ladder: {
    min: SNAKE_LADDER_MIN_PLAYERS,
    max: SNAKE_LADDER_MAX_PLAYERS,
    default: SNAKE_LADDER_DEFAULT_MAX_PLAYERS,
  },
  mafia: {
    min: MAFIA_MIN_PLAYERS,
    max: MAFIA_MAX_PLAYERS,
    default: MAFIA_DEFAULT_MAX_PLAYERS,
  },
  matching_pairs: {
    min: MATCHING_PAIRS_MIN_PLAYERS,
    max: MATCHING_PAIRS_MAX_PLAYERS,
    default: MATCHING_PAIRS_DEFAULT_MAX_PLAYERS,
  },
  crossword: {
    min: CROSSWORD_MIN_PLAYERS,
    max: CROSSWORD_MAX_PLAYERS,
    default: CROSSWORD_DEFAULT_MAX_PLAYERS,
  },
  word_search: {
    min: WORD_SEARCH_MIN_PLAYERS,
    max: WORD_SEARCH_MAX_PLAYERS,
    default: WORD_SEARCH_DEFAULT_MAX_PLAYERS,
  },
  word_scramble: {
    min: WORD_SCRAMBLE_MIN_PLAYERS,
    max: WORD_SCRAMBLE_MAX_PLAYERS,
    default: WORD_SCRAMBLE_DEFAULT_MAX_PLAYERS,
  },
  landmine: {
    min: LANDMINE_MIN_PLAYERS,
    max: LANDMINE_MAX_PLAYERS,
    default: LANDMINE_DEFAULT_MAX_PLAYERS,
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
    quiplash: { ...GAME_LIMIT_CODE_DEFAULTS.quiplash },
    quick_draw: { ...GAME_LIMIT_CODE_DEFAULTS.quick_draw },
    monopoly: { ...GAME_LIMIT_CODE_DEFAULTS.monopoly },
    yahtzee: { ...GAME_LIMIT_CODE_DEFAULTS.yahtzee },
    whot: { ...GAME_LIMIT_CODE_DEFAULTS.whot },
    crazy_eights: { ...GAME_LIMIT_CODE_DEFAULTS.crazy_eights },
    ludo: { ...GAME_LIMIT_CODE_DEFAULTS.ludo },
    mahjong: { ...GAME_LIMIT_CODE_DEFAULTS.mahjong },
    i_call_on: { ...GAME_LIMIT_CODE_DEFAULTS.i_call_on },
    sudoku: { ...GAME_LIMIT_CODE_DEFAULTS.sudoku },
    tic_tac_toe: { ...GAME_LIMIT_CODE_DEFAULTS.tic_tac_toe },
    word_hunt: { ...GAME_LIMIT_CODE_DEFAULTS.word_hunt },
    chess: { ...GAME_LIMIT_CODE_DEFAULTS.chess },
    checkers: { ...GAME_LIMIT_CODE_DEFAULTS.checkers },
    ayo: { ...GAME_LIMIT_CODE_DEFAULTS.ayo },
    scrabble: { ...GAME_LIMIT_CODE_DEFAULTS.scrabble },
    describe_it: { ...GAME_LIMIT_CODE_DEFAULTS.describe_it },
    word_rush: { ...GAME_LIMIT_CODE_DEFAULTS.word_rush },
    snake_and_ladder: { ...GAME_LIMIT_CODE_DEFAULTS.snake_and_ladder },
    mafia: { ...GAME_LIMIT_CODE_DEFAULTS.mafia },
    matching_pairs: { ...GAME_LIMIT_CODE_DEFAULTS.matching_pairs },
    crossword: { ...GAME_LIMIT_CODE_DEFAULTS.crossword },
    word_search: { ...GAME_LIMIT_CODE_DEFAULTS.word_search },
    word_scramble: { ...GAME_LIMIT_CODE_DEFAULTS.word_scramble },
    landmine: { ...GAME_LIMIT_CODE_DEFAULTS.landmine },
  }
}

function clampAdminMax(gameType: LobbyLimitGameType, maxPlayers: number): number {
  // Each game's code-defined max is its hard ceiling — admins can tune down from it,
  // but not above it (e.g. Whot stays capped at 6 regardless of any stored override).
  const { min, max } = GAME_LIMIT_CODE_DEFAULTS[gameType]
  return Math.min(max, Math.max(min, Math.floor(maxPlayers)))
}

/** The highest max-players an admin may set for a game (its code-defined capacity). */
export function adminMaxCeiling(gameType: LobbyLimitGameType): number {
  return GAME_LIMIT_CODE_DEFAULTS[gameType].max
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

export function seatedParticipantCount(players: ReadonlyArray<{ spectator?: boolean | null }>): number {
  return players.filter((p) => p.spectator !== true).length
}

/** Client-side max seats when DB limits aren't loaded (uses code defaults). */
export function lobbyMaxPlayersFromGameClient(gameType: string, game: { max_players?: number | null }): number | null {
  if (!isLobbyLimitGameType(gameType)) return null
  const typed = gameType as LobbyLimitGameType
  return lobbyMaxPlayersFromGame(typed, game, GAME_LIMIT_CODE_DEFAULTS)
}

export function lobbyHasOpenPlayerSeat(
  game: { game_type: string; max_players?: number | null },
  players: ReadonlyArray<{ spectator?: boolean | null }>
): boolean {
  const max = lobbyMaxPlayersFromGameClient(game.game_type, game)
  if (max == null) return true
  return seatedParticipantCount(players) < max
}

export async function assertLobbyPlayerSeatAvailable(
  supabase: SupabaseClient,
  game: { id: string; game_type: string; max_players?: number | null },
  excludePlayerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isLobbyLimitGameType(game.game_type)) return { ok: true }

  const limits = await fetchGamePlayerLimits(supabase)
  const maxPlayers = lobbyMaxPlayersFromGame(game.game_type as LobbyLimitGameType, game, limits)
  const { count: seatedCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', game.id.toUpperCase())
    .eq('spectator', false)
    .neq('id', excludePlayerId)

  if ((seatedCount ?? 0) >= maxPlayers) {
    return {
      ok: false,
      error: `This game is full (${maxPlayers} players max) — you can keep watching`,
    }
  }
  return { ok: true }
}
