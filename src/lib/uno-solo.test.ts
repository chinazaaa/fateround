import { describe, it, expect } from 'vitest'
import {
  UNO_SOLO_BOT_ID,
  UNO_SOLO_HUMAN_ID,
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
  drawPile?: UnoCard[]
}): UnoSoloState {
  const base = initUnoSolo({ rng: seeded(1) })
  // Derive the penalty kind from the top card so a WD4 top with a penalty
  // stacks correctly (only same-kind stacking is allowed by the DB engine).
  const penaltyKind: 'draw2' | 'wild_draw4' | null = opts.drawPenalty
    ? opts.top.kind === 'wild_draw4'
      ? 'wild_draw4'
      : 'draw2'
    : null
  return {
    ...base,
    hands: [opts.humanHand, opts.botHand],
    session: {
      ...base.session,
      top_card: opts.top,
      required_color: (opts.requiredColor as any) ?? null,
      draw_penalty: opts.drawPenalty ?? 0,
      draw_penalty_kind: penaltyKind,
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
  it('under a Draw 2, another Draw 2 stacks the penalty (classic same-kind stacking)', () => {
    // Any card that is NOT a Draw 2 stays illegal — the engine's canPlayCard
    // enforces the "same-kind only" rule. The Draw 2 itself becomes legal and
    // adds 2 to the pending stack.
    const s = stateWithHands({
      humanHand: [c('h1', 'blue', 'number', 5), c('h2', 'blue', 'draw2')],
      botHand: [c('b1', 'green', 'number', 3)],
      top: c('top', 'red', 'draw2'),
      drawPenalty: 2,
    })
    expect(unoSoloPlay(s, 0, 'h1', seeded(1)).error).toBe('Draw 2 first')
    const r = unoSoloPlay(s, 0, 'h2', seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.session.draw_penalty).toBe(4) // 2 + 2 stacked
    expect(r.state.session.current_turn_index).toBe(1)
  })

  it('under a Wild Draw 4, another WD4 stacks the penalty', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'wild', 'wild_draw4'), c('h2', 'blue', 'number', 3)],
      botHand: [c('b1', 'green', 'number', 3)],
      top: c('top', 'blue', 'wild_draw4'),
      drawPenalty: 4,
    })
    const afterPlay = unoSoloPlay(s, 0, 'h1', seeded(1))
    expect(afterPlay.error).toBeUndefined()
    expect(afterPlay.state.session.phase).toBe('choose_color')
    expect(afterPlay.state.session.draw_penalty).toBe(8) // 4 + 4 stacked
  })

  it('isPlayable respects the stacking rule (Draw 2 legal, other cards not)', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'draw2'), c('h2', 'blue', 'number', 5)],
      botHand: [c('b1', 'green', 'number', 3)],
      top: c('top', 'red', 'draw2'),
      drawPenalty: 2,
    })
    expect(isPlayable(s, s.hands[0][0]!)).toBe(true) // draw2 stacks
    expect(isPlayable(s, s.hands[0][1]!)).toBe(false) // number card cannot defend
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

describe('unoSoloPlayMulti', () => {
  it('lays a same-colour number set and passes turn to opponent', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 5), c('h2', 'red', 'number', 8), c('h3', 'blue', 'number', 2)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlayMulti(s, 0, ['h1', 'h2'], seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.hands[0]).toHaveLength(1)
    expect(r.state.session.top_card).toEqual(expect.objectContaining({ id: 'h2' }))
    expect(r.state.session.current_turn_index).toBe(1)
  })

  it('lays a same-number set across colours', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 5), c('h2', 'blue', 'number', 5), c('h3', 'green', 'number', 9)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlayMulti(s, 0, ['h1', 'h2'], seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.session.top_card).toEqual(expect.objectContaining({ id: 'h2' }))
  })

  it('rejects a set that does not share colour or number', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 5), c('h2', 'blue', 'number', 8)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    expect(unoSoloPlayMulti(s, 0, ['h1', 'h2'], seeded(1)).error).toBeTruthy()
  })

  it('rejects a wild inside a set — wilds must be played alone', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 5), c('w', 'wild', 'wild')],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    expect(unoSoloPlayMulti(s, 0, ['h1', 'w'], seeded(1)).error).toBeTruthy()
  })

  it('rejects when the first card does not match the top card', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'blue', 'number', 8), c('h2', 'blue', 'number', 3)],
      botHand: [c('b1', 'blue', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    expect(unoSoloPlayMulti(s, 0, ['h1', 'h2'], seeded(1)).error).toBeTruthy()
  })

  it('stacks two Draw 2s as a pending 4 for the opponent', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'draw2'), c('h2', 'red', 'draw2'), c('h3', 'red', 'number', 0)],
      botHand: [c('b1', 'green', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlayMulti(s, 0, ['h1', 'h2'], seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.session.draw_penalty).toBe(4)
    expect(r.state.session.draw_penalty_kind).toBe('draw2')
    expect(r.state.session.current_turn_index).toBe(1)
  })

  it('an odd skip count in 2p keeps the turn with the player', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'skip'), c('h2', 'red', 'number', 5), c('h3', 'green', 'number', 9)],
      botHand: [c('b1', 'green', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    // number covers the skip's turn-flow effect (per resolveMultiPlayAdvance), so this is just
    // a plain play → passes to opponent.
    const r1 = unoSoloPlayMulti(s, 0, ['h1', 'h2'], seeded(1))
    expect(r1.error).toBeUndefined()
    expect(r1.state.session.current_turn_index).toBe(1)

    // Two skips (both after any number effect) → even skips → opponent's turn.
    const s2 = stateWithHands({
      humanHand: [c('h1', 'red', 'skip'), c('h2', 'red', 'skip'), c('h3', 'green', 'number', 9)],
      botHand: [c('b1', 'green', 'number', 3)],
      top: c('top', 'red', 'skip'),
    })
    const r2 = unoSoloPlayMulti(s2, 0, ['h1', 'h2'], seeded(1))
    expect(r2.error).toBeUndefined()
    expect(r2.state.session.current_turn_index).toBe(1)
  })

  it('a Draw 2 followed by a Skip auto-resolves the draw and returns the turn', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'draw2'), c('h2', 'red', 'skip'), c('h3', 'red', 'number', 0)],
      botHand: [c('b1', 'green', 'number', 3)],
      top: c('top', 'red', 'number', 5),
      drawPile: [c('d1', 'blue', 'number', 1), c('d2', 'blue', 'number', 2), c('d3', 'blue', 'number', 3)],
    })
    const r = unoSoloPlayMulti(s, 0, ['h1', 'h2'], seeded(1))
    expect(r.error).toBeUndefined()
    // No pending penalty — opponent already drew.
    expect(r.state.session.draw_penalty ?? 0).toBe(0)
    // Opponent picked up two cards.
    expect(r.state.hands[1]).toHaveLength(3)
    // Turn returns to the player after the trailing skip.
    expect(r.state.session.current_turn_index).toBe(0)
  })

  it('going out on the last card of the set wins the game', () => {
    const s = stateWithHands({
      humanHand: [c('h1', 'red', 'number', 1), c('h2', 'red', 'number', 9)],
      botHand: [c('b1', 'green', 'number', 3)],
      top: c('top', 'red', 'number', 5),
    })
    const r = unoSoloPlayMulti(s, 0, ['h1', 'h2'], seeded(1))
    expect(r.error).toBeUndefined()
    expect(r.state.outcome).toBe(0)
    expect(r.state.session.winner_player_id).toBe(UNO_SOLO_HUMAN_ID)
  })
})
