/**
 * Crazy Eights vs-bot heuristic — no search, no LLM.
 *
 * Same family as Whot: hidden hands, so search buys almost nothing (any depth
 * past 1 has to assume or sample the opponent's holding). A small set of
 * hand-tuned heuristics plays credibly and is a hundred times faster than any
 * LLM call would be.
 *
 * The bot exposes ONE function, `pickBotAction(state)`, that returns the next
 * move for whichever seat has the turn. It never mutates state. The caller
 * applies the action via crazy8SoloPlay / crazy8SoloDraw / crazy8SoloChooseSuit.
 *
 * ── Card set ─────────────────────────────────────────────────────────────
 *   Standard 52-card deck + 2 optional Jokers, 4 suits (spades/clubs/hearts/
 *   diamonds), ranks 1 (Ace) - 13 (King). 8 is the wild; Joker is even more
 *   powerful (draw 5 + wild). Under the default action rules: 2 = Pick 2,
 *   Ace/Jack = Skip, Queen = Reverse (= Skip in a 2-player game).
 *
 * ── Difficulty ───────────────────────────────────────────────────────────
 *   easy    plays the FIRST legal card, always calls a spade
 *   normal  runs the full heuristic below with baseline weights
 *   hard    same heuristic shape, sharper weights (hoards 8s harder, hits
 *           short hands harder with Pick 2 / Skip / Reverse, weighs cluster
 *           chains more) and — after playing a wild — prefers the suit the
 *           opponent is least likely to hold, inferred from cards seen so
 *           far (own hand + discard pile).
 *
 * ── Priorities (higher = better) ─────────────────────────────────────────
 *   +50  Joker           — usually a game-ending strike
 *   +45  Pick 2 when opponent has ≤ 3 cards
 *   +30  Skip/Reverse when opponent has ≤ 3 cards
 *   +25  Pick 2 general
 *   +15  Skip/Reverse general — free extra turn in 2p
 *   +N   cardPoints as the tie-breaker: dump high points first (matches
 *        lowest-hand end-by-lowest-sum rule)
 *   -30  8 (wild) — precious; hold for jams
 *   Cluster bonus: +1 per same-suit sibling in hand (up to +3)
 */

import type { CrazyEightsCalledSuit, CrazyEightsCard } from '@/types'
import { canPlayCard, cardPoints, isJoker, isWildCard, type CrazyEightsRules } from '@/lib/crazy-eights'
import { CRAZY8_SOLO_BOT_ID, type Crazy8SoloAction, type Crazy8SoloState } from '@/lib/crazy-eights-solo'

export type Crazy8BotDifficulty = 'easy' | 'normal' | 'hard'

const REAL_SUITS: CrazyEightsCalledSuit[] = ['spades', 'clubs', 'hearts', 'diamonds']

// ── Card scoring ─────────────────────────────────────────────────────────────

function normalPlayScore(
  card: CrazyEightsCard,
  botHand: CrazyEightsCard[],
  opponentHandSize: number,
  rules: CrazyEightsRules,
  hard: boolean = false
): number {
  const rank = card.rank
  const closing = opponentHandSize <= 3
  const veryClose = opponentHandSize <= 2

  // Wilds are scored on a separate scale from real cards, not added to
  // cardPoints — because cardPoints(8) is 50 in the shipping engine, an
  // "adjustment" of -30 would still leave the 8 more attractive than any
  // real card. Assign the score outright so a non-wild always wins.
  let score: number
  if (isJoker(card)) {
    score = hard ? (veryClose ? 90 : closing ? 75 : 55) : 60 // dominant strike — opp draws 5, we pick suit
  } else if (rank === 8) {
    score = hard ? -35 : -20 // hoard 8s harder on hard
  } else {
    score = cardPoints(card) // shed high points first as the baseline
  }

  if (rules.actionCards && !isWildCard(card)) {
    if (rank === 2) score += hard ? (veryClose ? 65 : closing ? 50 : 28) : closing ? 45 : 25
    else if (rank === 1 || rank === 11) score += hard ? (veryClose ? 45 : closing ? 33 : 17) : closing ? 30 : 15
    else if (rank === 12) score += hard ? (veryClose ? 45 : closing ? 33 : 17) : closing ? 30 : 15
  }

  // Cluster bonus — cards sharing a suit with the rest of the hand set up
  // chains. Hard weighs them more heavily since chained-shed matters more
  // once wilds are being hoarded.
  const siblings = botHand.filter((c) => c.id !== card.id && c.suit === card.suit).length
  score += Math.min(hard ? 5 : 3, siblings)

  return score
}

