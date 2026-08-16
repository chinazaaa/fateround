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
 * scoring below with baseline weights; `hard` runs the same scoring shape
 * with sharper weights (hoards wilds harder, hits short hands harder with
 * Draw 2 / Skip / WD4, weighs cluster chains more) and — after playing a
 * wild — prefers the colour the opponent is least likely to hold, inferred
 * from cards seen so far (own hand + discard pile).
 */

import type { UnoCard, UnoColor } from '@/types'
import { cardPoints, isWildCard } from '@/lib/uno'
import { UNO_SOLO_BOT_ID, isPlayable, type UnoSoloAction, type UnoSoloState } from '@/lib/uno-solo'

export type UnoBotDifficulty = 'easy' | 'normal' | 'hard'

const COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue']

// ── Card scoring ─────────────────────────────────────────────────────────────

/**
 * Score a legal candidate. Wilds are ASSIGNED (not adjusted) because
 * cardPoints puts them at 50, and any "-30" adjustment would leave them more
 * attractive than any number card the bot could play instead.
 */
function normalPlayScore(card: UnoCard, botHand: UnoCard[], opponentHandSize: number, hard: boolean = false): number {
  const closing = opponentHandSize <= 3
  const veryClose = opponentHandSize <= 2
  let score: number
  if (card.kind === 'wild_draw4') {
    // Strong: opponent draws 4 + we pick the colour. Worth using when we
    // want to close a game; otherwise still valuable but not as much.
    score = hard ? (veryClose ? 85 : closing ? 70 : 15) : closing ? 65 : 20
  } else if (card.kind === 'wild') {
    score = hard ? -35 : -20 // hoard plain wilds harder on hard
  } else {
    score = cardPoints(card) // shed high-value cards first

    if (card.kind === 'draw2') score += hard ? (veryClose ? 55 : closing ? 42 : 24) : closing ? 40 : 22
    else if (card.kind === 'skip' || card.kind === 'reverse')
      score += hard ? (veryClose ? 35 : closing ? 27 : 14) : closing ? 25 : 12
  }

  // Cluster bonus — cards sharing a colour with the rest of the hand set up
  // chains. Hard weights chains more (cap +5) since they matter more once
  // it starts hoarding wilds and specials.
  const siblings = botHand.filter((c) => c.id !== card.id && c.color === card.color && c.color !== 'wild').length
  score += Math.min(hard ? 5 : 3, siblings)

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
function bestColorCall(hand: UnoCard[], hard: boolean = false, discard: readonly UnoCard[] = []): UnoColor {
  const counts: Record<UnoColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 }
  for (const c of hand) {
    if (c.color === 'wild') continue
    counts[c.color as UnoColor] += 1
  }
  // Seen counts (own hand + discard) — a higher seen means fewer copies of
  // that colour are unaccounted for, so opponent less likely to hold it.
  const seen: Record<UnoColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 }
  if (hard) {
    for (const c of hand) if (c.color !== 'wild') seen[c.color as UnoColor] += 1
    for (const c of discard) if (c.color !== 'wild') seen[c.color as UnoColor] += 1
  }
  let best: UnoColor = 'red'
  let bestN = -1
  let bestSeen = -1
  for (const col of COLORS) {
    const n = counts[col]
    const s = seen[col]
    const takes = n > bestN || (hard && n === bestN && s > bestSeen)
    if (takes) {
      bestN = n
      best = col
      bestSeen = s
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
  const hard = difficulty === 'hard'
  const discard = (state.session.discard_pile ?? []) as UnoCard[]

  // Colour choice after the bot's own wild.
  if (state.session.phase === 'choose_color') {
    return { type: 'choose_color', color: bestColorCall(hand, hard, discard) }
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
      score: pending > 0 ? penaltyPlayScore(card, pending) : normalPlayScore(card, hand, opponentSize, hard),
    }))
    .sort((a, b) => b.score - a.score)

  return { type: 'play', cardId: scored[0]!.card.id }
}
