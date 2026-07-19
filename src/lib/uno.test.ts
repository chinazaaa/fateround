import { describe, it, expect } from 'vitest'
import {
  buildUnoDeck,
  canPlayCard,
  cardPoints,
  unoHandSum,
  unoPlacementOrder,
  buildUnoStandings,
  isWildCard,
  activeColor,
  unoNextTurnIndex,
  hasPlayableCard,
  parseUnoRules,
  rotateActiveHands,
} from './uno'
import type { UnoCard, UnoPlayerHand, UnoSession } from '@/types'

function card(partial: Partial<UnoCard> & Pick<UnoCard, 'color' | 'kind'>): UnoCard {
  return { id: partial.id ?? `${partial.color}-${partial.kind}-${partial.value ?? ''}`, ...partial }
}

function session(partial: Partial<UnoSession>): UnoSession {
  return {
    id: 's',
    game_id: 'G',
    turn_order: [],
    current_turn_index: 0,
    direction: 1,
    phase: 'playing',
    draw_pile: [],
    discard_pile: [],
    top_card: null,
    required_color: null,
    draw_penalty: 0,
    draw_penalty_kind: null,
    drawn_card_id: null,
    pending_wild: null,
    challenge_prev_color: null,
    wd4_player_id: null,
    uno_pending_player: null,
    uno_called: false,
    status_message: null,
    winner_player_id: null,
    finish_order: [],
    turn_deadline_at: null,
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('buildUnoDeck', () => {
  const deck = buildUnoDeck()

  it('has exactly 108 cards', () => {
    expect(deck.length).toBe(108)
  })

  it('has 19 number cards per colour (one 0, two each 1–9)', () => {
    for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
      const nums = deck.filter((c) => c.color === color && c.kind === 'number')
      expect(nums.length).toBe(19)
      expect(nums.filter((c) => c.value === 0).length).toBe(1)
      expect(nums.filter((c) => c.value === 5).length).toBe(2)
    }
  })

  it('has 8 of each action per colour split (2 skip/reverse/draw2 each)', () => {
    for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
      expect(deck.filter((c) => c.color === color && c.kind === 'skip').length).toBe(2)
      expect(deck.filter((c) => c.color === color && c.kind === 'reverse').length).toBe(2)
      expect(deck.filter((c) => c.color === color && c.kind === 'draw2').length).toBe(2)
    }
  })

  it('has 4 Wild and 4 Wild Draw Four', () => {
    expect(deck.filter((c) => c.kind === 'wild').length).toBe(4)
    expect(deck.filter((c) => c.kind === 'wild_draw4').length).toBe(4)
  })

  it('has unique card ids', () => {
    expect(new Set(deck.map((c) => c.id)).size).toBe(108)
  })
})

describe('cardPoints', () => {
  it('scores number cards at face value', () => {
    expect(cardPoints(card({ color: 'red', kind: 'number', value: 7 }))).toBe(7)
    expect(cardPoints(card({ color: 'blue', kind: 'number', value: 0 }))).toBe(0)
  })
  it('scores action cards 20, wilds 50', () => {
    expect(cardPoints(card({ color: 'green', kind: 'skip' }))).toBe(20)
    expect(cardPoints(card({ color: 'red', kind: 'draw2' }))).toBe(20)
    expect(cardPoints(card({ color: 'wild', kind: 'wild' }))).toBe(50)
    expect(cardPoints(card({ color: 'wild', kind: 'wild_draw4' }))).toBe(50)
  })
  it('sums a hand', () => {
    expect(
      unoHandSum([
        card({ color: 'red', kind: 'number', value: 9 }),
        card({ color: 'blue', kind: 'skip' }),
        card({ color: 'wild', kind: 'wild' }),
      ])
    ).toBe(79)
  })
})

describe('isWildCard / activeColor', () => {
  it('flags wild + wild_draw4 as wild', () => {
    expect(isWildCard(card({ color: 'wild', kind: 'wild' }))).toBe(true)
    expect(isWildCard(card({ color: 'wild', kind: 'wild_draw4' }))).toBe(true)
    expect(isWildCard(card({ color: 'red', kind: 'skip' }))).toBe(false)
  })
  it('active colour prefers required_color then top card colour', () => {
    expect(
      activeColor(session({ required_color: 'green', top_card: card({ color: 'red', kind: 'number', value: 1 }) }))
    ).toBe('green')
    expect(activeColor(session({ top_card: card({ color: 'blue', kind: 'number', value: 1 }) }))).toBe('blue')
    expect(activeColor(session({ top_card: card({ color: 'wild', kind: 'wild' }) }))).toBeNull()
  })
})

