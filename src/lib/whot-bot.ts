/**
 * Whot vs-bot heuristic — no search, no LLM.
 *
 * Whot has hidden hands, so minimax is unhelpful: at any turn the bot doesn't
 * know a single card the opponent holds, so any depth beyond 1 either assumes
 * or samples. Neither buys much for a party game — a small set of well-tuned
 * heuristics plays credibly and is a hundred times faster.
 *
 * The bot exposes ONE function, `pickBotAction(state)`, that returns the next
 * move for whichever seat has the turn. It never mutates state. The caller
 * (usually the solo page's effect) applies the action via `soloPlay` /
 * `soloDraw` / `soloChoose*` in `whot-solo.ts`.
 *
 * ── Difficulty ────────────────────────────────────────────────────────────
 * `easy` is the same rules but the bot plays the FIRST legal card and always
 * calls its most-held shape. It exists so the "play a game" step of the
 * onboarding funnel isn't demoralising.
 *
 * ── Design principles ─────────────────────────────────────────────────────
 * 1. Legality is the engine's job. The bot only chooses among legal moves.
 * 2. Concrete signals over cleverness: penalty pressure, hand-shedding value,
 *    what the opponent just did.
 * 3. Every branch documents WHY, so the rules stay tuneable later.
 */

import type { WhotCard, WhotShape } from '@/types'
import { canPlayCard, WHOT_SHAPES, type WhotRules } from '@/lib/whot'
import { SOLO_BOT_ID, SOLO_HUMAN_ID, type SoloWhotState, type SoloWhotAction } from '@/lib/whot-solo'

export type WhotBotDifficulty = 'easy' | 'normal'

const CALLABLE_NUMBERS = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14] as const

// ── Card scoring ─────────────────────────────────────────────────────────────

/**
 * Value of playing this card RIGHT NOW, higher = better.
 *
 * The scoring model:
 *   +40  Pick 2 when the opponent has few cards — attacking a short hand hurts
 *   +30  Skip (8) when the opponent is close to winning
 *   +25  Pick 2 as an opportunity strike
 *   +25  Pick 3 (5) — powerful but leaves few defenders
 *   +15  Hold on (1) — free extra turn
 *   +12  General Market (14) — opponent draws + we go again
 *   +N   for the raw card number (shed points; matches lowest-hand tiebreak)
 *   -20  for a WHOT (20). Wilds are precious — hold them for jams.
 */
function normalPlayScore(card: WhotCard, botHand: WhotCard[], opponentHandSize: number): number {
  const n = card.number
  let score = n // baseline: dump the highest points first

  if (n === 20) score -= 20 // don't burn a wild casually

  if (n === 2) {
    score += opponentHandSize <= 3 ? 40 : 25
  } else if (n === 5) {
    score += opponentHandSize <= 3 ? 45 : 25
  } else if (n === 8) {
    score += opponentHandSize <= 3 ? 30 : 15
  } else if (n === 1) {
    score += 15
  } else if (n === 14) {
    score += 12
  }

  // Cluster bonus: cards sharing a shape with the rest of our hand set up chains.
  // Small (+1 per same-shape sibling), because it's tie-break material, not the
  // main driver — dumping high points still comes first.
  const siblings = botHand.filter((c) => c.id !== card.id && c.shape === card.shape).length
  score += Math.min(3, siblings)

  return score
}

/** Playing under an active Pick 2/3: any legal defender counts; prefer the higher-value one. */
function penaltyPlayScore(card: WhotCard): number {
  return card.number // 2 vs 2, 5 vs 5 — either way, higher-numbered goes first
}

// ── Shape / number call after playing WHOT ──────────────────────────────────

/**
 * When the bot plays a WHOT it must call a shape (and optionally a number).
 * Strategy: name the shape we hold MOST of. That makes our next card most
 * likely to remain legal after the opponent's reply, and it never wastes a
 * genuine hand — the opponent may still match with whatever they have.
 */
function bestShapeCall(hand: WhotCard[]): WhotShape {
  const counts = new Map<WhotShape, number>()
  for (const c of hand) {
    if (c.shape === 'whot') continue
    counts.set(c.shape, (counts.get(c.shape) ?? 0) + 1)
  }
  let best: WhotShape = 'circle'
  let bestN = -1
  for (const shape of WHOT_SHAPES) {
    if (shape === 'whot') continue
    const n = counts.get(shape) ?? 0
    if (n > bestN) {
      bestN = n
      best = shape
    }
  }
  return best
}

