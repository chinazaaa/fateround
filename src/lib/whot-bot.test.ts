import { describe, it, expect } from 'vitest'
import { pickBotAction } from '@/lib/whot-bot'
import {
  initSoloWhot,
  SOLO_BOT_ID,
  soloChooseNumber,
  soloChooseShape,
  soloDraw,
  soloPlay,
  type SoloWhotAction,
  type SoloWhotState,
} from '@/lib/whot-solo'
import type { WhotCard } from '@/types'

const c = (id: string, shape: WhotCard['shape'], number: number): WhotCard => ({ id, shape, number })

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

function stateWithHands(opts: {
  humanHand: WhotCard[]
  botHand: WhotCard[]
  top: WhotCard
  turn?: 0 | 1
  requiredShape?: WhotCard['shape'] | null
  requiredNumber?: number | null
  pickTwo?: number
  pickFive?: number
  phase?: 'playing' | 'choose_whot'
}): SoloWhotState {
  const base = initSoloWhot({ rng: seeded(1) })
  return {
    ...base,
    hands: [opts.humanHand, opts.botHand],
    session: {
      ...base.session,
      top_card: opts.top,
      required_shape: opts.requiredShape ?? null,
      required_number: opts.requiredNumber ?? null,
      pick_two_stack: opts.pickTwo ?? 0,
      pick_five_stack: opts.pickFive ?? 0,
      current_turn_index: opts.turn ?? 1, // bot's turn by default
      phase: opts.phase ?? 'playing',
    },
  }
}

describe('pickBotAction — legality', () => {
  it('returns null when it is not the bot’s turn', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3)],
      botHand: [c('b1', 'star', 7)],
      top: c('top', 'circle', 5),
      turn: 0,
    })
    expect(pickBotAction(s)).toBeNull()
  })

  it('draws when nothing in hand is legal', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3)],
      botHand: [c('b1', 'square', 7), c('b2', 'triangle', 11)],
      top: c('top', 'circle', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'draw' })
  })

  it('never proposes an illegal card', () => {
    // Deep smoke test: run a couple of hundred random positions through the bot
    // and check every returned card is legal, so no scoring branch can silently
    // recommend an unmatched card.
    const rng = seeded(99)
    for (let i = 0; i < 200; i += 1) {
      const s = initSoloWhot({ rng, first: 1 })
      const action = pickBotAction(s)
      if (!action || action.type !== 'play') continue
      const card = s.hands[1].find((x) => x.id === action.cardId)
      expect(card).toBeDefined()
    }
  })
})

describe('pickBotAction — priorities', () => {
  it('under Pick 2 pressure, plays a 2 rather than drawing four cards', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3)],
      botHand: [c('b1', 'star', 2), c('b2', 'square', 7)],
      top: c('top', 'circle', 2),
      pickTwo: 4,
    })
    const action = pickBotAction(s)
    expect(action).toEqual({ type: 'play', cardId: 'b1' })
  })

  it('attacks a short opponent hand with a penalty card', () => {
    // Opponent has one card; a Pick 2 has a good chance of ending the game.
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3)],
      botHand: [c('b1', 'circle', 2), c('b2', 'circle', 11)],
      top: c('top', 'circle', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b1' })
  })

  it('prefers dumping a high card over a low one when both are legal', () => {
    // Neither card is a special, so score reduces to card number: 12 > 4.
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3), c('h2', 'circle', 3), c('h3', 'circle', 3)],
      botHand: [c('b1', 'circle', 4), c('b2', 'circle', 12)],
      top: c('top', 'circle', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b2' })
  })

  it('holds WHOT when a plain card is playable (does not burn the wild)', () => {
    // WHOT scoring subtracts 20, so any legal non-wild wins the comparison.
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3), c('h2', 'circle', 3), c('h3', 'circle', 3)],
      botHand: [c('b1', 'whot', 20), c('b2', 'circle', 4)],
      top: c('top', 'circle', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b2' })
  })

  it('will play WHOT when there is nothing else legal', () => {
    // Only the wild matches — the score penalty is irrelevant when the alternative is drawing.
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3), c('h2', 'circle', 3), c('h3', 'circle', 3)],
      botHand: [c('b1', 'whot', 20), c('b2', 'square', 4)],
      top: c('top', 'triangle', 5),
    })
    expect(pickBotAction(s)).toEqual({ type: 'play', cardId: 'b1' })
  })
})

