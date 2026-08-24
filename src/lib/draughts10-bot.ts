/**
 * International / Nigerian Draughts vs-bot — negamax with alpha-beta.
 *
 * 10×10 flying-king board; mandatory majority-capture already collapses the
 * root branching to the maximal-length chains only, which keeps the search
 * cheap even at depth 4–6. Multi-jumps are chosen one hop at a time — the
 * bot loop re-fires after each hop while the turn stays with the bot.
 *
 * ── Difficulty ────────────────────────────────────────────────────────────
 *   easy    depth 1
 *   normal  depth 3
 *   hard    depth 5
 *
 * ── Evaluation ────────────────────────────────────────────────────────────
 * From the mover's perspective. Kings are worth much more on 10×10 with the
 * flying-king rule (long-range attack) than they are on American 8×8.
 */

import type { CheckersColor } from '@/types'
import {
  applyStep,
  colorOfPiece,
  hasPieces,
  legalMovesForColor,
  maxChainLength,
  type Draughts10Step,
} from '@/lib/draughts10'
import { DRAUGHTS10_SOLO_BOT_ID, botColor, type Draughts10SoloState } from '@/lib/draughts10-solo'

export type Draughts10BotDifficulty = 'easy' | 'normal' | 'hard'

const DEPTH_BY_DIFFICULTY: Record<Draughts10BotDifficulty, number> = {
  easy: 1,
  normal: 3,
  hard: 5,
}

const WIN_SCORE = 100_000
const MAN_VALUE = 100
const KING_VALUE = 260

function isKing(piece: string): boolean {
  return piece === 'R' || piece === 'B'
}

function reachesFarRank(color: CheckersColor, row: number): boolean {
  return color === 'r' ? row === 0 : row === 9
}

function evaluate(board: string, mover: CheckersColor): number {
  const opp: CheckersColor = mover === 'r' ? 'b' : 'r'
  let score = 0
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 10; c += 1) {
      if ((r + c) % 2 === 0) continue
      const ch = board[r * 10 + c]
      const color = colorOfPiece(ch)
      if (!color) continue
      const king = isKing(ch)
      const base = king ? KING_VALUE : MAN_VALUE
      const advance = king ? 0 : color === 'r' ? 9 - r : r
      const contrib = base + advance * 2
      if (color === mover) score += contrib
      else score -= contrib
    }
  }
  score += (legalMovesForColor(board, mover).length - legalMovesForColor(board, opp).length) * 1
  return score
}

function search(
  board: string,
  side: CheckersColor,
  depth: number,
  alpha: number,
  beta: number,
  mustContinue: string | null,
  mustRemaining: number | null
): number {
  if (!hasPieces(board, side)) return -WIN_SCORE
  const moves = legalMovesForColor(board, side, mustContinue, mustRemaining)
  if (moves.length === 0) return -WIN_SCORE
  if (depth === 0) return evaluate(board, side)

  let best = -Infinity
  let a = alpha
  for (const step of moves) {
    const toRow = Number(step.to[0])
    const capturedAny = !!step.captured

    // Determine chain continuation via majority-rule bookkeeping (mirrors
    // the server engine's approach): re-derive remaining from the raw board.
    const { board: raw } = applyStep(board, step, false)
    const remaining = capturedAny ? maxChainLength(raw, step.to) : 0
    const continues = capturedAny && remaining > 0
    const piece = board[Number(step.from[0]) * 10 + Number(step.from[1])] ?? '.'
    const eligibleForCrown = !isKing(piece) && reachesFarRank(side, toRow) && !continues
    const { board: next } = applyStep(board, step, eligibleForCrown)

    let score: number
    if (continues) {
      score = search(next, side, depth, a, beta, step.to, remaining)
    } else {
      const opp: CheckersColor = side === 'r' ? 'b' : 'r'
      score = -search(next, opp, depth - 1, -beta, -a, null, null)
    }
    if (score > best) best = score
    if (best > a) a = best
    if (a >= beta) break
  }
  return best
}

export function pickDraughts10BotMove(
  state: Draughts10SoloState,
  difficulty: Draughts10BotDifficulty = 'normal'
): Draughts10Step | null {
  if (state.outcome != null) return null
  const bot = botColor(state)
  if (state.session.current_turn !== bot) return null
  if (state.session.player_red_id !== DRAUGHTS10_SOLO_BOT_ID && state.session.player_black_id !== DRAUGHTS10_SOLO_BOT_ID) {
    return null
  }

  const moves = legalMovesForColor(
    state.session.board,
    bot,
    state.session.must_continue_from,
    state.session.must_continue_remaining
  )
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0]!

  const depth = DEPTH_BY_DIFFICULTY[difficulty]
  let bestStep = moves[0]!
  let bestScore = -Infinity
  let bestCapture = -1

  for (const step of moves) {
    const toRow = Number(step.to[0])
    const capturedAny = !!step.captured
    const { board: raw } = applyStep(state.session.board, step, false)
    const remaining = capturedAny ? maxChainLength(raw, step.to) : 0
    const continues = capturedAny && remaining > 0
    const piece = state.session.board[Number(step.from[0]) * 10 + Number(step.from[1])] ?? '.'
    const eligibleForCrown = !isKing(piece) && reachesFarRank(bot, toRow) && !continues
    const { board: next } = applyStep(state.session.board, step, eligibleForCrown)

    let score: number
    if (continues) {
      score = search(next, bot, depth, -Infinity, Infinity, step.to, remaining)
    } else {
      const opp: CheckersColor = bot === 'r' ? 'b' : 'r'
      score = -search(next, opp, depth - 1, -Infinity, Infinity, null, null)
    }
    const captureBonus = capturedAny ? 1 : 0
    if (score > bestScore || (score === bestScore && captureBonus > bestCapture)) {
      bestScore = score
      bestStep = step
      bestCapture = captureBonus
    }
  }
  return bestStep
}
