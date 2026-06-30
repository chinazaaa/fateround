import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameType } from '@/types'
import { initializeMonopolyGame, MONOPOLY_MIN_PLAYERS } from '@/lib/monopoly'
import { initializeYahtzeeGame, YAHTZEE_MIN_PLAYERS } from '@/lib/yahtzee'
import { initializeWhotGame, WHOT_MIN_PLAYERS } from '@/lib/whot'
import { initializeCrazyEightsGame, CRAZY8_MIN_PLAYERS } from '@/lib/crazy-eights'
import { initializeLudoGame, LUDO_MIN_PLAYERS } from '@/lib/ludo'
import { initializeSnakeAndLadderGame, SNAKE_LADDER_MIN_PLAYERS } from '@/lib/snake-and-ladder'
import { initializeTicTacToeGame, TIC_TAC_TOE_MIN_PLAYERS } from '@/lib/tic-tac-toe'
import { initializeChessGame, CHESS_MIN_PLAYERS } from '@/lib/chess'
import { initializeCheckersGame, CHECKERS_MIN_PLAYERS } from '@/lib/checkers'
import { initializeScrabbleGame, SCRABBLE_MIN_PLAYERS, SCRABBLE_MAX_PLAYERS } from '@/lib/scrabble'

/** The slice of the game row a start initializer may need. */
type StartGame = { timer_seconds?: number | null }

export interface StartSpec {
  /** minimum players required (or the exact count when `exact`). */
  minPlayers: number
  /** require exactly `minPlayers` (chess, tic-tac-toe) instead of "at least". */
  exact?: boolean
  /** also enforce an upper bound (scrabble). */
  maxPlayers?: number
  /** seed the game's tables; runs via the service role (RLS-locked to anon writes). */
  initialize: (
    admin: SupabaseClient,
    code: string,
    playerIds: string[],
    game: StartGame
  ) => Promise<{ error?: string | null }>
}

/**
 * Uniform "board game" starts. These nine all follow the same shape — filter spectators →
 * validate the player count → initialize the game's tables → flip the game to `active` —
 * so only the count rule and the `initialize*` call differ, and they live here as data.
 *
 * Games with bespoke start logic (trivia question pools, bingo cards, describe-it,
 * codewords, two-truths/i-call-on elimination, sudoku/word-hunt, anonymous rooms, secret
 * message, …) keep their own branches in `start/route.ts`.
 */
export const GAME_START_SPECS: Partial<Record<GameType, StartSpec>> = {
  monopoly: {
    minPlayers: MONOPOLY_MIN_PLAYERS,
    initialize: (admin, code, ids, game) =>
      initializeMonopolyGame(admin, code, ids, (game.timer_seconds ?? 0) as number),
  },
  yahtzee: {
    minPlayers: YAHTZEE_MIN_PLAYERS,
    initialize: (admin, code, ids) => initializeYahtzeeGame(admin, code, ids),
  },
  whot: {
    minPlayers: WHOT_MIN_PLAYERS,
    initialize: (admin, code, ids) => initializeWhotGame(admin, code, ids),
  },
  crazy_eights: {
    minPlayers: CRAZY8_MIN_PLAYERS,
    initialize: (admin, code, ids) => initializeCrazyEightsGame(admin, code, ids),
  },
  ludo: {
    minPlayers: LUDO_MIN_PLAYERS,
    initialize: (admin, code, ids) => initializeLudoGame(admin, code, ids),
  },
  snake_and_ladder: {
    minPlayers: SNAKE_LADDER_MIN_PLAYERS,
    initialize: (admin, code, ids) => initializeSnakeAndLadderGame(admin, code, ids),
  },
  tic_tac_toe: {
    minPlayers: TIC_TAC_TOE_MIN_PLAYERS,
    exact: true,
    initialize: (admin, code, ids) => initializeTicTacToeGame(admin, code, ids),
  },
  chess: {
    minPlayers: CHESS_MIN_PLAYERS,
    exact: true,
    initialize: (admin, code, ids) => initializeChessGame(admin, code, ids),
  },
  checkers: {
    minPlayers: CHECKERS_MIN_PLAYERS,
    exact: true,
    initialize: (admin, code, ids) => initializeCheckersGame(admin, code, ids),
  },
  scrabble: {
    minPlayers: SCRABBLE_MIN_PLAYERS,
    maxPlayers: SCRABBLE_MAX_PLAYERS,
    initialize: (admin, code, ids) => initializeScrabbleGame(admin, code, ids),
  },
}

/** Validates a (spectator-filtered) player count against a spec; returns an error message or null. */
export function startCountError(playerCount: number, spec: StartSpec): string | null {
  if (spec.exact) {
    return playerCount === spec.minPlayers ? null : `Need exactly ${spec.minPlayers} players to start`
  }
  if (spec.maxPlayers != null) {
    return playerCount >= spec.minPlayers && playerCount <= spec.maxPlayers
      ? null
      : `Need ${spec.minPlayers}–${spec.maxPlayers} players to start`
  }
  return playerCount >= spec.minPlayers ? null : `Need at least ${spec.minPlayers} players to start`
}
