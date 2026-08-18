/**
 * Ayo vs-bot — minimax with alpha-beta pruning.
 *
 * Ayo has perfect information (both players see all seeds and all pits), so
 * minimax is the right tool — not a heuristic pattern-matcher like Whot. The
 * branching factor is 6 (moves per side, sometimes fewer once pits empty),
 * which makes depth 6 comfortable and depth 8 fine on any device.
 *
 * The engine's `applyAyoMove` is pure and returns a full transition tuple —
 * so the search re-uses it directly with no simulation of its own.
 *
 * ── Difficulty ────────────────────────────────────────────────────────────
 *   easy    depth 1 — one-ply lookahead ≈ "pick the move with the best
 *                     immediate capture", enough to feel human without being
 *                     a punishing opponent for a first-time player.
 *   normal  depth 4
 *   hard    depth 6
 *
 * ── Evaluation ────────────────────────────────────────────────────────────
 * From the BOT's perspective (side 'b'). Higher = better for the bot.
 *   +1000 per house captured (traditional): rounds are worth games
 *   + 10  per seed captured
 *   +  2  per seed sitting on the bot's own row (potential ammo)
 *   -  2  per seed on the human's row (potential attack against us)
 *   +  1  per legal move available (mobility)
 * Terminal states short-circuit to ±100_000.
 *
 * There is no LLM here. There will never be an LLM here. This runs in
 * microseconds and returns exact best moves for the tree it saw.
 */

import type { AyoSession, AyoSide } from './types'
import { applyAyoMove, boardConfigFromSession, legalMovesForSide, totalSeedsOnSide, type AyoBoardConfig } from './ayo'
import { AYO_SOLO_BOT_ID, type AyoSoloState } from './ayo-solo'

export type AyoBotDifficulty = 'easy' | 'normal' | 'hard'

const DEPTH_BY_DIFFICULTY: Record<AyoBotDifficulty, number> = {
  easy: 1,
  normal: 4,
  hard: 6,
}

// Terminal scores — set well above any evaluation output so the search always
// prefers a real win / avoids a real loss over any positional heuristic gain.
const WIN_SCORE = 100_000
const LOSS_SCORE = -100_000

// ── Position node passed through the search ─────────────────────────────────

type Position = {
  pits: number[]
  capturedA: number
  capturedB: number
  housesA: number
  housesB: number
  aRowSize: number
  bRowSize: number
  turn: AyoSide
}

function sessionToPosition(session: AyoSession): Position {
  return {
    pits: [...session.pits],
    capturedA: session.captured_a,
    capturedB: session.captured_b,
    housesA: session.houses_a,
    housesB: session.houses_b,
    aRowSize: session.a_row_size,
    bRowSize: session.b_row_size,
    turn: session.current_turn,
  }
}

// ── Evaluation ──────────────────────────────────────────────────────────────

/**
 * Score a non-terminal position from the BOT's perspective (side 'b').
 * Weights favour concrete gains (captured seeds, houses won) over positional
 * signals so the search converges on wins rather than long positional games.
 */
function evaluate(pos: Position, config: AyoBoardConfig): number {
  const captureDelta = pos.capturedB - pos.capturedA
  const houseDelta = pos.housesB - pos.housesA

  // Board seed distribution — potential future material.
  const seedsA = totalSeedsOnSide(pos.pits, 'a', config)
  const seedsB = totalSeedsOnSide(pos.pits, 'b', config)
  const seedDelta = seedsB - seedsA

  // Mobility — number of legal moves for each side.
  const mobilityB = legalMovesForSide(pos.pits, 'b', config).length
  const mobilityA = legalMovesForSide(pos.pits, 'a', config).length
  const mobility = mobilityB - mobilityA

  return houseDelta * 1000 + captureDelta * 10 + seedDelta * 2 + mobility * 1
}

/**
 * Apply a move to a position and return the resulting position. Wraps
 * `applyAyoMove`, adapting its result tuple back into the `Position` shape.
 * Returns null when the underlying engine says the move is illegal (should
 * never happen for moves coming from `legalMovesForSide`, but defensive).
 */
