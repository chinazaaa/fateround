import { describe, it, expect } from 'vitest'
import {
  initSoloWhot,
  soloPlay,
  soloDraw,
  soloChooseShape,
  soloChooseNumber,
  SOLO_BOT_ID,
  SOLO_HUMAN_ID,
  type SoloWhotState,
} from '@/lib/whot-solo'
import { parseWhotRules } from '@/lib/whot'
import type { WhotCard } from '@/types'

// Deterministic RNG so shuffles never change the assertions when this file is re-run.
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

// Hand-crafted state helpers: the initial deal is randomised, so most tests
// build a specific position rather than shuffle and hope.
function stateWithHands(opts: {
  humanHand: WhotCard[]
  botHand: WhotCard[]
  top: WhotCard
  turn?: 0 | 1
  requiredShape?: WhotCard['shape'] | null
  requiredNumber?: number | null
  pickTwo?: number
  pickFive?: number
  drawPile?: WhotCard[]
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
      current_turn_index: opts.turn ?? 0,
      draw_pile: opts.drawPile ?? base.session.draw_pile,
      phase: 'playing',
    },
  }
}

const c = (id: string, shape: WhotCard['shape'], number: number): WhotCard => ({ id, shape, number })

describe('initSoloWhot', () => {
  it('deals six cards to each seat and produces a playable top card', () => {
    const s = initSoloWhot({ rng: seeded(42) })
    expect(s.hands[0]).toHaveLength(6)
    expect(s.hands[1]).toHaveLength(6)
    // dealCount(2) === 6 (see whot.ts). 6 + 6 dealt + 1 top = 13 gone from a 54-card deck.
    expect(s.session.top_card).not.toBeNull()
    expect(s.session.top_card!.number).not.toBe(20) // starter never a special
    expect([1, 2, 5, 8, 14]).not.toContain(s.session.top_card!.number)
    expect(s.session.phase).toBe('playing')
    expect(s.outcome).toBeNull()
  })

  it('honours the first-player option', () => {
    expect(initSoloWhot({ rng: seeded(1), first: 1 }).session.current_turn_index).toBe(1)
  })

  it('serialises + rehydrates without behaviour drift', () => {
    // The whole point of a pure state machine is that a JSON round-trip is
    // indistinguishable from the live value — that's what makes sessionStorage safe.
    const s = initSoloWhot({ rng: seeded(7) })
    const rehydrated: SoloWhotState = JSON.parse(JSON.stringify(s))
    expect(rehydrated.hands).toEqual(s.hands)
    expect(rehydrated.session.top_card).toEqual(s.session.top_card)
  })
})

describe('soloPlay — legality', () => {
  it('rejects a card that neither shape nor number matches', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'square', 7)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
    })
    const r = soloPlay(s, 0, 'h1', seeded(1))
    expect(r.error).toBe('Cannot play that card')
    expect(r.state.hands[0]).toHaveLength(1) // hand untouched
  })

  it('accepts a shape match', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 7)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
    })
    const r = soloPlay(s, 0, 'h1', seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.hands[0]).toHaveLength(0)
    // Playing the last card ends the game with that seat as the winner.
    expect(r.state.outcome).toBe(0)
  })

  it('rejects out-of-turn moves', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 7)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
      turn: 1,
    })
    expect(soloPlay(s, 0, 'h1', seeded(1)).error).toBe('Not your turn')
  })
})

describe('soloPlay — special cards', () => {
  it('Hold (1) leaves the turn with the same seat', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 1), c('h2', 'square', 4)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
    })
    const r = soloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.current_turn_index).toBe(0)
    expect(r.state.session.top_card!.id).toBe('h1')
  })

  it('Skip (8) sends the turn back to the same seat in a 2-player game', () => {
    // In a duel, skipping the "next" player skips the opponent — which lands
    // back on us. Verifies the seat-index math, not just the rule name.
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 8), c('h2', 'square', 4)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
    })
    const r = soloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.current_turn_index).toBe(0)
  })

  it('Pick 2 stacks a penalty on the opponent', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 2), c('h2', 'square', 4)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
    })
    const r = soloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.pick_two_stack).toBe(2)
    expect(r.state.session.current_turn_index).toBe(1)
  })

  it('General Market (14) makes the opponent draw and keeps the turn', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 14), c('h2', 'square', 4)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
      drawPile: [c('d1', 'star', 10)],
    })
    const r = soloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.hands[1]).toHaveLength(2) // bot drew 1
    expect(r.state.session.current_turn_index).toBe(0) // hold-on
  })

  it('WHOT (20) with cards left pauses for choose_whot', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'whot', 20), c('h2', 'square', 4)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
    })
    const r = soloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.phase).toBe('choose_whot')
    expect(r.state.session.current_turn_index).toBe(0) // still ours until we choose
  })

  it('WHOT as the last card ends the game immediately (no choose)', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'whot', 20)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
    })
    const r = soloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.outcome).toBe(0)
    expect(r.state.session.phase).toBe('finished')
  })
})

