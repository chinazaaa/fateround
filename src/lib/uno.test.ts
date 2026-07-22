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
  multiSetGroupingOk,
  validateMultiSet,
  unoTeamIndex,
  unoTeammateId,
  unoPlayerSharesWin,
  unoActiveTeammates,
  resolveMultiPlayAdvance,
} from './uno'
import type { UnoCard, UnoColor, UnoPlayerHand, UnoSession } from '@/types'

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

describe('Team-Up helpers', () => {
  const order = ['a', 'b', 'c', 'd'] // seats: A1(a) B1(b) A2(c) B2(d)

  it('teams follow seating parity', () => {
    expect(unoTeamIndex(order, 'a')).toBe(0)
    expect(unoTeamIndex(order, 'c')).toBe(0)
    expect(unoTeamIndex(order, 'b')).toBe(1)
    expect(unoTeamIndex(order, 'd')).toBe(1)
    expect(unoTeamIndex(order, 'z')).toBeNull()
  })

  it('teammate is the other same-parity seat (across the table)', () => {
    expect(unoTeammateId(order, 'a')).toBe('c')
    expect(unoTeammateId(order, 'c')).toBe('a')
    expect(unoTeammateId(order, 'b')).toBe('d')
    expect(unoTeammateId(order, 'd')).toBe('b')
  })

  it('sharesWin: winner and (in team mode) their teammate both count; opponents never do', () => {
    // 'a' emptied their hand; teammate is 'c'.
    expect(unoPlayerSharesWin(order, 'a', 'a', true)).toBe(true) // winner
    expect(unoPlayerSharesWin(order, 'a', 'c', true)).toBe(true) // winner's partner
    expect(unoPlayerSharesWin(order, 'a', 'b', true)).toBe(false) // opponent
    expect(unoPlayerSharesWin(order, 'a', 'd', true)).toBe(false) // opponent
    // Outside team mode only the winner counts.
    expect(unoPlayerSharesWin(order, 'a', 'c', false)).toBe(false)
    expect(unoPlayerSharesWin(order, 'a', 'a', false)).toBe(true)
    // Null-safe.
    expect(unoPlayerSharesWin(order, null, 'a', true)).toBe(false)
    expect(unoPlayerSharesWin(order, 'a', null, true)).toBe(false)
  })

  it('placement ranks the winning team first (both members), then the losers', () => {
    const hands: UnoPlayerHand[] = [
      { id: 'ha', game_id: 'G', player_id: 'a', cards: [], player_order: 0, created_at: '' }, // emptied
      {
        id: 'hc',
        game_id: 'G',
        player_id: 'c',
        cards: [card({ color: 'red', kind: 'number', value: 9 })],
        player_order: 2,
        created_at: '',
      }, // a's teammate (still holding)
      {
        id: 'hb',
        game_id: 'G',
        player_id: 'b',
        cards: [card({ color: 'blue', kind: 'number', value: 2 })],
        player_order: 1,
        created_at: '',
      },
      {
        id: 'hd',
        game_id: 'G',
        player_id: 'd',
        cards: [card({ color: 'wild', kind: 'wild' })],
        player_order: 3,
        created_at: '',
      },
    ]
    // a emptied → team {a,c} wins even though c still holds cards.
    expect(unoPlacementOrder(hands, order, ['a'], true)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('mid-round leave: a left teammate is excluded from the team total and sorts last', () => {
    const hands: UnoPlayerHand[] = [
      {
        id: 'ha',
        game_id: 'G',
        player_id: 'a',
        cards: [card({ color: 'red', kind: 'number', value: 9 }), card({ color: 'red', kind: 'number', value: 9 })],
        player_order: 0,
        created_at: '',
      }, // 18 — solo remainder of team A
      {
        id: 'hb',
        game_id: 'G',
        player_id: 'b',
        cards: [card({ color: 'blue', kind: 'number', value: 2 })],
        player_order: 1,
        created_at: '',
      },
      {
        id: 'hd',
        game_id: 'G',
        player_id: 'd',
        cards: [card({ color: 'green', kind: 'number', value: 2 })],
        player_order: 3,
        created_at: '',
      },
      // 'c' (a's teammate) left mid-round — no hand row.
    ]
    // Timer end: team A total = just a (18); team B = b+d (4) → team B wins. 'c' sorts last.
    expect(unoPlacementOrder(hands, order, [], true, ['c'])).toEqual(['b', 'd', 'a', 'c'])
  })

  it('unoActiveTeammates: the partner is active until they too leave', () => {
    const hands: UnoPlayerHand[] = [
      {
        id: 'hc',
        game_id: 'G',
        player_id: 'c',
        cards: [card({ color: 'red', kind: 'number', value: 1 })],
        player_order: 2,
        created_at: '',
      },
      {
        id: 'hb',
        game_id: 'G',
        player_id: 'b',
        cards: [card({ color: 'blue', kind: 'number', value: 2 })],
        player_order: 1,
        created_at: '',
      },
      {
        id: 'hd',
        game_id: 'G',
        player_id: 'd',
        cards: [card({ color: 'green', kind: 'number', value: 3 })],
        player_order: 3,
        created_at: '',
      },
    ]
    // 'a' left; a & c are a team → c is the remaining active teammate.
    expect(unoActiveTeammates(order, hands, ['a'], 'a')).toEqual(['c'])
    // once c also leaves, that team has no active member left.
    expect(unoActiveTeammates(order, hands, ['a', 'c'], 'a')).toEqual([])
  })
})

describe('resolveMultiPlayAdvance', () => {
  const c = (kind: UnoCard['kind'], color: UnoColor = 'red', value?: number) => card({ color, kind, value })

  it('plain multi (no action): advances one seat past no skips', () => {
    const r = resolveMultiPlayAdvance([c('number', 'red', 3), c('number', 'red', 3)], session({ direction: 1 }), 4)
    expect(r).toEqual({ direction: 1, penalty: 0, skipsBefore: 0, skipsAfter: 0 })
  })

  it('+2 then Skip: penalty targets the immediate next player, skip trails after it', () => {
    // Drawer sits 1 + skipsBefore ahead (the immediate next); skipsAfter pushes the turn onward.
    const r = resolveMultiPlayAdvance([c('draw2'), c('skip')], session({ direction: 1 }), 3)
    expect(r).toEqual({ direction: 1, penalty: 2, skipsBefore: 0, skipsAfter: 1 })
  })

  it('Skip then +2: the skip lands before the draw, so the penalty targets the player after it', () => {
    const r = resolveMultiPlayAdvance([c('skip'), c('draw2')], session({ direction: 1 }), 3)
    expect(r).toEqual({ direction: 1, penalty: 2, skipsBefore: 1, skipsAfter: 0 })
  })

  it('stacked Draw Twos accumulate onto one drawer', () => {
    const r = resolveMultiPlayAdvance([c('draw2'), c('draw2')], session({ direction: 1 }), 3)
    expect(r).toEqual({ direction: 1, penalty: 4, skipsBefore: 0, skipsAfter: 0 })
  })

  it('reverse flips direction with 3+ players (no extra skip)', () => {
    const r = resolveMultiPlayAdvance([c('number', 'red', 5), c('reverse')], session({ direction: 1 }), 4)
    expect(r).toEqual({ direction: -1, penalty: 0, skipsBefore: 0, skipsAfter: 0 })
  })

  it('reverse acts as a skip with two players (no draw2 → counted as a leading skip)', () => {
    const r = resolveMultiPlayAdvance([c('number', 'red', 5), c('reverse')], session({ direction: 1 }), 2)
    expect(r).toEqual({ direction: 1, penalty: 0, skipsBefore: 1, skipsAfter: 0 })
  })

  it('reverse + skip: direction flips, then one player is skipped (order-independent, no draw2)', () => {
    const flipSkip = resolveMultiPlayAdvance([c('reverse'), c('skip')], session({ direction: 1 }), 4)
    const skipFlip = resolveMultiPlayAdvance([c('skip'), c('reverse')], session({ direction: 1 }), 4)
    expect(flipSkip).toEqual({ direction: -1, penalty: 0, skipsBefore: 1, skipsAfter: 0 })
    expect(skipFlip).toEqual(flipSkip) // resolved in the final direction, so order does not matter here
  })

  it('+2 + reverse: penalty applies in the final direction (order-independent w.r.t. the reverse)', () => {
    const draw2First = resolveMultiPlayAdvance([c('draw2'), c('reverse')], session({ direction: 1 }), 4)
    const revFirst = resolveMultiPlayAdvance([c('reverse'), c('draw2')], session({ direction: 1 }), 4)
    expect(draw2First).toEqual({ direction: -1, penalty: 2, skipsBefore: 0, skipsAfter: 0 })
    expect(revFirst).toEqual(draw2First)
  })

  it('top card wins: a number laid on a +2 cancels the draw (only the visible top counts)', () => {
    // [+2, 5]: the 5 settles the pile — next player just matches the 5, no draw.
    expect(resolveMultiPlayAdvance([c('draw2'), c('number', 'red', 5)], session({ direction: 1 }), 3)).toEqual({
      direction: 1,
      penalty: 0,
      skipsBefore: 0,
      skipsAfter: 0,
    })
    // [5, +2]: the +2 is on top — next player draws 2.
    expect(resolveMultiPlayAdvance([c('number', 'red', 5), c('draw2')], session({ direction: 1 }), 3)).toEqual({
      direction: 1,
      penalty: 2,
      skipsBefore: 0,
      skipsAfter: 0,
    })
  })

  it('top card wins: only the action run after the last number counts', () => {
    // [+2, 5, skip]: the 5 cancels the +2; only the trailing skip survives.
    expect(
      resolveMultiPlayAdvance([c('draw2'), c('number', 'red', 5), c('skip')], session({ direction: 1 }), 4)
    ).toEqual({ direction: 1, penalty: 0, skipsBefore: 1, skipsAfter: 0 })
    // [reverse, 5]: the number also cancels a covered reverse (direction stays put).
    expect(resolveMultiPlayAdvance([c('reverse'), c('number', 'red', 5)], session({ direction: 1 }), 4)).toEqual({
      direction: 1,
      penalty: 0,
      skipsBefore: 0,
      skipsAfter: 0,
    })
  })
})

describe('multiSetGroupingOk', () => {
  const reds = [
    card({ id: 'r1', color: 'red', kind: 'number', value: 1 }),
    card({ id: 'r5', color: 'red', kind: 'skip' }),
  ]
  const fives = [
    card({ id: 'r5n', color: 'red', kind: 'number', value: 5 }),
    card({ id: 'b5n', color: 'blue', kind: 'number', value: 5 }),
  ]
  const mixed = [
    card({ id: 'r1', color: 'red', kind: 'number', value: 1 }),
    card({ id: 'b7', color: 'blue', kind: 'number', value: 7 }),
  ]

  it('same_color: only all-one-colour sets', () => {
    expect(multiSetGroupingOk(reds, 'same_color')).toBe(true)
    expect(multiSetGroupingOk(fives, 'same_color')).toBe(false)
  })
  it('same_number: only all-one-number sets', () => {
    expect(multiSetGroupingOk(fives, 'same_number')).toBe(true)
    expect(multiSetGroupingOk(reds, 'same_number')).toBe(false)
  })
  it('same_color_or_number: either', () => {
    expect(multiSetGroupingOk(reds, 'same_color_or_number')).toBe(true)
    expect(multiSetGroupingOk(fives, 'same_color_or_number')).toBe(true)
    expect(multiSetGroupingOk(mixed, 'same_color_or_number')).toBe(false)
  })
  it('rejects off, singletons, and wilds', () => {
    expect(multiSetGroupingOk(reds, 'off')).toBe(false)
    expect(multiSetGroupingOk([reds[0]!], 'same_color')).toBe(false)
    expect(multiSetGroupingOk([reds[0]!, card({ color: 'wild', kind: 'wild' })], 'same_color')).toBe(false)
  })
})

describe('validateMultiSet', () => {
  const top = card({ color: 'red', kind: 'number', value: 3 })
  const s = session({ top_card: top })

  it('accepts a legal same-colour dump whose first card matches the top', () => {
    const set = [
      card({ id: 'r3', color: 'red', kind: 'number', value: 3 }), // matches top
      card({ id: 'rs', color: 'red', kind: 'skip' }),
    ]
    expect(validateMultiSet(set, s, 'same_color')).toBeNull()
  })
  it('rejects when the first card does not match the top', () => {
    const set = [
      card({ id: 'g4', color: 'green', kind: 'number', value: 4 }),
      card({ id: 'g8', color: 'green', kind: 'number', value: 8 }),
    ]
    expect(validateMultiSet(set, s, 'same_color')).toMatch(/first card/i)
  })
  it('rejects a set that violates the grouping', () => {
    const set = [
      card({ id: 'r3', color: 'red', kind: 'number', value: 3 }),
      card({ id: 'b8', color: 'blue', kind: 'number', value: 8 }),
    ]
    expect(validateMultiSet(set, s, 'same_color')).toMatch(/colour/i)
  })
  it('rejects while a draw penalty is pending', () => {
    const set = [
      card({ id: 'r3', color: 'red', kind: 'number', value: 3 }),
      card({ id: 'r5', color: 'red', kind: 'number', value: 5 }),
    ]
    expect(validateMultiSet(set, session({ top_card: top, draw_penalty: 2 }), 'same_color')).toMatch(/penalty/i)
  })
})

describe('parseUnoRules', () => {
  it('defaults: challenge on, penalty 2, wd4 penalty 6, 0-7 off, stacking off', () => {
    const r = parseUnoRules(null)
    expect(r).toEqual({
      wd4Challenge: true,
      unoPenalty: 2,
      wd4ChallengePenalty: 6,
      zeroSeven: false,
      stacking: false,
      multiPlay: 'off',
      teamMode: false,
    })
  })
  it('reads host overrides', () => {
    const r = parseUnoRules({
      uno_wd4_challenge: false,
      uno_uno_penalty: 4,
      uno_wd4_challenge_penalty: 6,
      uno_zero_seven: true,
      uno_stacking: true,
      uno_multi_play_mode: 'same_color_or_number',
      uno_team_mode: true,
    })
    expect(r).toEqual({
      wd4Challenge: false,
      unoPenalty: 4,
      wd4ChallengePenalty: 6,
      zeroSeven: true,
      stacking: true,
      multiPlay: 'same_color_or_number',
      teamMode: true,
    })
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
