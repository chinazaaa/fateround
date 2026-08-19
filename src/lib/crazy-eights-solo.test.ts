import { describe, it, expect } from 'vitest'
import {
  CRAZY8_SOLO_BOT_ID,
  CRAZY8_SOLO_HUMAN_ID,
  crazy8SoloChooseSuit,
  crazy8SoloDraw,
  crazy8SoloPlay,
  initCrazy8Solo,
  type Crazy8SoloState,
} from '@/lib/crazy-eights-solo'
import { parseCrazyEightsRules } from '@/lib/crazy-eights'
import type { CrazyEightsCard } from '@/types'

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const c = (id: string, suit: CrazyEightsCard['suit'], rank: number): CrazyEightsCard => ({ id, suit, rank })

function stateWithHands(opts: {
  humanHand: CrazyEightsCard[]
  botHand: CrazyEightsCard[]
  top: CrazyEightsCard
  turn?: 0 | 1
  requiredSuit?: CrazyEightsCard['suit'] | null
  pickTwo?: number
  jokerPenalty?: number
  drawPile?: CrazyEightsCard[]
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
      current_turn_index: opts.turn ?? 0,
      draw_pile: opts.drawPile ?? base.session.draw_pile,
      phase: 'playing',
    },
  }
}

describe('initCrazy8Solo', () => {
  it('deals 7 cards each and picks a non-special starter', () => {
    const s = initCrazy8Solo({ rng: seeded(42) })
    expect(s.hands[0]).toHaveLength(7)
    expect(s.hands[1]).toHaveLength(7)
    expect(s.session.top_card).not.toBeNull()
    // Starter never special under default rules.
    expect(s.session.top_card!.rank).not.toBe(8)
    expect(s.session.top_card!.suit).not.toBe('joker')
  })

  it('honours the first-player option', () => {
    expect(initCrazy8Solo({ rng: seeded(1), first: 1 }).session.current_turn_index).toBe(1)
  })

  it('round-trips through JSON without behaviour drift', () => {
    const s = initCrazy8Solo({ rng: seeded(7) })
    const rehydrated: Crazy8SoloState = JSON.parse(JSON.stringify(s))
    expect(rehydrated.hands).toEqual(s.hands)
    expect(rehydrated.session.top_card).toEqual(s.session.top_card)
  })
})

describe('crazy8SoloPlay — legality', () => {
  it('rejects a mismatched suit and rank', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'clubs', 7)],
      botHand: [c('b1', 'spades', 3)],
      top: c('top', 'spades', 5),
    })
    expect(crazy8SoloPlay(s, 0, 'h1', seeded(1)).error).toBe('Cannot play that card')
  })

  it('accepts a suit match', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 7)],
      botHand: [c('b1', 'hearts', 3)],
      top: c('top', 'spades', 5),
    })
    const r = crazy8SoloPlay(s, 0, 'h1', seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.outcome).toBe(0) // last card played wins
  })

  it('accepts a rank match', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'diamonds', 5)],
      botHand: [c('b1', 'hearts', 3)],
      top: c('top', 'spades', 5),
    })
    expect(crazy8SoloPlay(s, 0, 'h1', seeded(1)).error).toBeUndefined()
  })

  it('rejects out-of-turn moves', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 7)],
      botHand: [c('b1', 'hearts', 3)],
      top: c('top', 'spades', 5),
      turn: 1,
    })
    expect(crazy8SoloPlay(s, 0, 'h1', seeded(1)).error).toBe('Not your turn')
  })
})

describe('crazy8SoloPlay — special cards', () => {
  it('Skip (Ace) sends the turn back to the same seat in 2p', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 1), c('h2', 'clubs', 4)],
      botHand: [c('b1', 'hearts', 3)],
      top: c('top', 'spades', 5),
    })
    const r = crazy8SoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.current_turn_index).toBe(0)
  })

  it('Reverse (Queen) flips direction; in 2p the turn still advances', () => {
    // NOTE: the DB engine's Queen only flips the direction flag — it does not
    // add a skip step. In a 2-player game that means the turn still advances
    // to the opponent, same as any non-special card. (The DB engine's own
    // comment mistakenly says Queen "hands the turn back" in 2p, but the
    // implementation doesn't.) Solo mirrors the shipping behaviour so a
    // player's mental model transfers between the two.
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 12), c('h2', 'clubs', 4)],
      botHand: [c('b1', 'hearts', 3)],
      top: c('top', 'spades', 5),
    })
    const r = crazy8SoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.direction).toBe(-1)
    expect(r.state.session.current_turn_index).toBe(1)
  })

  it('Pick 2 stacks a penalty on the opponent', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 2), c('h2', 'clubs', 4)],
      botHand: [c('b1', 'hearts', 3)],
      top: c('top', 'spades', 5),
    })
    const r = crazy8SoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.pick_two_stack).toBe(2)
    expect(r.state.session.current_turn_index).toBe(1)
  })

  it('8 (wild) with cards left pauses for suit choice', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'clubs', 8), c('h2', 'clubs', 4)],
      botHand: [c('b1', 'hearts', 3)],
      top: c('top', 'spades', 5),
    })
    const r = crazy8SoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.phase).toBe('choose_suit')
    expect(r.state.session.current_turn_index).toBe(0)
  })

  it('Joker leaves a 5-card penalty on the next player after suit is chosen', () => {
    const rules = parseCrazyEightsRules({ crazy8_jokers: true } as any)
    const s = {
      ...stateWithHands({
        humanHand: [c('h1', 'joker', 0), c('h2', 'clubs', 4)],
        botHand: [c('b1', 'hearts', 3)],
        top: c('top', 'spades', 5),
      }),
      rules,
    }
    const afterPlay = crazy8SoloPlay(s, 0, 'h1', seeded(1))
    expect(afterPlay.state.session.phase).toBe('choose_suit')
    expect(afterPlay.state.session.joker_penalty).toBe(5)
    // After choosing a suit, the penalty is still there for the bot to draw.
    const afterChoose = crazy8SoloChooseSuit(afterPlay.state, 0, 'clubs')
    expect(afterChoose.state.session.joker_penalty).toBe(5)
    expect(afterChoose.state.session.current_turn_index).toBe(1)
  })

  it('wild as the last card wins immediately (no suit choice needed)', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'clubs', 8)],
      botHand: [c('b1', 'hearts', 3)],
      top: c('top', 'spades', 5),
    })
    const r = crazy8SoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.outcome).toBe(0)
    expect(r.state.session.phase).toBe('finished')
  })
})