describe('soloPlay — pick stack defence', () => {
  it('under Pick 2, only another 2 is legal', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 3), c('h2', 'star', 2)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 2),
      pickTwo: 2,
    })
    expect(soloPlay(s, 0, 'h1', seeded(1)).error).toMatch(/Pick 2/i)
    const r = soloPlay(s, 0, 'h2', seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.session.pick_two_stack).toBe(4) // stacked
  })
})

describe('soloDraw', () => {
  it('draws one card and passes the turn', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'square', 7)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
      drawPile: [c('d1', 'triangle', 9)],
    })
    const r = soloDraw(s, 0, seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.hands[0]).toHaveLength(2)
    expect(r.state.session.current_turn_index).toBe(1)
  })

  it('draws the full penalty under Pick 2 and clears the stack', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'square', 7)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 2),
      pickTwo: 4,
      drawPile: [c('d1', 'star', 9), c('d2', 'star', 10), c('d3', 'star', 11), c('d4', 'star', 12)],
    })
    const r = soloDraw(s, 0, seeded(1))
    expect(r.state.hands[0]).toHaveLength(5)
    expect(r.state.session.pick_two_stack).toBe(0)
  })

  it('empty piles + no legal move → ends by lowest hand', () => {
    // Whichever seat has the lower point total wins. Human: 3, Bot: 7 → human wins.
    const s = stateWithHands({
      humanHand: [c('h1', 'square', 3)],
      botHand: [c('b1', 'circle', 7)],
      top: c('top', 'triangle', 5),
      drawPile: [],
    })
    const r = soloDraw(s, 0, seeded(1))
    expect(r.state.outcome).toBe(0)
    expect(r.state.session.phase).toBe('finished')
  })
})

describe('choose_whot', () => {
  it('naming a shape passes the turn and sets required_shape', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'whot', 20), c('h2', 'square', 4)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
    })
    const afterWhot = soloPlay(s, 0, 'h1', seeded(1)).state
    const r = soloChooseShape(afterWhot, 0, 'star')
    expect(r.state.session.required_shape).toBe('star')
    expect(r.state.session.current_turn_index).toBe(1)
    expect(r.state.session.phase).toBe('playing')
  })

  it('cannot choose a number when number calls are disabled', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'whot', 20), c('h2', 'square', 4)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
    })
    const afterWhot = soloPlay(s, 0, 'h1', seeded(1)).state
    // Default rules have numberCallsEnabled = false in parseWhotRules(null)? Check
    // by trying — either way the behaviour must be consistent with the rules value.
    const disabled = { ...afterWhot, rules: parseWhotRules({ whot_number_calls_enabled: false }) }
    expect(soloChooseNumber(disabled, 0, 7).error).toBe('Number calls are disabled')
  })
})

describe('game end wiring', () => {
  it('sets outcome, finish_order and winner_player_id together', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'circle', 7)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
    })
    const r = soloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.outcome).toBe(0)
    expect(r.state.session.winner_player_id).toBe(SOLO_HUMAN_ID)
    expect(r.state.session.finish_order).toEqual([SOLO_HUMAN_ID])
  })

  it('bot going out sets bot as winner', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'square', 4)],
      botHand: [c('b1', 'circle', 3)],
      top: c('top', 'circle', 5),
      turn: 1,
    })
    const r = soloPlay(s, 1, 'b1', seeded(1))
    expect(r.state.outcome).toBe(1)
    expect(r.state.session.winner_player_id).toBe(SOLO_BOT_ID)
  })
})