/**
 * If number calls are enabled the bot considers naming a number the opponent is
 * unlikely to hold. We only take that path when we have a specific number we
 * hold multiple of — otherwise a shape call is strictly better (broader match).
 */
function bestNumberCall(hand: WhotCard[]): number | null {
  const counts = new Map<number, number>()
  for (const c of hand) {
    if (c.number === 20) continue
    counts.set(c.number, (counts.get(c.number) ?? 0) + 1)
  }
  let best: number | null = null
  let bestN = 1
  for (const [n, count] of counts) {
    if (!CALLABLE_NUMBERS.includes(n as (typeof CALLABLE_NUMBERS)[number])) continue
    if (count > bestN) {
      bestN = count
      best = n
    }
  }
  return best
}

// ── Main decision ───────────────────────────────────────────────────────────

/**
 * Choose the bot's next action. The caller passes the current state; the bot
 * inspects its own seat (SOLO_BOT_ID) and returns an action the engine will
 * accept. `null` means the engine wasn't waiting for the bot — treat as no-op.
 */
export function pickBotAction(state: SoloWhotState, difficulty: WhotBotDifficulty = 'normal'): SoloWhotAction | null {
  if (state.outcome != null) return null
  const rawBotIdx = state.session.turn_order.indexOf(SOLO_BOT_ID)
  if (rawBotIdx < 0) return null
  const botIdx: 0 | 1 = rawBotIdx === 1 ? 1 : 0
  if (state.session.current_turn_index !== botIdx) return null

  const hand = state.hands[botIdx]!

  // Shape/number choice after the bot's own WHOT.
  if (state.session.phase === 'choose_whot') {
    if (state.rules.numberCallsEnabled) {
      const numberCall = bestNumberCall(hand)
      // Only call a number when we hold at least two of it — a broader shape call
      // matches more of the opponent's plausible responses.
      if (numberCall != null) return { type: 'choose_number', n: numberCall }
    }
    return { type: 'choose_shape', shape: bestShapeCall(hand) }
  }
  const playable = hand.filter((c) => canPlayCard(c, state.session, state.rules))
  if (playable.length === 0) return { type: 'draw' }

  // Easy: first legal card. Bad, on purpose.
  if (difficulty === 'easy') {
    return { type: 'play', cardId: playable[0]!.id }
  }

  const opponentIdx: 0 | 1 = botIdx === 0 ? 1 : 0
  const opponentSize = state.hands[opponentIdx]!.length
  const inPenalty = (state.session.pick_two_stack ?? 0) > 0 || (state.session.pick_five_stack ?? 0) > 0

  const scored = playable
    .map((card) => ({
      card,
      score: inPenalty ? penaltyPlayScore(card) : normalPlayScore(card, hand, opponentSize),
    }))
    .sort((a, b) => b.score - a.score)

  return { type: 'play', cardId: scored[0]!.card.id }
}

/** Diagnostic helper for tests + debugging. Same scoring as pickBotAction. */
export function scoreBotCandidates(state: SoloWhotState): Array<{ card: WhotCard; score: number }> {
  const botIdx: 0 | 1 = state.session.turn_order.indexOf(SOLO_BOT_ID) === 1 ? 1 : 0
  const hand = state.hands[botIdx]!
  const playable = hand.filter((c) => canPlayCard(c, state.session, state.rules))
  const inPenalty = (state.session.pick_two_stack ?? 0) > 0 || (state.session.pick_five_stack ?? 0) > 0
  const oppSize = state.hands[botIdx === 0 ? 1 : 0]!.length
  return playable
    .map((card) => ({
      card,
      score: inPenalty ? penaltyPlayScore(card) : normalPlayScore(card, hand, oppSize),
    }))
    .sort((a, b) => b.score - a.score)
}

/** Sanity export so a page can construct the bot's seat id without importing whot-solo just for that. */
export const BOT_SEAT_ID = SOLO_BOT_ID
export const HUMAN_SEAT_ID = SOLO_HUMAN_ID

/** Rules helper: the bot doesn't need to inspect rules directly, only the engine does. */
export type { WhotRules }
