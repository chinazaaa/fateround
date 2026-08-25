/**
 * International / Nigerian Draughts — solo (vs-bot) pure state machine.
 *
 * Same shape as `checkers-solo.ts` but for the 10×10 flying-king engine in
 * `draughts10.ts`. One module serves both variants — the only difference is
 * `session.variant`, which the board component reads to swap presentation.
 *
 * Nigeria's "Street Rules" (huffing) toggle is left OFF here: solo practice
 * keeps to the strict majority-capture rule so the bot search stays exact.
 */

import type { CheckersColor, Draughts10Session, Draughts10Variant } from '@/types'
import {
  DRAUGHTS10_DRAW_PLY,
  DRAUGHTS10_DRAW_REPETITIONS,
  DRAUGHTS10_STARTING_BOARD,
  applyStep,
  hasPieces,
  isValidSquare,
  legalMovesForColor,
  legalStepsFromSquare,
  maxChainLength,
  pieceAt,
  type Draughts10Step,
} from '@/lib/draughts10'

export type Draughts10SoloOutcome = 'human' | 'bot' | 'draw' | null

export type Draughts10SoloState = {
  session: Draughts10Session
  outcome: Draughts10SoloOutcome
}

export type Draughts10SoloStepResult = { state: Draughts10SoloState; error?: string }

export const DRAUGHTS10_SOLO_HUMAN_ID = 'player_human'
export const DRAUGHTS10_SOLO_BOT_ID = 'player_bot'

const HUMAN_COLOR: CheckersColor = 'b'

export type Draughts10SoloInitOptions = {
  variant: Draughts10Variant
  human?: CheckersColor
}

export function initDraughts10Solo(opts: Draughts10SoloInitOptions): Draughts10SoloState {
  const humanColor = opts.human ?? HUMAN_COLOR

  const session: Draughts10Session = {
    id: 'solo',
    game_id: 'solo',
    variant: opts.variant,
    player_red_id: humanColor === 'r' ? DRAUGHTS10_SOLO_HUMAN_ID : DRAUGHTS10_SOLO_BOT_ID,
    player_black_id: humanColor === 'b' ? DRAUGHTS10_SOLO_HUMAN_ID : DRAUGHTS10_SOLO_BOT_ID,
    board: DRAUGHTS10_STARTING_BOARD,
    current_turn: 'b',
    move_count: 0,
    position_counts: {},
    must_continue_from: null,
    must_continue_remaining: null,
    huffing_enabled: false,
    huffable_squares: [],
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

  return { session, outcome: null }
}

export function humanColor(state: Draughts10SoloState): CheckersColor {
  return state.session.player_black_id === DRAUGHTS10_SOLO_HUMAN_ID ? 'b' : 'r'
}

export function botColor(state: Draughts10SoloState): CheckersColor {
  return humanColor(state) === 'r' ? 'b' : 'r'
}

export function isHumanTurn(state: Draughts10SoloState): boolean {
  return state.outcome == null && state.session.current_turn === humanColor(state)
}

export function isBotTurn(state: Draughts10SoloState): boolean {
  return state.outcome == null && state.session.current_turn === botColor(state)
}

/** Legal hops available to `color` right now (honors majority-capture and any active chain). */
export function draughts10SoloLegalSteps(state: Draughts10SoloState, color?: CheckersColor): Draughts10Step[] {
  const c = color ?? state.session.current_turn
  return legalMovesForColor(
    state.session.board,
    c,
    state.session.must_continue_from,
    state.session.must_continue_remaining
  )
}

function reachesFarRank(color: CheckersColor, row: number): boolean {
  return color === 'r' ? row === 0 : row === 9
}

function isKing(piece: string): boolean {
  return piece === 'R' || piece === 'B'
}

export function draughts10SoloMove(
  state: Draughts10SoloState,
  color: CheckersColor,
  from: string,
  to: string
): Draughts10SoloStepResult {
  if (state.outcome != null) return { state, error: 'Game is finished' }
  if (state.session.current_turn !== color) return { state, error: 'Not your turn' }
  if (!isValidSquare(from) || !isValidSquare(to)) return { state, error: 'Illegal move' }

  const steps = legalStepsFromSquare(
    state.session.board,
    color,
    from,
    state.session.must_continue_from,
    state.session.must_continue_remaining
  )
  const step = steps.find((s) => s.to === to)
  if (!step) return { state, error: 'Illegal move' }

  const mover = pieceAt(state.session.board, from)
  const toRow = Number(to[0])
  const captured = !!step.captured

  // Mirror the server engine: compute remaining chain from the actual board after
  // this hop (majority-rule is already baked into which steps are offered).
  const { board: rawAfter, captured: _c } = applyStep(state.session.board, step, false)
  void _c
  const remaining = maxChainLength(rawAfter, step.to)
  const continues = captured && remaining > 0

  const eligibleForCrown = !isKing(mover) && reachesFarRank(color, toRow) && !continues
  const { board: nextBoard } = applyStep(state.session.board, step, eligibleForCrown)
  const crowned = eligibleForCrown
  const nextTurn: CheckersColor = continues ? color : color === 'r' ? 'b' : 'r'

  const kingMove = isKing(mover) && !captured && !crowned
  const moveCount = kingMove ? state.session.move_count + 1 : 0

  let repetition = 0
  let positionCounts: Record<string, number>
  if (kingMove && !continues) {
    const key = `${nextBoard}:${nextTurn}`
    repetition = (state.session.position_counts?.[key] ?? 0) + 1
    positionCounts = { ...state.session.position_counts, [key]: repetition }
  } else if (!continues) {
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
    } else if (repetition >= DRAUGHTS10_DRAW_REPETITIONS) {
      finished = true
      draw = true
      reason = 'threefold'
    } else if (moveCount >= DRAUGHTS10_DRAW_PLY) {
      finished = true
      draw = true
      reason = 'draw_moves'
    }
  }

  const nextSession: Draughts10Session = {
    ...state.session,
    board: nextBoard,
    current_turn: nextTurn,
    move_count: moveCount,
    position_counts: positionCounts,
    must_continue_from: continues ? step.to : null,
    must_continue_remaining: continues ? remaining : null,
    huffable_squares: [],
    last_move_from: step.from,
    last_move_to: step.to,
    status: finished ? 'finished' : 'active',
    result_reason: reason,
    winner_player_id: winnerColor
      ? winnerColor === humanColor(state)
        ? DRAUGHTS10_SOLO_HUMAN_ID
        : DRAUGHTS10_SOLO_BOT_ID
      : null,
    is_draw: draw,
    status_message: buildStatusMessage(state, { finished, draw, continues, nextTurn, winnerColor, reason }),
    turn_deadline_at: null,
  }

  const outcome: Draughts10SoloOutcome = finished
    ? draw
      ? 'draw'
      : winnerColor === humanColor(state)
        ? 'human'
        : 'bot'
    : null

  return { state: { session: nextSession, outcome } }
}

function buildStatusMessage(
  state: Draughts10SoloState,
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
    if (draw) return reason === 'threefold' ? "Threefold repetition — it's a draw!" : "It's a draw — 25-move rule!"
    return winnerColor === hc ? 'You win!' : 'Bot wins!'
  }
  if (continues) return state.session.current_turn === hc ? 'You must keep jumping!' : 'Bot must keep jumping!'
  const isHuman = nextTurn === hc
  const colorLabel = nextTurn === 'r' ? 'Red' : 'Black'
  return isHuman ? `Your turn (${colorLabel})` : `Bot to move (${colorLabel})`
}
