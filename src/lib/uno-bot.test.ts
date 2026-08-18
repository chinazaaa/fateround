import { describe, it, expect } from 'vitest'
import { pickBotAction, type UnoSoloBotAction } from '@/lib/uno-bot'
import {
  UNO_SOLO_BOT_ID,
  initUnoSolo,
  isPlayable,
  unoSoloChooseColor,
  unoSoloDraw,
  unoSoloPlay,
  unoSoloPlayMulti,
  type UnoSoloState,
} from '@/lib/uno-solo'
import type { UnoCard, UnoCardColor, UnoCardKind } from '@/types'

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const c = (id: string, color: UnoCardColor, kind: UnoCardKind, value?: number): UnoCard => ({
  id,
  color,
  kind,
  ...(value != null ? { value } : {}),
})

function stateWithHands(opts: {
  humanHand: UnoCard[]
  botHand: UnoCard[]
  top: UnoCard
  turn?: 0 | 1
  requiredColor?: UnoCard['color'] | null
  drawPenalty?: number
  phase?: 'playing' | 'choose_color'
}): UnoSoloState {
  const base = initUnoSolo({ rng: seeded(1) })
  return {
    ...base,
    hands: [opts.humanHand, opts.botHand],
    session: {
      ...base.session,
      top_card: opts.top,
      required_color: (opts.requiredColor as any) ?? null,
      draw_penalty: opts.drawPenalty ?? 0,
      draw_penalty_kind: opts.drawPenalty ? 'draw2' : null,
      current_turn_index: opts.turn ?? 1, // bot's turn by default
      phase: opts.phase ?? 'playing',
    },
  }
}

function applyBotAction(state: UnoSoloState, action: UnoSoloBotAction, rng: () => number): UnoSoloState {
  const idx = state.session.current_turn_index as 0 | 1
  if (action.type === 'play') return unoSoloPlay(state, idx, action.cardId, rng).state
  if (action.type === 'play_multi') return unoSoloPlayMulti(state, idx, action.cardIds, rng).state
  if (action.type === 'draw') return unoSoloDraw(state, idx, rng).state
  return unoSoloChooseColor(state, idx, action.color).state
}

describe('pickBotAction — legality', () => {
  it('returns null when it is not the bot’s turn', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3)],
      botHand: [c('b1', 'blue', 'number', 7)],
      top: c('top', 'red', 'number', 5),
      turn: 0,
    })
    expect(pickBotAction(s)).toBeNull()
  })

  it('draws when nothing in hand is legal', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3)],
      botHand: [c('b1', 'blue', 'number', 7), c('b2', 'green', 'number', 9)],
      top: c('top', 'red', 'number', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'draw' })
  })

  it('stacks a Draw 2 back onto a pending Draw 2', () => {
    // Classic same-kind stacking is on: a bot holding a Draw 2 should defend
    // by stacking rather than eating the penalty.
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3)],
      botHand: [c('b1', 'green', 'draw2')],
      top: c('top', 'red', 'draw2'),
      drawPenalty: 2,
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b1' })
  })

  it('still draws when no legal defender exists', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3)],
      botHand: [c('b1', 'green', 'number', 7), c('b2', 'blue', 'number', 4)],
      top: c('top', 'red', 'draw2'),
      drawPenalty: 2,
    })
    expect(pickBotAction(s)).toEqual({ type: 'draw' })
  })
})

describe('pickBotAction — priorities', () => {
  it('attacks a short opponent with Draw 2', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3)],
      botHand: [c('b1', 'red', 'draw2'), c('b2', 'red', 'number', 8)],
      top: c('top', 'red', 'number', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b1' })
  })

  it('holds a Wild when a plain card is legal', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3), c('h2', 'red', 'number', 3), c('h3', 'red', 'number', 3)],
      botHand: [c('b1', 'wild', 'wild'), c('b2', 'red', 'number', 6)],
      top: c('top', 'red', 'number', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b2' })
  })

  it('plays a Wild when nothing else is legal', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3), c('h2', 'red', 'number', 3), c('h3', 'red', 'number', 3)],
      botHand: [c('b1', 'wild', 'wild'), c('b2', 'green', 'number', 6)],
      top: c('top', 'blue', 'number', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b1' })
  })

  it('uses Wild Draw 4 as a closing strike when opponent is short', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3)],
      botHand: [c('b1', 'wild', 'wild_draw4'), c('b2', 'red', 'number', 7)],
      top: c('top', 'red', 'number', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b1' })
  })
})

describe('pickBotAction — colour call', () => {
  it('calls the colour the bot holds most of', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3)],
      botHand: [
        c('b1', 'green', 'number', 3),
        c('b2', 'green', 'number', 5),
        c('b3', 'green', 'number', 7),
        c('b4', 'red', 'number', 9),
      ],
      top: c('top', 'red', 'number', 5),
      phase: 'choose_color',
    })
    expect(pickBotAction(s)).toEqual({ type: 'choose_color', color: 'green' })
  })
})