function penaltyPlayScore(card: CrazyEightsCard): number {
  return card.rank // 2 vs Pick 2 — the higher rank shed first if multiple defenders exist
}

// ── Suit call after playing a wild ──────────────────────────────────────────

/** Call the suit the bot holds the most of. Broad-match strategy: keeps our
 * own next card most likely to remain legal. */
function bestSuitCall(
  hand: CrazyEightsCard[],
  hard: boolean = false,
  discard: readonly CrazyEightsCard[] = []
): CrazyEightsCalledSuit {
  const counts: Record<CrazyEightsCalledSuit, number> = { spades: 0, clubs: 0, hearts: 0, diamonds: 0 }
  for (const c of hand) {
    if (c.suit !== 'joker') counts[c.suit] += 1
  }
  // Seen counts (own hand + discard) — a higher seen means fewer copies of
  // that suit are unaccounted for, so opponent less likely to hold it.
  const seen: Record<CrazyEightsCalledSuit, number> = { spades: 0, clubs: 0, hearts: 0, diamonds: 0 }
  if (hard) {
    for (const c of hand) if (c.suit !== 'joker') seen[c.suit] += 1
    for (const c of discard) if (c.suit !== 'joker') seen[c.suit] += 1
  }
  let best: CrazyEightsCalledSuit = 'spades'
  let bestN = -1
  let bestSeen = -1
  for (const s of REAL_SUITS) {
    const n = counts[s]
    const sv = seen[s]
    const takes = n > bestN || (hard && n === bestN && sv > bestSeen)
    if (takes) {
      bestN = n
      best = s
      bestSeen = sv
    }
  }
  return best
}

// ── Main decision ───────────────────────────────────────────────────────────

/**
 * Choose the bot's next action. Returns null when the engine isn't waiting on
 * the bot — treat as a no-op.
 */
export function pickBotAction(
  state: Crazy8SoloState,
  difficulty: Crazy8BotDifficulty = 'normal'
): Crazy8SoloAction | null {
  if (state.outcome != null) return null
  const rawBotIdx = state.session.turn_order.indexOf(CRAZY8_SOLO_BOT_ID)
  if (rawBotIdx < 0) return null
  const botIdx: 0 | 1 = rawBotIdx === 1 ? 1 : 0
  if (state.session.current_turn_index !== botIdx) return null

  const hand = state.hands[botIdx]!
  const hard = difficulty === 'hard'
  const discard = (state.session.discard_pile ?? []) as CrazyEightsCard[]

  // Suit choice after the bot's own wild.
  if (state.session.phase === 'choose_suit') {
    return { type: 'choose_suit', suit: bestSuitCall(hand, hard, discard) }
  }

  const playable = hand.filter((c) => canPlayCard(c, state.session, state.rules))
  if (playable.length === 0) return { type: 'draw' }

  if (difficulty === 'easy') {
    return { type: 'play', cardId: playable[0]!.id }
  }

  const opponentIdx: 0 | 1 = botIdx === 0 ? 1 : 0
  const opponentSize = state.hands[opponentIdx]!.length
  const inPenalty = (state.session.pick_two_stack ?? 0) > 0 || (state.session.joker_penalty ?? 0) > 0

  const scored = playable
    .map((card) => ({
      card,
      score: inPenalty ? penaltyPlayScore(card) : normalPlayScore(card, hand, opponentSize, state.rules, hard),
    }))
    .sort((a, b) => b.score - a.score)

  return { type: 'play', cardId: scored[0]!.card.id }
}
