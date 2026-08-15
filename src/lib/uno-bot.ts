/**
 * UNO vs-bot heuristic — no search, no LLM.
 *
 * Hidden hands, no full information: pattern-match, not minimax. Mirrors the
 * Whot / Crazy Eights bot design, adapted to UNO's card families:
 *
 *   Wilds (wild, wild_draw4) → hoard for jams; use Wild Draw 4 as a strike
 *                              when the opponent is close to winning
 *   Draw 2                   → same "attack short hand" logic as Pick 2
 *   Skip / Reverse           → in 2p, both act as skip → free extra turn
 *   Number                   → shed high-value cards first (matches the
 *                              lowest-hand-sum end policy)
 *
 * `easy` plays the first legal card and always calls red; `normal` runs the
 * scoring below.
 */

import type { UnoCard, UnoColor } from '@/types'
import { cardPoints, isWildCard } from '@/lib/uno'
import { UNO_SOLO_BOT_ID, isPlayable, type UnoSoloAction, type UnoSoloState } from '@/lib/uno-solo'

export type UnoBotDifficulty = 'easy' | 'normal'

const COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue']

// ── Card scoring ─────────────────────────────────────────────────────────────

/**
 * Score a legal candidate. Wilds are ASSIGNED (not adjusted) because
 * cardPoints puts them at 50, and any "-30" adjustment would leave them more
 * attractive than any number card the bot could play instead.
 */
function normalPlayScore(card: UnoCard, botHand: UnoCard[], opponentHandSize: number): number {
  let score: number
  if (card.kind === 'wild_draw4') {
    // Strong: opponent draws 4 + we pick the colour. Worth using when we
    // want to close a game; otherwise still valuable but not as much.
    score = opponentHandSize <= 3 ? 65 : 20
  } else if (card.kind === 'wild') {
    score = -20 // hoard plain wilds — only spend when nothing else is legal
  } else {
    score = cardPoints(card) // shed high-value cards first

    if (card.kind === 'draw2') score += opponentHandSize <= 3 ? 40 : 22
    else if (card.kind === 'skip' || card.kind === 'reverse') score += opponentHandSize <= 3 ? 25 : 12
  }

  // Cluster bonus — cards sharing a colour with the rest of the hand set up
  // chains. Small (+1 per sibling, cap +3).
  const siblings = botHand.filter((c) => c.id !== card.id && c.color === card.color && c.color !== 'wild').length
  score += Math.min(3, siblings)

  return score
}

/**
 * Score under an active draw penalty. The only legal candidates here are the
 * same-kind stackers (Draw 2 on Draw 2, WD4 on WD4). Higher pending stack →
 * more attractive to defend, so a bot facing "draw 6" strongly prefers to
 * stack it back rather than eat the cards.
 */
function penaltyPlayScore(card: UnoCard, pending: number): number {
  return card.kind === 'wild_draw4' ? 100 + pending : 50 + pending
}

// ── Colour call after playing a wild ─────────────────────────────────────────

/**
 * Call the colour the bot holds the most of, so the bot's next card is most
 * likely to remain legal after the opponent's response.
 */
function bestColorCall(hand: UnoCard[]): UnoColor {
  const counts: Record<UnoColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 }
  for (const c of hand) {
    if (c.color === 'wild') continue
    counts[c.color as UnoColor] += 1
  }
  let best: UnoColor = 'red'
  let bestN = -1
  for (const col of COLORS) {
    if (counts[col] > bestN) {
      bestN = counts[col]
      best = col
    }
  }
  return best
}

// ── Main decision ───────────────────────────────────────────────────────────

/**
 * Pick the bot's next action. Returns null when the engine isn't waiting on
 * the bot.
 */
export function pickBotAction(state: UnoSoloState, difficulty: UnoBotDifficulty = 'normal'): UnoSoloAction | null {
  if (state.outcome != null) return null
  const rawBotIdx = state.session.turn_order.indexOf(UNO_SOLO_BOT_ID)
  if (rawBotIdx < 0) return null
  const botIdx: 0 | 1 = rawBotIdx === 1 ? 1 : 0
  if (state.session.current_turn_index !== botIdx) return null

  const hand = state.hands[botIdx]!

  // Colour choice after the bot's own wild.
  if (state.session.phase === 'choose_color') {
    return { type: 'choose_color', color: bestColorCall(hand) }
  }

  const playable = hand.filter((c) => isPlayable(state, c))
  if (playable.length === 0) return { type: 'draw' }

  if (difficulty === 'easy') {
    return { type: 'play', cardId: playable[0]!.id }
  }

  const opponentIdx: 0 | 1 = botIdx === 0 ? 1 : 0
  const opponentSize = state.hands[opponentIdx]!.length
  const pending = state.session.draw_penalty ?? 0

  const scored = playable
    .map((card) => ({
      card,
      score: pending > 0 ? penaltyPlayScore(card, pending) : normalPlayScore(card, hand, opponentSize),
    }))
    .sort((a, b) => b.score - a.score)

  return { type: 'play', cardId: scored[0]!.card.id }
}
