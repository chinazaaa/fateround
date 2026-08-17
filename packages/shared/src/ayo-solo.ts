/**
 * Ayo — solo (vs-bot) pure state machine.
 *
 * Unlike Whot, the Ayo engine (`ayo.ts`) already exposes `applyAyoMove` as a
 * pure function that returns the full next-state tuple (pits, captures,
 * houses, next turn, terminal flags). This module is a thin wrapper: it holds
 * an `AyoSession`, delegates every move to `applyAyoMove`, and folds the
 * result back into a new session.
 *
 * No Supabase, no async, no timers, no realtime. State is safe to serialize
 * to sessionStorage so a reload survives.
 *
 * The bot itself lives in `ayo-bot.ts`; this file is bot-agnostic and models
 * both sides symmetrically as sides 'a' (human) and 'b' (bot).
 */

import type { AyoSession, AyoSide, AyoVariant } from './types'
import {
  AYO_DEFAULT_VARIANT,
  AYO_PIT_COUNT,
  AYO_PITS_PER_SIDE,
  AYO_STARTING_SEEDS,
  applyAyoMove,
  boardConfigFromSession,
  legalMovesForSide,
  startingPits,
  type AyoBoardConfig,
} from './ayo'

// ── Types ────────────────────────────────────────────────────────────────────

export type AyoSoloOutcome = 'a' | 'b' | 'draw' | null

export type AyoSoloState = {
  /** Symmetric session — reuses `AyoSession` so AyoGamePanel works unchanged. */
  session: AyoSession
  variant: AyoVariant
  outcome: AyoSoloOutcome
  /** Human-readable feed of the last several events, newest last. */
  log: string[]
}

export type AyoSoloStepResult = { state: AyoSoloState; error?: string }

export const AYO_SOLO_HUMAN_ID = 'player_a'
export const AYO_SOLO_BOT_ID = 'player_b'
const HUMAN_SIDE: AyoSide = 'a'
const LOG_LIMIT = 12

const NAMES: Record<AyoSide, string> = { a: 'You', b: 'Bot' }

// ── Init ────────────────────────────────────────────────────────────────────

export type AyoSoloInitOptions = {
  variant?: AyoVariant
  first?: AyoSide
}

export function initAyoSolo(opts: AyoSoloInitOptions = {}): AyoSoloState {
  const variant = opts.variant ?? AYO_DEFAULT_VARIANT
  const first = opts.first ?? HUMAN_SIDE

  const session: AyoSession = {
    id: 'solo',
    game_id: 'solo',
    player_a_id: AYO_SOLO_HUMAN_ID,
    player_b_id: AYO_SOLO_BOT_ID,
    pits: startingPits(),
    captured_a: 0,
    captured_b: 0,
    houses_a: 0,
    houses_b: 0,
    match_round: 1,
    a_row_size: AYO_PITS_PER_SIDE,
    b_row_size: AYO_PITS_PER_SIDE,
    current_turn: first,
    a_win_streak: 0,
    b_win_streak: 0,
    a_time_ms: null,
    b_time_ms: null,
    turn_started_at: null,
    last_pit: null,
    status: 'active',
    result_reason: null,
    winner_player_id: null,
    is_draw: false,
    status_message: null,
    turn_deadline_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  }

  return {
    session,
    variant,
    outcome: null,
    log: [`${NAMES[first]} to move — ${AYO_STARTING_SEEDS} seeds per pit`],
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

function log(state: AyoSoloState, line: string): AyoSoloState {
  return { ...state, log: [...state.log, line].slice(-LOG_LIMIT) }
}

export function ayoSoloConfig(state: AyoSoloState): AyoBoardConfig {
  return boardConfigFromSession(state.session, state.variant)
}

/** Convenience: legal pit indices for whichever side has the turn. */
export function ayoSoloLegalMoves(state: AyoSoloState, side?: AyoSide): number[] {
  const s = side ?? state.session.current_turn
  return legalMovesForSide(state.session.pits, s, ayoSoloConfig(state))
}

// ── Move ────────────────────────────────────────────────────────────────────

/**
 * Apply a move for `side` from `pitIndex`. Thin wrapper around `applyAyoMove`
 * — the engine's terminal detection, endgame rules and capture logic all live
 * in that pure function, so solo just folds its result back into a session.
 */
export function ayoSoloMove(state: AyoSoloState, side: AyoSide, pitIndex: number): AyoSoloStepResult {
  if (state.outcome != null) return { state, error: 'Game is finished' }
  if (state.session.current_turn !== side) return { state, error: 'Not your turn' }

  const legal = ayoSoloLegalMoves(state, side)
  if (!legal.includes(pitIndex)) return { state, error: 'Illegal pit' }

  let result
  try {
    result = applyAyoMove(
      state.session.pits,
      state.session.captured_a,
      state.session.captured_b,
      state.session.houses_a,
      state.session.houses_b,
      side,
      pitIndex,
      ayoSoloConfig(state)
    )
  } catch (err) {
    return { state, error: (err as Error).message }
  }

  const captured = result.capturedThisMove
  const notes: string[] = [`${NAMES[side]} played pit ${pitIndex}`]
  if (captured > 0) notes.push(`captured ${captured}`)

  const nextSession: AyoSession = {
    ...state.session,
    pits: result.pits,
    captured_a: result.capturedA,
    captured_b: result.capturedB,
    houses_a: result.housesA,
    houses_b: result.housesB,
    a_row_size: result.aRowSize,
    b_row_size: result.bRowSize,
    current_turn: result.nextTurn,
    last_pit: result.lastPit,
    status: result.finished ? 'finished' : 'active',
    result_reason: result.resultReason,
    is_draw: result.draw,
    winner_player_id: result.winnerSide ? (result.winnerSide === 'a' ? AYO_SOLO_HUMAN_ID : AYO_SOLO_BOT_ID) : null,
  }

  const outcome: AyoSoloOutcome = result.finished
    ? result.draw
      ? 'draw'
      : ((result.winnerSide as AyoSide | null) ?? null)
    : null

  if (result.finished) {
    notes.push(result.draw ? "it's a draw" : `${NAMES[result.winnerSide as AyoSide]} wins`)
  }

  return { state: log({ ...state, session: nextSession, outcome }, notes.join(' · ')) }
}

/** Sanity check: pit indices in expected ranges for a 12-cup board. */
export function isValidAyoPitIndex(pit: number): boolean {
  return Number.isInteger(pit) && pit >= 0 && pit < AYO_PIT_COUNT
}
