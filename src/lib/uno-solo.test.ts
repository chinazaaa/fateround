import { describe, it, expect } from 'vitest'
import {
  UNO_SOLO_BOT_ID,
  UNO_SOLO_HUMAN_ID,
  initUnoSolo,
  isPlayable,
  unoSoloChooseColor,
  unoSoloDraw,
  unoSoloPlay,
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
  drawPile?: UnoCard[]
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
      current_turn_index: opts.turn ?? 0,
      draw_pile: opts.drawPile ?? base.session.draw_pile,
      phase: 'playing',
    },
  }
}

describe('initUnoSolo', () => {
  it('deals 7 cards each and picks a plain number as starter', () => {
    const s = initUnoSolo({ rng: seeded(42) })
    expect(s.hands[0]).toHaveLength(7)
    expect(s.hands[1]).toHaveLength(7)
    expect(s.session.top_card).not.toBeNull()
    // Starter is always a number card under solo rules.
    expect(s.session.top_card!.kind).toBe('number')
    expect(s.session.top_card!.color).not.toBe('wild')
  })

  it('honours the first-player option', () => {
    expect(initUnoSolo({ rng: seeded(1), first: 1 }).session.current_turn_index).toBe(1)
  })

  it('round-trips through JSON without behaviour drift', () => {
    const s = initUnoSolo({ rng: seeded(7) })
    const rehydrated: UnoSoloState = JSON.parse(JSON.stringify(s))
    expect(rehydrated.hands).toEqual(s.hands)
    expect(rehydrated.session.top_card).toEqual(s.session.top_card)
  })
})

describe('unoSoloPlay — legality', () => {
  it('rejects a mismatched colour and value', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'blue', 'number', 3)],
      botHand: [c('b1', 'red', 'number', 7)],
      top: c('top', 'red', 'number', 5),
    })
    expect(unoSoloPlay(s, 0, 'h1', seeded(1)).error).toBe('Cannot play that card')
  })

  it('accepts a colour match', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 9)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlay(s, 0, 'h1', seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.outcome).toBe(0) // last card wins
  })

  it('accepts a value match across colours', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'green', 'number', 5)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    expect(unoSoloPlay(s, 0, 'h1', seeded(1)).error).toBeUndefined()
  })

  it('rejects out-of-turn moves', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 9)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
      turn: 1,
    })
    expect(unoSoloPlay(s, 0, 'h1', seeded(1)).error).toBe('Not your turn')
  })
})

describe('unoSoloPlay — action cards', () => {
  it('Skip keeps the turn with the same seat in 2p', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'skip'), c('h2', 'red', 'number', 4)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.current_turn_index).toBe(0)
  })

  it('Reverse in 2p acts as a Skip (turn stays with mover)', () => {
    // In 2p, "next player in the opposite direction" is the same player who
    // just played — that's the classical UNO rule, and solo mirrors it.
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'reverse'), c('h2', 'red', 'number', 4)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.direction).toBe(-1)
    expect(r.state.session.current_turn_index).toBe(0)
  })

  it('Draw 2 leaves a 2-card penalty on the opponent', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'draw2'), c('h2', 'red', 'number', 4)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.draw_penalty).toBe(2)
    expect(r.state.session.current_turn_index).toBe(1)
  })

  it('Wild with cards left pauses for colour choice', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'wild', 'wild'), c('h2', 'red', 'number', 4)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.session.phase).toBe('choose_color')
    expect(r.state.session.current_turn_index).toBe(0)
  })

  it('Wild Draw 4 queues a 4-card penalty for the opponent', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'wild', 'wild_draw4'), c('h2', 'red', 'number', 4)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const afterPlay = unoSoloPlay(s, 0, 'h1', seeded(1))
    expect(afterPlay.state.session.phase).toBe('choose_color')
    expect(afterPlay.state.session.draw_penalty).toBe(4)
    // After choosing a colour, the penalty is still there for the bot to draw.
    const afterChoose = unoSoloChooseColor(afterPlay.state, 0, 'green')
    expect(afterChoose.state.session.draw_penalty).toBe(4)
    expect(afterChoose.state.session.current_turn_index).toBe(1)
  })

  it('wild as the last card wins immediately (no colour choice needed)', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'wild', 'wild')],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.outcome).toBe(0)
    expect(r.state.session.phase).toBe('finished')
  })
})

describe('unoSoloPlay — draw penalty defence', () => {
  it('under a Draw 2, no card is playable (solo does not allow stacking)', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'draw2'), c('h2', 'red', 'number', 5)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'draw2'),
      drawPenalty: 2,
    })
    expect(unoSoloPlay(s, 0, 'h1', seeded(1)).error).toBe('Draw 2 first')
  })

  it('isPlayable reflects the penalty', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'draw2')],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'draw2'),
      drawPenalty: 2,
    })
    expect(isPlayable(s, s.hands[0][0]!)).toBe(false)
  })
})

describe('unoSoloDraw', () => {
  it('draws one card and passes the turn', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'blue', 'number', 7)],
      botHand: [c('b1', 'red', 'number', 3)],
      top: c('top', 'red', 'number', 5),
      drawPile: [c('d1', 'green', 'number', 9)],
    })
    const r = unoSoloDraw(s, 0, seeded(1))
    expect(r.state.hands[0]).toHaveLength(2)
    expect(r.state.session.current_turn_index).toBe(1)
  })

  it('draws the full penalty under Draw 2 and clears it', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'blue', 'number', 7)],
      botHand: [c('b1', 'red', 'number', 3)],
      top: c('top', 'red', 'draw2'),
      drawPenalty: 4,
      drawPile: [
        c('d1', 'green', 'number', 9),
        c('d2', 'green', 'number', 8),
        c('d3', 'green', 'number', 7),
        c('d4', 'green', 'number', 6),
      ],
    })
    const r = unoSoloDraw(s, 0, seeded(1))
    expect(r.state.hands[0]).toHaveLength(5)
    expect(r.state.session.draw_penalty).toBe(0)
  })

  it('empty piles + no legal move → ends by lowest hand', () => {
    // Human hand sum: 3. Bot: 9. Human wins.
    const s = stateWithHands({
      humanHand: [c('h1', 'blue', 'number', 3)],
      botHand: [c('b1', 'red', 'number', 9)],
      top: c('top', 'green', 'number', 5),
      drawPile: [],
    })
    const r = unoSoloDraw(s, 0, seeded(1))
    expect(r.state.outcome).toBe(0)
    expect(r.state.session.phase).toBe('finished')
  })
})

describe('game-end wiring', () => {
  it('propagates outcome + winner_player_id + finish_order together', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 9)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlay(s, 0, 'h1', seeded(1))
    expect(r.state.outcome).toBe(0)
    expect(r.state.session.winner_player_id).toBe(UNO_SOLO_HUMAN_ID)
    expect(r.state.session.finish_order).toEqual([UNO_SOLO_HUMAN_ID])
  })

  it('bot going out sets bot as winner', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'blue', 'number', 4)],
      botHand: [c('b1', 'red', 'number', 3)],
      top: c('top', 'red', 'number', 5),
      turn: 1,
    })
    const r = unoSoloPlay(s, 1, 'b1', seeded(1))
    expect(r.state.outcome).toBe(1)
    expect(r.state.session.winner_player_id).toBe(UNO_SOLO_BOT_ID)
  })
})
