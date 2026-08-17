/**
 * Whot vs-bot heuristic — pure engine, moved into the shared package so web and
 * mobile can share it. See ../../../src/lib/whot-bot.ts for the design notes.
 */

import type { WhotCard, WhotShape } from './types'
import { canPlayCard, WHOT_SHAPES, type WhotRules } from './whot'
import { SOLO_BOT_ID, SOLO_HUMAN_ID, type SoloWhotState, type SoloWhotAction } from './whot-solo'

export type WhotBotDifficulty = 'easy' | 'normal' | 'hard'

const CALLABLE_NUMBERS = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14] as const

function normalPlayScore(card: WhotCard, botHand: WhotCard[], opponentHandSize: number, hard: boolean = false): number {
  const n = card.number
  let score = n
  const closing = opponentHandSize <= 3
  const veryClose = opponentHandSize <= 2

  if (n === 20) score -= hard ? 35 : 20

  if (n === 2) {
    score += hard ? (veryClose ? 60 : closing ? 45 : 28) : closing ? 40 : 25
  } else if (n === 5) {
    score += hard ? (veryClose ? 65 : closing ? 50 : 28) : closing ? 45 : 25
  } else if (n === 8) {
    score += hard ? (veryClose ? 45 : closing ? 35 : 18) : closing ? 30 : 15
  } else if (n === 1) {
    score += hard ? 20 : 15
  } else if (n === 14) {
    score += hard ? 18 : 12
  }

  const siblings = botHand.filter((c) => c.id !== card.id && c.shape === card.shape).length
  score += Math.min(hard ? 5 : 3, siblings)

  return score
}

function penaltyPlayScore(card: WhotCard): number {
  return card.number
}

function bestShapeCall(hand: WhotCard[], hard: boolean = false, discard: readonly WhotCard[] = []): WhotShape {
  const counts = new Map<WhotShape, number>()
  for (const c of hand) {
    if (c.shape === 'whot') continue
    counts.set(c.shape, (counts.get(c.shape) ?? 0) + 1)
  }
  const seen = new Map<WhotShape, number>()
  if (hard) {
    for (const c of hand) if (c.shape !== 'whot') seen.set(c.shape, (seen.get(c.shape) ?? 0) + 1)
    for (const c of discard) if (c.shape !== 'whot') seen.set(c.shape, (seen.get(c.shape) ?? 0) + 1)
  }
  let best: WhotShape = 'circle'
  let bestN = -1
  let bestSeen = -1
  for (const shape of WHOT_SHAPES) {
    if (shape === 'whot') continue
    const n = counts.get(shape) ?? 0
    const s = seen.get(shape) ?? 0
    const takes = n > bestN || (hard && n === bestN && s > bestSeen)
    if (takes) {
      bestN = n
      best = shape
      bestSeen = s
    }
  }
  return best
}

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

export function pickBotAction(state: SoloWhotState, difficulty: WhotBotDifficulty = 'normal'): SoloWhotAction | null {
  if (state.outcome != null) return null
  const rawBotIdx = state.session.turn_order.indexOf(SOLO_BOT_ID)
  if (rawBotIdx < 0) return null
  const botIdx: 0 | 1 = rawBotIdx === 1 ? 1 : 0
  if (state.session.current_turn_index !== botIdx) return null

  const hand = state.hands[botIdx]!

  const hard = difficulty === 'hard'
  const discard = (state.session.discard_pile ?? []) as WhotCard[]

  if (state.session.phase === 'choose_whot') {
    if (state.rules.numberCallsEnabled) {
      const numberCall = bestNumberCall(hand)
      if (numberCall != null) return { type: 'choose_number', n: numberCall }
    }
    return { type: 'choose_shape', shape: bestShapeCall(hand, hard, discard) }
  }
  const playable = hand.filter((c) => canPlayCard(c, state.session, state.rules))
  if (playable.length === 0) return { type: 'draw' }

  if (difficulty === 'easy') {
    return { type: 'play', cardId: playable[0]!.id }
  }

  const opponentIdx: 0 | 1 = botIdx === 0 ? 1 : 0
  const opponentSize = state.hands[opponentIdx]!.length
  const inPenalty = (state.session.pick_two_stack ?? 0) > 0 || (state.session.pick_five_stack ?? 0) > 0

  const scored = playable
    .map((card) => ({
      card,
      score: inPenalty ? penaltyPlayScore(card) : normalPlayScore(card, hand, opponentSize, hard),
    }))
    .sort((a, b) => b.score - a.score)

  return { type: 'play', cardId: scored[0]!.card.id }
}

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

export const BOT_SEAT_ID = SOLO_BOT_ID
export const HUMAN_SEAT_ID = SOLO_HUMAN_ID

export type { WhotRules }