describe('easy vs normal', () => {
  it('easy picks the first legal card', () => {
    // Two playable single cards, neither pair is a valid Multi-Play group
    // (b1 is red 4, b2 is green 5 — different colour and different number).
    const s = stateWithHands({
      humanHand: [c('h1', 'blue', 'number', 3)],
      botHand: [c('b1', 'red', 'number', 4), c('b2', 'green', 'number', 5)],
      top: c('top', 'red', 'number', 5),
    })
    expect(pickBotAction(s, 'easy')).toEqual({ type: 'play', cardId: 'b1' })
    // Normal prefers the higher-point card (shed high points first).
    expect(pickBotAction(s, 'normal')).toEqual({ type: 'play', cardId: 'b2' })
    // Hard also prefers the higher shed.
    expect(pickBotAction(s, 'hard')).toEqual({ type: 'play', cardId: 'b2' })
  })
})

describe('hard difficulty', () => {
  it('under a 2-card opponent, prefers Draw 2 over a large plain shed', () => {
    // Human at 2 cards: hard's very-close bonus keeps Draw 2 decisively above
    // the raw shed-value competition.
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3), c('h2', 'red', 'number', 4)],
      botHand: [c('b1', 'red', 'draw2'), c('b2', 'red', 'number', 9)],
      top: c('top', 'red', 'number', 5),
    })
    expect(pickBotAction(s, 'hard')).toEqual({ type: 'play', cardId: 'b1' })
  })

  it('hoards a plain wild when a real card is legal', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 3)],
      botHand: [c('b1', 'wild', 'wild'), c('b2', 'red', 'number', 4)],
      top: c('top', 'red', 'number', 5),
    })
    expect(pickBotAction(s, 'hard')).toEqual({ type: 'play', cardId: 'b2' })
  })
})

describe('bot self-play terminates', () => {
  it('finishes 5 games within a move budget', () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const rng = seeded(seed * 17)
      let state = initUnoSolo({ rng })
      let moves = 0
      while (state.outcome == null && moves < 400) {
        // Flip turn_order so pickBotAction targets whichever seat has the turn.
        const currentIdx = state.session.current_turn_index as 0 | 1
        const flippedOrder = [...state.session.turn_order]
        flippedOrder[currentIdx] = UNO_SOLO_BOT_ID
        flippedOrder[currentIdx === 0 ? 1 : 0] = 'other'
        const action = pickBotAction({ ...state, session: { ...state.session, turn_order: flippedOrder } })
        if (!action) break
        moves += 1
        state = applyBotAction(state, action, rng)
      }
      expect(state.outcome).not.toBeNull()
    }
  })

  it('lays a Multi-Play set when it has two plain cards that group legally', () => {
    // Opponent not closing (4 cards) so Draw 2 hoarding isn't an issue; bot has
    // two red numbers → the multi shed beats either single card.
    const s = stateWithHands({
      humanHand: [
        c('h1', 'blue', 'number', 3),
        c('h2', 'blue', 'number', 4),
        c('h3', 'blue', 'number', 5),
        c('h4', 'blue', 'number', 6),
      ],
      botHand: [c('b1', 'red', 'number', 7), c('b2', 'red', 'number', 9)],
      top: c('top', 'red', 'number', 5),
    })
    const action = pickBotAction(s, 'normal')
    expect(action?.type).toBe('play_multi')
    if (action?.type === 'play_multi') {
      expect(action.cardIds).toHaveLength(2)
      expect(new Set(action.cardIds)).toEqual(new Set(['b1', 'b2']))
    }
  })

  it('never proposes an illegal card during a live game vs a random human', () => {
    const rand = seeded(101)
    let state = initUnoSolo({ rng: rand, first: 0 })
    for (let ply = 0; ply < 300 && state.outcome == null; ply += 1) {
      if (state.session.current_turn_index === 0) {
        if (state.session.phase === 'choose_color') {
          state = unoSoloChooseColor(state, 0, 'red').state
          continue
        }
        const legal = state.hands[0].find((card) => isPlayable(state, card))
        if (legal) state = unoSoloPlay(state, 0, legal.id, rand).state
        else state = unoSoloDraw(state, 0, rand).state
      } else {
        const action = pickBotAction(state, 'normal')
        if (!action) break
        if (action.type === 'play') {
          const card = state.hands[1].find((x) => x.id === action.cardId)
          expect(card).toBeDefined()
          expect(isPlayable(state, card!)).toBe(true)
        } else if (action.type === 'play_multi') {
          // The first card must be legal on top; the rest must belong to the hand.
          const first = state.hands[1].find((x) => x.id === action.cardIds[0])
          expect(first).toBeDefined()
          expect(isPlayable(state, first!)).toBe(true)
          for (const id of action.cardIds) {
            expect(state.hands[1].some((x) => x.id === id)).toBe(true)
          }
        }
        state = applyBotAction(state, action, rand)
      }
    }
  })
})
