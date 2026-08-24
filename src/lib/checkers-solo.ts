/**
 * Checkers — solo (vs-bot) pure state machine.
 *
 * Same shape as `ayo-solo.ts`: a thin wrapper around the pure board helpers in
 * `checkers.ts`. No Supabase, no async, no timers, no realtime. State is safe
 * to serialize to sessionStorage so a page reload continues the same game.
 *
 * The bot lives in `checkers-bot.ts`; this file is bot-agnostic and models
 * both sides symmetrically. Human plays Black (Dark) and opens first, mirroring
 * standard American draughts.
 */

import type { CheckersColor, CheckersSession } from '@/types'
import {
  CHECKERS_DRAW_PLY,
  CHECKERS_DRAW_REPETITIONS,
  CHECKERS_STARTING_BOARD,
  applyStep,
  hasPieces,
  isValidSquare,
  legalMovesForColor,
  legalStepsFromSquare,
  pieceAt,
  type CheckersStep,
} from '@/lib/checkers'

// ── Types ────────────────────────────────────────────────────────────────────

export type CheckersSoloOutcome = 'human' | 'bot' | 'draw' | null

export type CheckersSoloState = {
  /** Symmetric session — reuses CheckersSession so CheckersGamePanel works unchanged. */
  session: CheckersSession
  outcome: CheckersSoloOutcome
}

export type CheckersSoloStepResult = { state: CheckersSoloState; error?: string }

export const CHECKERS_SOLO_HUMAN_ID = 'player_human'
export const CHECKERS_SOLO_BOT_ID = 'player_bot'

/** Human plays Black (Dark), opens first — same convention as multiplayer. */
const HUMAN_COLOR: CheckersColor = 'b'
const BOT_COLOR: CheckersColor = 'r'

// ── Init ────────────────────────────────────────────────────────────────────

export type CheckersSoloInitOptions = {
  /** Which color the human takes. Defaults to Black (opens first). */
  human?: CheckersColor
}