describe('crazy8SoloPlay — Pick 2 defence', () => {
  it('only a 2 is legal under Pick 2', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'clubs', 3), c('h2', 'hearts', 2)],
      botHand: [c('b1', 'spades', 3)],
      top: c('top', 'spades', 2),
      pickTwo: 2,
    })
    expect(crazy8SoloPlay(s, 0, 'h1', seeded(1)).error).toMatch(/Pick 2/i)
    const r = crazy8SoloPlay(s, 0, 'h2', seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.session.pick_two_stack).toBe(4) // stacked
  })

  it('Joker penalty is undefendable — no card is playable', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'joker', 0), c('h2', 'hearts', 2)],
      botHand: [c('b1', 'spades', 3)],
      top: c('top', 'spades', 5),
      jokerPenalty: 5,
    })
    expect(crazy8SoloPlay(s, 0, 'h1', seeded(1)).error).toMatch(/Joker/i)
    expect(crazy8SoloPlay(s, 0, 'h2', seeded(1)).error).toMatch(/Joker/i)
  })
})

describe('crazy8SoloDraw', () => {
  it('draws one card and passes the turn', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'clubs', 7)],
      botHand: [c('b1', 'spades', 3)],
      top: c('top', 'spades', 5),
      drawPile: [c('d1', 'diamonds', 9)],
    })
    const r = crazy8SoloDraw(s, 0, seeded(1))
    expect(r.state.hands[0]).toHaveLength(2)
    expect(r.state.session.current_turn_index).toBe(1)
  })

  it('drawing under Pick 2 draws the full penalty and clears the stack', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'clubs', 7)],
      botHand: [c('b1', 'spades', 3)],
      top: c('top', 'spades', 2),
      pickTwo: 4,
      drawPile: [c('d1', 'hearts', 9), c('d2', 'hearts', 10), c('d3', 'hearts', 11), c('d4', 'hearts', 12)],
    })
    const r = crazy8SoloDraw(s, 0, seeded(1))
    expect(r.state.hands[0]).toHaveLength(5)
    expect(r.state.session.pick_two_stack).toBe(0)
  })

  it('empty piles + no legal move → ends by lowest hand', () => {
    // Human hand sum: 3. Bot: 10. Human wins.
    const s = stateWithHands({
      humanHand: [c('h1', 'clubs', 3)],
      botHand: [c('b1', 'spades', 10)],
      top: c('top', 'diamonds', 5),
      drawPile: [],
    })
    const r = crazy8SoloDraw(s, 0, seeded(1))
    expect(r.state.outcome).toBe(0)
    expect(r.state.session.phase).toBe('finished')
  })
})

describe('game-end wiring', () => {
  it('winner_player_id + finish_order + outcome propagate together', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 7)],
      botHand: [c('b1', 'hearts', 3)],
      top: c('top', 'spades', 5),
    })
    const r = crazy8SoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.outcome).toBe(0)
    expect(r.state.session.winner_player_id).toBe(CRAZY8_SOLO_HUMAN_ID)
    expect(r.state.session.finish_order).toEqual([CRAZY8_SOLO_HUMAN_ID])
  })

  it('bot going out sets bot as winner', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'spades', 4)],
      botHand: [c('b1', 'hearts', 3)],
      top: c('top', 'hearts', 5),
      turn: 1,
    })
    const r = crazy8SoloPlay(s, 1, 'b1', seeded(1))
    expect(r.state.outcome).toBe(1)
    expect(r.state.session.winner_player_id).toBe(CRAZY8_SOLO_BOT_ID)
  })
})
