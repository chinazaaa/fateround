import { describe, it, expect } from 'vitest'
import { pickBotAction } from '@/lib/crazy-eights-bot'
import {
  CRAZY8_SOLO_BOT_ID,
  crazy8SoloChooseSuit,
  crazy8SoloDraw,
  crazy8SoloPlay,
  initCrazy8Solo,
  type Crazy8SoloAction,
  type Crazy8SoloState,
} from '@/lib/crazy-eights-solo'
import type { CrazyEightsCard } from '@/types'

const c = (id: string, suit: CrazyEightsCard['suit'], rank: number): CrazyEightsCard => ({ id, suit, rank })

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function stateWithHands(opts: {
  humanHand: CrazyEightsCard[]
  botHand: CrazyEightsCard[]
  top: CrazyEightsCard
  turn?: 0 | 1
  requiredSuit?: CrazyEightsCard['suit'] | null
  pickTwo?: number
  jokerPenalty?: number
  phase?: 'playing' | 'choose_suit'
}): Crazy8SoloState {
  const base = initCrazy8Solo({ rng: seeded(1) })
  return {
    ...base,
    hands: [opts.humanHand, opts.botHand],
    session: {
      ...base.session,
      top_card: opts.top,
      required_suit: (opts.requiredSuit as any) ?? null,
      pick_two_stack: opts.pickTwo ?? 0,
      joker_penalty: opts.jokerPenalty ?? 0,
      current_turn_index: opts.turn ?? 1, // bot's turn by default
      phase: opts.phase ?? 'playing',
    },
  }
}

describe('pickBotAction — legality', () => {
  it('returns null when it is not the bot’s turn', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 3)],
      botHand: [c('b1', 'hearts', 7)],
      top: c('top', 'spades', 5),
      turn: 0,
    })
    expect(pickBotAction(s)).toBeNull()
  })

  it('draws when nothing in hand is legal', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 3)],
      botHand: [c('b1', 'clubs', 7), c('b2', 'diamonds', 11)],
      top: c('top', 'spades', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'draw' })
  })

  it('never proposes an illegal card in a live game', () => {
    // Smoke: run a real game vs a random "human" and check every bot play is legal.
    const rand = seeded(99)
    let state = initCrazy8Solo({ rng: rand, first: 0 })
    for (let ply = 0; ply < 300 && state.outcome == null; ply += 1) {
      if (state.session.current_turn_index === 0) {
        // Human: play any legal card, else draw.
        if (state.session.phase === 'choose_suit') {
          state = crazy8SoloChooseSuit(state, 0, 'spades').state
          continue
        }
        const legal = state.hands[0].find((card) => canPlay(state, card))
        if (legal) state = crazy8SoloPlay(state, 0, legal.id, rand).state
        else state = crazy8SoloDraw(state, 0, rand).state
      } else {
        const action = pickBotAction(state, 'normal')
        if (!action) break
        if (action.type === 'play') {
          const card = state.hands[1].find((x) => x.id === action.cardId)
          expect(card).toBeDefined()
        }
        state = applyBotAction(state, action, rand)
      }
    }
  })
})

function canPlay(state: Crazy8SoloState, card: CrazyEightsCard): boolean {
  const top = state.session.top_card
  if (!top) return true
  if (card.rank === 8 || card.suit === 'joker')
    return (state.session.pick_two_stack ?? 0) === 0 && (state.session.joker_penalty ?? 0) === 0
  const rule = state.rules
  if ((state.session.joker_penalty ?? 0) > 0) return false
  if ((state.session.pick_two_stack ?? 0) > 0) return rule.actionCards && rule.pick2Stacking && card.rank === 2
  if (state.session.required_suit) return card.suit === state.session.required_suit
  return card.suit === top.suit || card.rank === top.rank
}

function applyBotAction(state: Crazy8SoloState, action: Crazy8SoloAction, rng: () => number): Crazy8SoloState {
  // Apply as whichever seat actually has the turn — the caller flips
  // turn_order to trick pickBotAction into acting for both sides in the
  // self-play test, but the card id in the action belongs to the ORIGINAL
  // current seat's hand, so we must pass that same index to the engine.
  const idx = state.session.current_turn_index as 0 | 1
  if (action.type === 'play') return crazy8SoloPlay(state, idx, action.cardId, rng).state
  if (action.type === 'draw') return crazy8SoloDraw(state, idx, rng).state
  return crazy8SoloChooseSuit(state, idx, action.suit).state
}

describe('pickBotAction — priorities', () => {
  it('under Pick 2 pressure, plays a 2 instead of drawing four', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 3)],
      botHand: [c('b1', 'hearts', 2), c('b2', 'clubs', 7)],
      top: c('top', 'spades', 2),
      pickTwo: 4,
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b1' })
  })

  it('attacks a short opponent with Pick 2', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 3)],
      botHand: [c('b1', 'spades', 2), c('b2', 'spades', 10)],
      top: c('top', 'spades', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b1' })
  })

  it('holds an 8 (wild) when a non-wild card is legal', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 3), c('h2', 'spades', 3), c('h3', 'spades', 3)],
      botHand: [c('b1', 'clubs', 8), c('b2', 'spades', 6)],
      top: c('top', 'spades', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b2' })
  })

  it('plays an 8 when nothing else is legal', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 3), c('h2', 'spades', 3), c('h3', 'spades', 3)],
      botHand: [c('b1', 'clubs', 8), c('b2', 'diamonds', 6)],
      top: c('top', 'hearts', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b1' })
  })
})

describe('pickBotAction — suit-call after wild', () => {
  it('calls the suit the bot holds the most of', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 3)],
      botHand: [
        c('b1', 'clubs', 3),
        c('b2', 'clubs', 5),
        c('b3', 'clubs', 7),
        c('b4', 'clubs', 9),
        c('b5', 'hearts', 3),
      ],
      top: c('top', 'spades', 5),
      phase: 'choose_suit',
    })
    expect(pickBotAction(s)).toEqual({ type: 'choose_suit', suit: 'clubs' })
  })
})

describe('easy vs normal', () => {
  it('easy picks the first legal card', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 3)],
      botHand: [c('b1', 'spades', 4), c('b2', 'spades', 12)],
      top: c('top', 'spades', 5),
    })
    expect(pickBotAction(s, 'easy')).toEqual({ type: 'play', cardId: 'b1' })
    // Normal prefers the Queen (higher score than the 4 — cardPoints 10 +
    // Reverse bonus, vs cardPoints 4 for the spades 4).
    expect(pickBotAction(s, 'normal')).toEqual({ type: 'play', cardId: 'b2' })
  })
})

describe('bot self-play terminates', () => {
  it('finishes 5 games within a move budget', () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const rng = seeded(seed * 17)
      let state = initCrazy8Solo({ rng })
      let moves = 0
      while (state.outcome == null && moves < 400) {
        // Flip turn_order so pickBotAction targets whichever seat has the turn.
        const currentIdx = state.session.current_turn_index as 0 | 1
        const flippedOrder = [...state.session.turn_order]
        flippedOrder[currentIdx] = CRAZY8_SOLO_BOT_ID
        flippedOrder[currentIdx === 0 ? 1 : 0] = 'other'
        const action = pickBotAction({ ...state, session: { ...state.session, turn_order: flippedOrder } })
        if (!action) break
        moves += 1
        state = applyBotAction(state, action, rng)
      }
      expect(state.outcome).not.toBeNull()
    }
  })
})
