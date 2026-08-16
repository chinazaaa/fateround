/**
 * Ludo bot — picks one legal move per call.
 *
 * Priority (highest to lowest score):
 *   1. Capture     — always take a direct capture; disruption > raw progress.
 *   2. Setup-cap.  — a non-capturing move that leaves a remaining die able to
 *                    capture on the same turn. The bot only sees one die at a
 *                    time otherwise, so without this lookahead it would burn
 *                    the setup die on unrelated progress and miss the capture
 *                    a human player would spot instantly.
 *   3. Finish      — landing a piece on the finish square.
 *   4. Home        — moving into the home lane (opponents can't chase).
 *   5. Bring-out   — pull a piece out of base on a 6.
 *   6. Furthest    — otherwise, advance the piece currently furthest along.
 *
 * Ties broken by higher `diceValue` (bigger step spent → uses up harder-to-
 * apply dice first) then lower `pieceId` (deterministic).
 *
 * Not modelled here — deliberate simplifications for a "credible filler" bot:
 * - Safe-square landing preference: `isSafeSquare` isn't exported from the
 *   engine; the top four priorities catch nearly every valuable move without
 *   it. A landing on a safe square via progress still scores under Furthest.
 * - Opponent-piece threat modelling: the bot doesn't dodge captures or plan
 *   defensively. That's an "annoyingly smart" territory line; see the room
 *   Monopoly bot's design notes for the same reasoning.
 */

import type { LudoColor, LudoPiece, LudoPlayerState, LudoVariant } from '@/types'
import {
  HOME_ENTRY_STEPS,
  START_POS,
  TRACK_LENGTH,
  applyMoveLocally,
  getLegalMovesFromRemaining,
  LUDO_DEFAULT_VARIANT,
  type LudoMoveOption,
} from '@/lib/ludo'

// Fixed scoring bands — order matters, magnitudes just need to be
// non-overlapping so higher-priority moves always beat lower-priority ones.
const SCORE_CAPTURE = 10_000
// Two-die setup capture: strong, but below a direct capture (the direct one
// resolves this turn regardless of what the second die does).
const SCORE_SETUP_CAPTURE = 8_000
const SCORE_FINISH = 5_000
const SCORE_HOME_LANE_ENTRY = 2_000
const SCORE_BRING_OUT = 1_000
// Furthest-progress adds up to ~60 (max track length), well under bring-out.
const SCORE_PROGRESS_BASE = 0

/**
 * Optional context enabling 2-die lookahead. When passed, the bot simulates
 * each candidate move via `applyMoveLocally` and asks whether any legal move
 * remains that captures — if so, the candidate scores near a direct capture
 * so the bot won't burn the "setup" die on unrelated progress.
 *
 * Kept optional so old call sites (tests, the daily-puzzle helper) that don't
 * have the state on hand still work.
 */
export type LudoBotContext = {
  allStates: LudoPlayerState[]
  playerId: string
  remainingDice: number[]
  variant?: LudoVariant
}

/**
 * Distance along the color's own path (base → track → home lane → finish),
 * measured in steps from the color's start square. Base pieces score 0.
 * Used for the "advance the leader" tiebreaker.
 */
function stepsFromColorStart(color: LudoColor, piece: LudoPiece): number {
  if (piece.zone === 'base') return 0
  if (piece.zone === 'finished') return HOME_ENTRY_STEPS + 5 + 1
  if (piece.zone === 'home') return HOME_ENTRY_STEPS + piece.pos
  return (piece.pos - START_POS[color] + TRACK_LENGTH) % TRACK_LENGTH
}

function scoreMove(move: LudoMoveOption, color: LudoColor, setupsCapture: boolean): number {
  let score = SCORE_PROGRESS_BASE

  if (move.captures) score += SCORE_CAPTURE
  else if (setupsCapture) score += SCORE_SETUP_CAPTURE
  if (move.to.zone === 'finished') score += SCORE_FINISH
  // Entry into the home lane specifically (from track → home), not a further
  // step within it — that's just progress and gets counted below.
  if (move.from.zone === 'track' && move.to.zone === 'home') score += SCORE_HOME_LANE_ENTRY
  if (move.from.zone === 'base' && move.to.zone === 'track') score += SCORE_BRING_OUT

  // Progress tiebreak: reward advancing whichever piece is already furthest.
  // Use the FROM piece's position — the destination position mostly repeats
  // the from + diceValue relationship and would double-count the die step.
  score += stepsFromColorStart(color, move.from)

  return score
}

/**
 * Simulate `candidate` and check whether any legal move using the remaining
 * dice (this turn's dice minus the one this candidate spent) can capture.
 * Used to detect two-die setup captures the per-die score alone would miss.
 *
 * The engine's `applyMoveLocally` mutates the moving player's piece list and
 * — on capture — the victim's; we then re-enumerate legal moves for the
 * remaining dice on the resulting state and look for `captures: true`.
 */
function candidateSetsUpCapture(candidate: LudoMoveOption, color: LudoColor, ctx: LudoBotContext | undefined): boolean {
  if (!ctx) return false
  if (candidate.captures) return false // already a direct capture; no setup bonus needed
  if (candidate.usesAllDice) return false // no die left after this
  const otherDice = ctx.remainingDice.filter((_, i) => i !== candidate.diceIndex)
  if (otherDice.length === 0) return false

  const nextStates = applyMoveLocally(
    ctx.allStates,
    ctx.playerId,
    candidate,
    color,
    ctx.variant ?? LUDO_DEFAULT_VARIANT
  )
  const meAfter = nextStates.find((s) => s.player_id === ctx.playerId)
  if (!meAfter) return false

  const followUps = getLegalMovesFromRemaining(
    color,
    meAfter.pieces,
    otherDice,
    nextStates,
    ctx.playerId,
    ctx.variant ?? LUDO_DEFAULT_VARIANT
  )
  return followUps.some((m) => m.captures)
}

/**
 * Pick the bot's move from a list of legal moves. Callers pass in the moves
 * derived from resolveLudoMovesForTurn (which already dedupes usesAllDice /
 * combined-step options for us). Returns null if there are no legal moves —
 * the state machine will pass the turn.
 */
export function pickLudoBotMove(
  moves: LudoMoveOption[],
  botPlayerState: LudoPlayerState,
  ctx?: LudoBotContext
): LudoMoveOption | null {
  if (moves.length === 0) return null
  const color = botPlayerState.color

  let best: LudoMoveOption | null = null
  let bestScore = -Infinity

  for (const move of moves) {
    const setups = candidateSetsUpCapture(move, color, ctx)
    const score = scoreMove(move, color, setups)
    if (score > bestScore) {
      best = move
      bestScore = score
      continue
    }
    if (score === bestScore && best) {
      // Deterministic tiebreak: bigger dice first (uses up hard dice earlier),
      // then lower pieceId.
      if (move.diceValue > best.diceValue) {
        best = move
      } else if (move.diceValue === best.diceValue && move.pieceId < best.pieceId) {
        best = move
      }
    }
  }

  return best
}