function stepPosition(pos: Position, side: AyoSide, pit: number, config: AyoBoardConfig): Position | null {
  try {
    const r = applyAyoMove(pos.pits, pos.capturedA, pos.capturedB, pos.housesA, pos.housesB, side, pit, config)
    return {
      pits: r.pits,
      capturedA: r.capturedA,
      capturedB: r.capturedB,
      housesA: r.housesA,
      housesB: r.housesB,
      aRowSize: r.aRowSize,
      bRowSize: r.bRowSize,
      turn: r.nextTurn,
    }
  } catch {
    return null
  }
}

// ── Minimax with alpha-beta ─────────────────────────────────────────────────

/**
 * Return the best score for `pos.turn`'s side, viewed from the bot's side.
 * When `pos.turn === 'b'` we're maximising; when `pos.turn === 'a'` we're
 * minimising (from the bot's perspective).
 *
 * The search terminates when EITHER depth is exhausted OR the position has no
 * legal moves — the latter is a natural terminal in Ayo (starves the side
 * whose turn it is). No transposition table; branching is small enough that
 * simple pruning is fast enough for a party-game bot.
 */
function search(pos: Position, depth: number, alpha: number, beta: number, config: AyoBoardConfig): number {
  const moves = legalMovesForSide(pos.pits, pos.turn, config)

  // Terminal by starvation — the side to move has no legal move and the game ends.
  // Score is a decisive win/loss for whichever side has more seeds already banked
  // (a full engine check would collect leftover row seeds, but for search we can
  // approximate with the current capture totals plus rows — good enough to pick
  // the WINNING branch, which is the search's actual job).
  if (moves.length === 0) {
    const finalA = pos.capturedA + totalSeedsOnSide(pos.pits, 'a', config)
    const finalB = pos.capturedB + totalSeedsOnSide(pos.pits, 'b', config)
    if (finalB > finalA) return WIN_SCORE
    if (finalA > finalB) return LOSS_SCORE
    return 0
  }

  if (depth === 0) return evaluate(pos, config)

  const maximising = pos.turn === 'b'

  if (maximising) {
    let best = -Infinity
    let a = alpha
    for (const pit of moves) {
      const next = stepPosition(pos, 'b', pit, config)
      if (!next) continue
      const score = search(next, depth - 1, a, beta, config)
      if (score > best) best = score
      if (best > a) a = best
      if (a >= beta) break
    }
    return best
  }

  let best = Infinity
  let b = beta
  for (const pit of moves) {
    const next = stepPosition(pos, 'a', pit, config)
    if (!next) continue
    const score = search(next, depth - 1, alpha, b, config)
    if (score < best) best = score
    if (best < b) b = best
    if (alpha >= b) break
  }
  return best
}

/**
 * Choose the bot's next move. Returns the pit index, or `null` when it's not
 * the bot's turn or the bot has no legal moves (game is effectively over).
 *
 * Ties on the root score are broken by "move that captures the most seeds
 * THIS turn" — a small preference for gratifying moves in an otherwise-flat
 * tree, which reads better than picking the numerically-first pit.
 */
export function pickAyoBotMove(state: AyoSoloState, difficulty: AyoBotDifficulty = 'normal'): number | null {
  if (state.outcome != null) return null
  if (state.session.current_turn !== 'b') return null
  if (state.session.player_b_id !== AYO_SOLO_BOT_ID) return null

  const config = boardConfigFromSession(state.session, state.variant)
  const moves = legalMovesForSide(state.session.pits, 'b', config)
  if (moves.length === 0) return null
  if (moves.length === 1) return moves[0]!

  const pos = sessionToPosition(state.session)
  const depth = DEPTH_BY_DIFFICULTY[difficulty]

  let bestPit = moves[0]!
  let bestScore = -Infinity
  let bestImmediateCapture = -1

  for (const pit of moves) {
    const child = stepPosition(pos, 'b', pit, config)
    if (!child) continue
    const score = search(child, depth - 1, -Infinity, Infinity, config)
    // Prefer the higher-scoring move; if two branches score equally, prefer
    // the one that grabs more seeds THIS turn — reads better and helps break
    // the "always picks the first pit" tie pattern.
    const immediateCapture = child.capturedB - pos.capturedB
    if (score > bestScore || (score === bestScore && immediateCapture > bestImmediateCapture)) {
      bestScore = score
      bestPit = pit
      bestImmediateCapture = immediateCapture
    }
  }
  return bestPit
}
