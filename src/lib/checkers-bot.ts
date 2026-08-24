/**
 * Checkers vs-bot — negamax with alpha-beta pruning.
 *
 * American 8×8 draughts: perfect information, small branching factor, forced
 * captures. Minimax with alpha-beta is exact for the tree it visits, and cheap
 * enough at these depths to run in the browser without a worker.
 *
 * ── Difficulty ────────────────────────────────────────────────────────────
 *   easy    depth 1 — greedy: one-ply lookahead, ~"beat a first-time player".
 *   normal  depth 4
 *   hard    depth 6
 *
 * ── Evaluation ────────────────────────────────────────────────────────────
 * From the mover's perspective. Higher = better.
 *   +100 per own man, +160 per own king (kings ≈ 1.6× a man)
 *   −100 per enemy man, −160 per enemy king
 *   + small advancement bonus for men (further up the board)
 *   + small back-rank bonus (defending your own promotion row)
 *   + small mobility term
 * Terminal states (no legal moves for the side to move) → ±100_000.
 *
 * Multi-jumps: this bot picks ONE hop at a time. The engine sets
 * `must_continue_from` after a capture that can chain, and the solo state
 * machine keeps the turn on the bot's color — so the outer bot loop just fires
 * again and the next hop is picked with the same search.
 */

import type { CheckersColor } from '@/types'
import {
  applyStep,
  hasPieces,
  legalMovesForColor,
  colorOfPiece,
  type CheckersStep,
} from '@/lib/checkers'
import { CHECKERS_SOLO_BOT_ID, botColor, type CheckersSoloState } from '@/lib/checkers-solo'

export type CheckersBotDifficulty = 'easy' | 'normal' | 'hard'

const DEPTH_BY_DIFFICULTY: Record<CheckersBotDifficulty, number> = {
  easy: 1,
  normal: 4,
  hard: 6,
}

const WIN_SCORE = 100_000
const LOSS_SCORE = -100_000

const MAN_VALUE = 100
const KING_VALUE = 160

// ── Evaluation ──────────────────────────────────────────────────────────────

function evaluate(board: string, mover: CheckersColor): number {
  let score = 0
  let ownMoves = 0
  let oppMoves = 0
  const opp: CheckersColor = mover === 'r' ? 'b' : 'r'

  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if ((r + c) % 2 === 0) continue
      const ch = board[r * 8 + c]
      const color = colorOfPiece(ch)
      if (!color) continue
      const king = ch === ch.toUpperCase()
      const base = king ? KING_VALUE : MAN_VALUE

      // Advancement: reward men who've pushed toward promotion. Red promotes
      // at row 0, Black at row 7.
      const advance = king ? 0 : color === 'r' ? 7 - r : r

      // Back-rank defense: a piece still on its own home rank blocks
      // opponent promotion. Only meaningful for men.
      const backRank = !king && ((color === 'r' && r === 7) || (color === 'b' && r === 0)) ? 4 : 0

      const contrib = base + advance * 2 + backRank
      if (color === mover) score += contrib
      else score -= contrib
    }
  }

  ownMoves = legalMovesForColor(board, mover).length
  oppMoves = legalMovesForColor(board, opp).length
  score += (ownMoves - oppMoves) * 2

  return score
}

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Negamax with alpha-beta. Returns the best score for `side` from `board`.
 *
 * `mustContinue` reflects an in-progress multi-jump: only that square may
 * move, and only by capturing. When a capture continues, the same side stays
 * on the move (no color flip).
 */
function search(
  board: string,
  side: CheckersColor,
  depth: number,
  alpha: number,
  beta: number,
  mustContinue: string | null
): number {
  // Terminal: whoever has the turn can't move (either no pieces or blocked)
  // loses. Mirrors the engine's `capture_all` / `no_moves` end conditions.
  if (!hasPieces(board, side)) return -WIN_SCORE
  const moves = legalMovesForColor(board, side, mustContinue)
  if (moves.length === 0) return -WIN_SCORE

  if (depth === 0) return evaluate(board, side)

  let best = -Infinity
  let a = alpha
  for (const step of moves) {
    const { board: next, crowned, captured } = applyStep(board, step)
    const continues =
      captured && !crowned && legalMovesForColor(next, side, step.to).length > 0

    let score: number
    if (continues) {
      // Same side to move — don't decrement depth (a chain is one logical turn).
      score = search(next, side, depth, a, beta, step.to)
    } else {
      const opp: CheckersColor = side === 'r' ? 'b' : 'r'
      score = -search(next, opp, depth - 1, -beta, -a, null)
    }
    if (score > best) best = score
    if (best > a) a = best
    if (a >= beta) break
  }
  return best
}

// ── Root ────────────────────────────────────────────────────────────────────

/**
 * Choose the bot's next hop. Returns null when it's not the bot's turn or the
 * bot has no legal moves (the outer solo state has already flagged terminal).
 *
 * Tie-breakers:
 *   1. Higher search score.
 *   2. Prefer captures over quiet moves (already implicit under forced-capture,
 *      but keeps depth-1 gratifying).
 *   3. Deterministic-but-varied fallback: first move in generation order.
 */
export function pickCheckersBotMove(
  state: CheckersSoloState,
  difficulty: CheckersBotDifficulty = 'normal'
): CheckersStep | null {
  if (state.outcome != null) return null
  const bot = botColor(state)
  if (state.session.current_turn !== bot) return null
  if (state.session.player_red_id !== CHECKERS_SOLO_BOT_ID && state.session.player_black_id !== CHECKERS_SOLO_BOT_ID) {
    return null
  }

  const moves = legalMovesForColor(state.session.board, bot, state.session.must_continue_from)
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0]!

  const depth = DEPTH_BY_DIFFICULTY[difficulty]
  let bestStep = moves[0]!
  let bestScore = -Infinity
  let bestCapture = -1

  for (const step of moves) {
    const { board: next, crowned, captured } = applyStep(state.session.board, step)
    const continues =
      captured && !crowned && legalMovesForColor(next, bot, step.to).length > 0

    let score: number
    if (continues) {
      score = search(next, bot, depth, -Infinity, Infinity, step.to)
    } else {
      const opp: CheckersColor = bot === 'r' ? 'b' : 'r'
      score = -search(next, opp, depth - 1, -Infinity, Infinity, null)
    }

    const captureBonus = step.captured ? 1 : 0
    if (score > bestScore || (score === bestScore && captureBonus > bestCapture)) {
      bestScore = score
      bestStep = step
      bestCapture = captureBonus
    }
  }

  return bestStep
}