describe('canPlayCard', () => {
  const top = card({ color: 'red', kind: 'number', value: 5 })

  it('matches by colour', () => {
    expect(canPlayCard(card({ color: 'red', kind: 'number', value: 9 }), session({ top_card: top }))).toBe(true)
  })
  it('matches by number across colours', () => {
    expect(canPlayCard(card({ color: 'blue', kind: 'number', value: 5 }), session({ top_card: top }))).toBe(true)
  })
  it('matches by symbol (skip on skip)', () => {
    expect(
      canPlayCard(card({ color: 'blue', kind: 'skip' }), session({ top_card: card({ color: 'red', kind: 'skip' }) }))
    ).toBe(true)
  })
  it('rejects a non-matching card', () => {
    expect(canPlayCard(card({ color: 'blue', kind: 'number', value: 9 }), session({ top_card: top }))).toBe(false)
  })
  it('wild cards play on anything', () => {
    expect(canPlayCard(card({ color: 'wild', kind: 'wild' }), session({ top_card: top }))).toBe(true)
    expect(canPlayCard(card({ color: 'wild', kind: 'wild_draw4' }), session({ top_card: top }))).toBe(true)
  })
  it('honours required_color from a wild', () => {
    const s = session({ top_card: card({ color: 'wild', kind: 'wild' }), required_color: 'green' })
    expect(canPlayCard(card({ color: 'green', kind: 'number', value: 1 }), s)).toBe(true)
    expect(canPlayCard(card({ color: 'red', kind: 'number', value: 1 }), s)).toBe(false)
  })
  it('blocks all plays while a draw penalty is pending with no stack kind (Classic: must draw)', () => {
    const s = session({ top_card: top, draw_penalty: 2, draw_penalty_kind: null })
    expect(canPlayCard(card({ color: 'red', kind: 'number', value: 5 }), s)).toBe(false)
    expect(canPlayCard(card({ color: 'wild', kind: 'wild_draw4' }), s)).toBe(false)
    expect(hasPlayableCard([card({ color: 'red', kind: 'number', value: 5 })], s)).toBe(false)
  })

  it('lets a Draw Two stack onto a Draw-Two penalty (only a Draw Two)', () => {
    const s = session({ top_card: card({ color: 'red', kind: 'draw2' }), draw_penalty: 2, draw_penalty_kind: 'draw2' })
    expect(canPlayCard(card({ color: 'blue', kind: 'draw2' }), s)).toBe(true)
    expect(canPlayCard(card({ color: 'red', kind: 'number', value: 5 }), s)).toBe(false)
    expect(canPlayCard(card({ color: 'wild', kind: 'wild_draw4' }), s)).toBe(false)
  })

  it('lets a Wild Draw Four stack onto a Draw-Four penalty (only a Wild Draw Four)', () => {
    const s = session({
      top_card: card({ color: 'wild', kind: 'wild_draw4' }),
      required_color: 'red',
      draw_penalty: 4,
      draw_penalty_kind: 'wild_draw4',
    })
    expect(canPlayCard(card({ color: 'wild', kind: 'wild_draw4' }), s)).toBe(true)
    expect(canPlayCard(card({ color: 'red', kind: 'draw2' }), s)).toBe(false)
    expect(canPlayCard(card({ color: 'red', kind: 'number', value: 1 }), s)).toBe(false)
  })
})

describe('unoNextTurnIndex', () => {
  const hands = (order: string[]): UnoPlayerHand[] =>
    order.map((id, i) => ({
      id: `h${i}`,
      game_id: 'G',
      player_id: id,
      cards: [card({ color: 'red', kind: 'number', value: 1 })],
      player_order: i,
      created_at: '',
    }))

  it('advances forward one step', () => {
    const s = session({ turn_order: ['a', 'b', 'c'], current_turn_index: 0 })
    expect(unoNextTurnIndex(s, hands(['a', 'b', 'c']), 0, 1, 1)).toBe(1)
  })
  it('skips two steps (Skip card)', () => {
    const s = session({ turn_order: ['a', 'b', 'c'], current_turn_index: 0 })
    expect(unoNextTurnIndex(s, hands(['a', 'b', 'c']), 0, 2, 1)).toBe(2)
  })
  it('wraps reversed', () => {
    const s = session({ turn_order: ['a', 'b', 'c'], current_turn_index: 0, direction: -1 })
    expect(unoNextTurnIndex(s, hands(['a', 'b', 'c']), 0, 1, -1)).toBe(2)
  })
  it('skips players who are out of cards', () => {
    const s = session({ turn_order: ['a', 'b', 'c'], current_turn_index: 0 })
    const h = hands(['a', 'b', 'c'])
    h[1].cards = [] // b is out
    expect(unoNextTurnIndex(s, h, 0, 1, 1)).toBe(2)
  })
})