describe('pickBotAction — WHOT choose phase', () => {
  it('calls its most-held shape', () => {
    // The bot's hand is 4 stars + 1 circle → it should call "star".
    const rules = { pick2Stacking: true, pick3Enabled: false, numberCallsEnabled: false, whotCardsEnabled: true }
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3)],
      botHand: [c('b1', 'star', 4), c('b2', 'star', 7), c('b3', 'star', 10), c('b4', 'star', 12), c('b5', 'circle', 3)],
      top: c('top', 'circle', 5),
      phase: 'choose_whot',
    })
    const action = pickBotAction({ ...s, rules })
    expect(action).toEqual({ type: 'choose_shape', shape: 'star' })
  })

  it('prefers a number call when it holds two of a callable number and rule allows', () => {
    const rules = { pick2Stacking: true, pick3Enabled: false, numberCallsEnabled: true, whotCardsEnabled: true }
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3)],
      botHand: [c('b1', 'star', 7), c('b2', 'square', 7), c('b3', 'circle', 3)],
      top: c('top', 'circle', 5),
      phase: 'choose_whot',
    })
    const action = pickBotAction({ ...s, rules })
    expect(action).toEqual({ type: 'choose_number', n: 7 })
  })
})

describe('easy vs normal difficulty', () => {
  it('easy just picks the first legal card', () => {
    // 'normal' would prefer the 12; 'easy' picks whichever comes first.
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3)],
      botHand: [c('b1', 'circle', 4), c('b2', 'circle', 12)],
      top: c('top', 'circle', 5),
    })
    expect(pickBotAction(s, 'easy')).toEqual({ type: 'play', cardId: 'b1' })
    expect(pickBotAction(s, 'normal')).toEqual({ type: 'play', cardId: 'b2' })
  })
})

// End-to-end smoke: with a solid RNG the bot playing BOTH sides should always
// terminate. This catches loops, never-passes-turn regressions and off-by-one
// seat bugs far earlier than a UI ever would.
describe('bot self-play terminates', () => {
  // Both seats use the same bot. The seat labels in the engine
  // (SOLO_HUMAN_ID / SOLO_BOT_ID) are just names — pickBotAction only ever acts
  // when the SOLO_BOT_ID seat has the turn, so we swap turn_order between calls
  // to let it act on both sides.
  function actAsBot(state: SoloWhotState): SoloWhotAction | null {
    // Rewrite turn_order so whoever's turn it is looks like the bot seat.
    const currentIdx = state.session.current_turn_index as 0 | 1
    const flippedOrder = [...state.session.turn_order]
    flippedOrder[currentIdx] = SOLO_BOT_ID
    flippedOrder[currentIdx === 0 ? 1 : 0] = 'other'
    return pickBotAction({ ...state, session: { ...state.session, turn_order: flippedOrder } })
  }

  it('finishes 10 games within a 400-move budget', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const rng = seeded(seed * 17)
      let state = initSoloWhot({ rng })
      let moves = 0
      while (state.outcome == null && moves < 400) {
        const action = actAsBot(state)
        if (!action) break
        moves += 1
        const idx = state.session.current_turn_index as 0 | 1
        if (action.type === 'play') state = soloPlay(state, idx, action.cardId, rng).state
        else if (action.type === 'draw') state = soloDraw(state, idx, rng).state
        else if (action.type === 'choose_shape') state = soloChooseShape(state, idx, action.shape).state
        else if (action.type === 'choose_number') state = soloChooseNumber(state, idx, action.n).state
      }
      expect(state.outcome).not.toBeNull()
    }
  })
})