export function initCheckersSolo(opts: CheckersSoloInitOptions = {}): CheckersSoloState {
  const humanColor = opts.human ?? HUMAN_COLOR
  const botColor: CheckersColor = humanColor === 'r' ? 'b' : 'r'

  const session: CheckersSession = {
    id: 'solo',
    game_id: 'solo',
    player_red_id: humanColor === 'r' ? CHECKERS_SOLO_HUMAN_ID : CHECKERS_SOLO_BOT_ID,
    player_black_id: humanColor === 'b' ? CHECKERS_SOLO_HUMAN_ID : CHECKERS_SOLO_BOT_ID,
    board: CHECKERS_STARTING_BOARD,
    current_turn: 'b',
    move_count: 0,
    position_counts: {},
    must_continue_from: null,
    red_time_ms: null,
    black_time_ms: null,
    turn_started_at: null,
    last_move_from: null,
    last_move_to: null,
    status: 'active',
    result_reason: null,
    winner_player_id: null,
    is_draw: false,
    status_message: humanColor === 'b' ? 'Your turn (Black)' : 'Bot to move (Black)',
    turn_deadline_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  }

  void botColor // colors are derived from ids on read
  return { session, outcome: null }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function humanColor(state: CheckersSoloState): CheckersColor {
  return state.session.player_black_id === CHECKERS_SOLO_HUMAN_ID ? 'b' : 'r'
}

export function botColor(state: CheckersSoloState): CheckersColor {
  return humanColor(state) === 'r' ? 'b' : 'r'
}

export function isHumanTurn(state: CheckersSoloState): boolean {
  return state.outcome == null && state.session.current_turn === humanColor(state)
}

export function isBotTurn(state: CheckersSoloState): boolean {
  return state.outcome == null && state.session.current_turn === botColor(state)
}

/** Legal hops available to `color` right now. Honors any active must-continue. */
export function checkersSoloLegalSteps(state: CheckersSoloState, color?: CheckersColor): CheckersStep[] {
  const c = color ?? state.session.current_turn
  return legalMovesForColor(state.session.board, c, state.session.must_continue_from)
}

// ── Move ────────────────────────────────────────────────────────────────────

/**
 * Apply one hop for `color` from `from` → `to`. A capture that could continue
 * leaves the same side to move and sets `must_continue_from` so the caller
 * (either the UI's click handler or the bot loop) plays the next hop next.
 */
export function checkersSoloMove(
  state: CheckersSoloState,
  color: CheckersColor,
  from: string,
  to: string
): CheckersSoloStepResult {
  if (state.outcome != null) return { state, error: 'Game is finished' }
  if (state.session.current_turn !== color) return { state, error: 'Not your turn' }
  if (!isValidSquare(from) || !isValidSquare(to)) return { state, error: 'Illegal move' }

  const steps = legalStepsFromSquare(state.session.board, color, from, state.session.must_continue_from)
  const step = steps.find((s) => s.to === to)
  if (!step) return { state, error: 'Illegal move' }

  const mover = pieceAt(state.session.board, from)
  const kingBefore = mover === 'R' || mover === 'B'

  const { board: nextBoard, crowned, captured } = applyStep(state.session.board, step)

  // A capturing piece that didn't just crown must keep jumping if it can.
  const continues =
    captured && !crowned && legalMovesForColor(nextBoard, color, to).length > 0 && stillCaptures(nextBoard, to)

  const nextTurn: CheckersColor = continues ? color : color === 'r' ? 'b' : 'r'

  // Draw counter resets on any capture, man move, or crowning; only king moves
  // with no capture tick it up. Mirrors the server engine.
  const kingMove = kingBefore && !captured && !crowned
  const moveCount = kingMove ? state.session.move_count + 1 : 0

  let positionCounts: Record<string, number> = {}
  let repetition = 0
  if (kingMove && !continues) {
    const key = `${nextBoard}:${nextTurn}`
    repetition = (state.session.position_counts?.[key] ?? 0) + 1
    positionCounts = { ...state.session.position_counts, [key]: repetition }
  } else if (!continues) {
    // Irreversible move — clear the repetition table.
    positionCounts = {}
  } else {
    positionCounts = { ...state.session.position_counts }
  }

  let finished = false
  let draw = false
  let reason: string | null = null
  let winnerColor: CheckersColor | null = null

  if (!continues) {
    if (!hasPieces(nextBoard, nextTurn)) {
      finished = true
      winnerColor = color
      reason = 'capture_all'
    } else if (legalMovesForColor(nextBoard, nextTurn).length === 0) {
      finished = true
      winnerColor = color
      reason = 'no_moves'
    } else if (repetition >= CHECKERS_DRAW_REPETITIONS) {
      finished = true
      draw = true
      reason = 'threefold'
    } else if (moveCount >= CHECKERS_DRAW_PLY) {
      finished = true
      draw = true
      reason = 'draw_moves'
    }
  }

  const nextSession: CheckersSession = {
    ...state.session,
    board: nextBoard,
    current_turn: nextTurn,
    move_count: moveCount,
    position_counts: positionCounts,
    must_continue_from: continues ? step.to : null,
    last_move_from: step.from,
    last_move_to: step.to,
    status: finished ? 'finished' : 'active',
    result_reason: reason,
    winner_player_id: winnerColor
      ? winnerColor === humanColor(state)
        ? CHECKERS_SOLO_HUMAN_ID
        : CHECKERS_SOLO_BOT_ID
      : null,
    is_draw: draw,
    status_message: buildStatusMessage(state, {
      finished,
      draw,
      continues,
      nextTurn,
      winnerColor,
      reason,
    }),
    turn_deadline_at: null,
  }

  const outcome: CheckersSoloOutcome = finished
    ? draw
      ? 'draw'
      : winnerColor === humanColor(state)
        ? 'human'
        : 'bot'
    : null

  return { state: { session: nextSession, outcome } }
}

function stillCaptures(board: string, square: string): boolean {
  return legalMovesForColor(board, board[Number(square[0]) * 8 + Number(square[1])] as CheckersColor, square).length > 0
}

function buildStatusMessage(
  state: CheckersSoloState,
  args: {
    finished: boolean
    draw: boolean
    continues: boolean
    nextTurn: CheckersColor
    winnerColor: CheckersColor | null
    reason: string | null
  }
): string {
  const { finished, draw, continues, nextTurn, winnerColor, reason } = args
  const hc = humanColor(state)
  if (finished) {
    if (draw) return reason === 'threefold' ? "Threefold repetition — it's a draw!" : "It's a draw — 40-move rule!"
    return winnerColor === hc ? 'You win!' : 'Bot wins!'
  }
  if (continues) return state.session.current_turn === hc ? 'You must keep jumping!' : 'Bot must keep jumping!'
  const isHuman = nextTurn === hc
  const colorLabel = nextTurn === 'r' ? 'Red' : 'Black'
  return isHuman ? `Your turn (${colorLabel})` : `Bot to move (${colorLabel})`
}