describe('unoPlacementOrder / buildUnoStandings', () => {
  const players = [
    { id: 'a', name: 'Ann' },
    { id: 'b', name: 'Bob' },
    { id: 'c', name: 'Cara' },
  ]
  const hands: UnoPlayerHand[] = [
    { id: 'ha', game_id: 'G', player_id: 'a', cards: [], player_order: 0, created_at: '' },
    {
      id: 'hb',
      game_id: 'G',
      player_id: 'b',
      cards: [card({ color: 'red', kind: 'number', value: 3 })],
      player_order: 1,
      created_at: '',
    },
    {
      id: 'hc',
      game_id: 'G',
      player_id: 'c',
      cards: [card({ color: 'wild', kind: 'wild' })],
      player_order: 2,
      created_at: '',
    },
  ]

  it('ranks the finisher first, then lowest hand total', () => {
    const order = unoPlacementOrder(hands, ['a', 'b', 'c'], ['a'])
    expect(order).toEqual(['a', 'b', 'c']) // a out first, then b (3 pts) < c (50 pts)
  })

  it('builds standings with ranks and sums', () => {
    const standings = buildUnoStandings(hands, players, ['a', 'b', 'c'], ['a'])
    expect(standings.map((s) => s.name)).toEqual(['Ann', 'Bob', 'Cara'])
    expect(standings[0].rank).toBe(1)
    expect(standings[1].handSum).toBe(3)
    expect(standings[2].handSum).toBe(50)
  })
})

describe('parseUnoRules', () => {
  it('defaults: challenge on, penalty 2, wd4 penalty 6, 0-7 off, stacking off', () => {
    const r = parseUnoRules(null)
    expect(r).toEqual({ wd4Challenge: true, unoPenalty: 2, wd4ChallengePenalty: 6, zeroSeven: false, stacking: false })
  })
  it('reads host overrides', () => {
    const r = parseUnoRules({
      uno_wd4_challenge: false,
      uno_uno_penalty: 4,
      uno_wd4_challenge_penalty: 6,
      uno_zero_seven: true,
      uno_stacking: true,
    })
    expect(r).toEqual({ wd4Challenge: false, unoPenalty: 4, wd4ChallengePenalty: 6, zeroSeven: true, stacking: true })
  })
  it('reads the milder wd4 penalty variant (4) and clamps junk to 6', () => {
    expect(parseUnoRules({ uno_wd4_challenge_penalty: 4 }).wd4ChallengePenalty).toBe(4)
    expect(parseUnoRules({ uno_uno_penalty: 3, uno_wd4_challenge_penalty: 5 }).wd4ChallengePenalty).toBe(6)
    expect(parseUnoRules({ uno_uno_penalty: 3 }).unoPenalty).toBe(2)
  })
})

describe('rotateActiveHands (0 rule)', () => {
  const s = session({ turn_order: ['a', 'b', 'c'] })
  const mk = () =>
    new Map<string, UnoCard[]>([
      ['a', [card({ id: 'ax', color: 'red', kind: 'number', value: 1 })]],
      ['b', [card({ id: 'bx', color: 'blue', kind: 'number', value: 2 })]],
      ['c', [card({ id: 'cx', color: 'green', kind: 'number', value: 3 })]],
    ])

  it('passes each hand to the next seat forward', () => {
    const out = rotateActiveHands(s, mk(), 1)
    const by = Object.fromEntries(out.map((o) => [o.playerId, o.cards[0]!.id]))
    // a→b, b→c, c→a
    expect(by).toEqual({ b: 'ax', c: 'bx', a: 'cx' })
  })

  it('passes each hand to the previous seat when reversed', () => {
    const out = rotateActiveHands(s, mk(), -1)
    const by = Object.fromEntries(out.map((o) => [o.playerId, o.cards[0]!.id]))
    // a→c, b→a, c→b
    expect(by).toEqual({ c: 'ax', a: 'bx', b: 'cx' })
  })

  it('skips players who are out of cards', () => {
    const m = mk()
    m.set('b', []) // b is out
    const out = rotateActiveHands(s, m, 1)
    expect(out.map((o) => o.playerId).sort()).toEqual(['a', 'c'])
    const by = Object.fromEntries(out.map((o) => [o.playerId, o.cards[0]!.id]))
    // active seq [a, c]: a→c, c→a
    expect(by).toEqual({ c: 'ax', a: 'cx' })
  })
})
