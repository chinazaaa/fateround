import { describe, it, expect } from 'vitest'
import {
  buildNoMercyDeck,
  buildUnoDeck,
  canPlayCard,
  isJumpInMatch,
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
  processUnoChallenge,
  processUnoPlay,
  processUnoChoose,
} from './uno'
import type { SupabaseClient } from '@supabase/supabase-js'
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

describe('buildNoMercyDeck', () => {
  const deck = buildNoMercyDeck()

  it('has exactly 168 cards (the documented HS total)', () => {
    expect(deck.length).toBe(168)
  })

  it('drops the plain Wild — Colour Roulette replaces its "pick a colour" surface', () => {
    expect(deck.filter((c) => c.kind === 'wild').length).toBe(0)
  })

  it('carries Skip + Skip Everyone (classic single-skip + HS everyone-skip)', () => {
    // 2 Skips per colour = 8 from the base deck; 2 Skip Everyone per colour = 8 added.
    expect(deck.filter((c) => c.kind === 'skip').length).toBe(8)
    expect(deck.filter((c) => c.kind === 'skip_everyone').length).toBe(8)
  })

  it('has 12 each of Wild Draw 4, Reverse Draw 4, Draw 6, Draw 10', () => {
    expect(deck.filter((c) => c.kind === 'wild_draw4').length).toBe(4) // base deck only
    expect(deck.filter((c) => c.kind === 'wild_reverse_draw4').length).toBe(12)
    expect(deck.filter((c) => c.kind === 'draw6').length).toBe(12)
    expect(deck.filter((c) => c.kind === 'draw10').length).toBe(12)
  })

  it('has 16 Colour Roulettes (12 + 4 backfill for the removed plain Wilds)', () => {
    expect(deck.filter((c) => c.kind === 'wild_color_roulette').length).toBe(16)
  })

  it('has 4 Discard All (1 per colour)', () => {
    expect(deck.filter((c) => c.kind === 'discard_all').length).toBe(4)
  })

  it('has unique card ids', () => {
    expect(new Set(deck.map((c) => c.id)).size).toBe(168)
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

  // High Stakes / No Mercy cross-kind stacking. Every Draw card of equal-or-higher value can
  // chain onto the pending penalty; smaller-value Draws + all non-Draw cards can't play.
  describe('cross-kind stacking (High Stakes)', () => {
    it('pending +4 accepts +4, +4 Reverse, +6, +10 but blocks non-Draw cards', () => {
      const s = session({
        top_card: card({ color: 'wild', kind: 'wild_draw4' }),
        required_color: 'red',
        draw_penalty: 4,
        draw_penalty_kind: 'wild_draw4',
      })
      expect(canPlayCard(card({ color: 'wild', kind: 'wild_draw4' }), s)).toBe(true)
      expect(canPlayCard(card({ color: 'wild', kind: 'wild_reverse_draw4' }), s)).toBe(true)
      expect(canPlayCard(card({ color: 'wild', kind: 'draw6' }), s)).toBe(true)
      expect(canPlayCard(card({ color: 'wild', kind: 'draw10' }), s)).toBe(true)
      // Non-Draw cards must draw the pending penalty.
      expect(canPlayCard(card({ color: 'red', kind: 'number', value: 5 }), s)).toBe(false)
      expect(canPlayCard(card({ color: 'red', kind: 'skip' }), s)).toBe(false)
      expect(canPlayCard(card({ color: 'wild', kind: 'wild' }), s)).toBe(false)
    })

    it('pending +10 accepts only +10 (nothing higher exists)', () => {
      const s = session({
        top_card: card({ color: 'wild', kind: 'draw10' }),
        required_color: 'blue',
        draw_penalty: 10,
        draw_penalty_kind: 'draw10',
      })
      expect(canPlayCard(card({ color: 'wild', kind: 'draw10' }), s)).toBe(true)
      // Everything with a smaller value must draw.
      expect(canPlayCard(card({ color: 'wild', kind: 'draw6' }), s)).toBe(false)
      expect(canPlayCard(card({ color: 'wild', kind: 'wild_reverse_draw4' }), s)).toBe(false)
      expect(canPlayCard(card({ color: 'wild', kind: 'wild_draw4' }), s)).toBe(false)
      expect(canPlayCard(card({ color: 'blue', kind: 'draw2' }), s)).toBe(false)
      expect(canPlayCard(card({ color: 'blue', kind: 'number', value: 5 }), s)).toBe(false)
    })

    it('pending +6 accepts +6 and +10 but blocks +4 / +4 Reverse / smaller draws', () => {
      const s = session({
        top_card: card({ color: 'wild', kind: 'draw6' }),
        required_color: 'yellow',
        draw_penalty: 6,
        draw_penalty_kind: 'draw6',
      })
      expect(canPlayCard(card({ color: 'wild', kind: 'draw6' }), s)).toBe(true)
      expect(canPlayCard(card({ color: 'wild', kind: 'draw10' }), s)).toBe(true)
      expect(canPlayCard(card({ color: 'wild', kind: 'wild_reverse_draw4' }), s)).toBe(false)
      expect(canPlayCard(card({ color: 'wild', kind: 'wild_draw4' }), s)).toBe(false)
      expect(canPlayCard(card({ color: 'yellow', kind: 'draw2' }), s)).toBe(false)
    })
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

describe('isJumpInMatch', () => {
  it('matches an exact same-colour, same-number card', () => {
    const top = card({ id: 't', color: 'red', kind: 'number', value: 7 })
    expect(isJumpInMatch(card({ id: 'a', color: 'red', kind: 'number', value: 7 }), top)).toBe(true)
  })
  it('rejects a same-number card of another colour, and a same-colour card of another number', () => {
    const top = card({ id: 't', color: 'red', kind: 'number', value: 7 })
    expect(isJumpInMatch(card({ id: 'b', color: 'blue', kind: 'number', value: 7 }), top)).toBe(false)
    expect(isJumpInMatch(card({ id: 'c', color: 'red', kind: 'number', value: 3 }), top)).toBe(false)
  })
  it('matches an exact same-colour action card (Red Skip on Red Skip) but not a mismatched one', () => {
    const top = card({ id: 't', color: 'red', kind: 'skip' })
    expect(isJumpInMatch(card({ id: 'd', color: 'red', kind: 'skip' }), top)).toBe(true)
    expect(isJumpInMatch(card({ id: 'e', color: 'blue', kind: 'skip' }), top)).toBe(false)
    expect(isJumpInMatch(card({ id: 'f', color: 'red', kind: 'reverse' }), top)).toBe(false)
  })
  it('never matches wilds (as the played card or the top card), and never a null top', () => {
    const top = card({ id: 't', color: 'red', kind: 'number', value: 7 })
    expect(isJumpInMatch(card({ id: 'w', color: 'wild', kind: 'wild' }), top)).toBe(false)
    const wildTop = card({ id: 'wt', color: 'wild', kind: 'wild_draw4' })
    expect(isJumpInMatch(card({ id: 'g', color: 'red', kind: 'number', value: 7 }), wildTop)).toBe(false)
    expect(isJumpInMatch(card({ id: 'h', color: 'red', kind: 'number', value: 7 }), null)).toBe(false)
  })
})

describe('parseUnoRules', () => {
  it('defaults: challenge on, penalty 2, wd4 penalty 6, 0-7 off, stacking off', () => {
    const r = parseUnoRules(null)
    expect(r).toEqual({
      mode: 'classic',
      wd4Challenge: true,
      unoPenalty: 2,
      wd4ChallengePenalty: 6,
      zeroSeven: false,
      stacking: false,
      multiPlay: 'off',
      teamMode: false,
      jumpIn: false,
      noMercyWin: 'first_out',
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
      uno_jump_in: true,
    })
    expect(r).toEqual({
      mode: 'classic',
      wd4Challenge: false,
      unoPenalty: 4,
      wd4ChallengePenalty: 6,
      zeroSeven: true,
      stacking: true,
      multiPlay: 'same_color_or_number',
      teamMode: true,
      jumpIn: true,
      noMercyWin: 'first_out',
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

// ── processUnoChallenge (integration, in-memory Supabase mock) ────────────────────
// A minimal mock that supports the exact query chains uno.ts uses: from().select().eq().
// maybeSingle() / .order() for reads, and update().eq()...select()/await for writes. Rows
// are mutated in place so we can assert final hands + turn after the handler runs.
type Row = Record<string, unknown>
function applyFilters(rows: Row[], filters: [string, unknown][]): Row[] {
  return rows.filter((r) => filters.every(([c, v]) => r[c] === v))
}
function makeSupabase(tables: Record<string, Row[]>): SupabaseClient {
  const api = {
    from(table: string) {
      const filters: [string, unknown][] = []
      let updatePatch: Row | null = null
      const exec = () => {
        const matched = applyFilters(tables[table] ?? [], filters)
        if (updatePatch) {
          for (const r of matched) Object.assign(r, updatePatch)
          return { data: matched.map((r) => ({ ...r })), error: null }
        }
        return { data: matched, error: null }
      }
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (c: string, v: unknown) => {
          filters.push([c, v])
          return builder
        },
        order: () => Promise.resolve(exec()),
        maybeSingle: () => {
          const { data, error } = exec()
          return Promise.resolve({ data: data[0] ?? null, error })
        },
        update: (patch: Row) => {
          updatePatch = patch
          return builder
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(exec()).then(resolve, reject),
      }
      return builder
    },
  }
  return api as unknown as SupabaseClient
}

function handRow(playerId: string, cards: UnoCard[], order: number): UnoPlayerHand {
  return { id: `h-${playerId}`, game_id: 'G', player_id: playerId, cards, player_order: order, created_at: '' }
}

// A + B + C, A has just played a Wild Draw Four over RED and named BLUE; B (index 1) is in the
// challenge window facing a Draw 4. `aHand` decides guilt: holding a red card = a caught bluff.
function challengeWorld(aHand: UnoCard[], bHand: UnoCard[]) {
  const drawPile: UnoCard[] = Array.from({ length: 10 }, (_, i) =>
    card({ id: `d${i}`, color: 'green', kind: 'number', value: (i % 9) + 1 })
  )
  const sessionRow: Row = {
    ...session({
      turn_order: ['A', 'B', 'C'],
      current_turn_index: 1,
      direction: 1,
      phase: 'challenge_window',
      draw_pile: drawPile,
      discard_pile: [],
      top_card: card({ color: 'wild', kind: 'wild_draw4' }),
      required_color: 'blue',
      draw_penalty: 4,
      challenge_prev_color: 'red',
      wd4_player_id: 'A',
      updated_at: 't0',
    }),
  }
  const tables: Record<string, Row[]> = {
    uno_sessions: [sessionRow],
    uno_player_hands: [
      handRow('A', aHand, 0),
      handRow('B', bHand, 1),
      handRow('C', [card({ color: 'yellow', kind: 'number', value: 1 })], 2),
    ] as unknown as Row[],
    games: [
      {
        id: 'G',
        timer_seconds: 0,
        game_duration_seconds: 0,
        session_started_at: null,
        uno_wd4_challenge: true,
        uno_uno_penalty: 2,
        uno_wd4_challenge_penalty: 6,
        uno_zero_seven: false,
        uno_stacking: false,
        uno_multi_play_mode: 'off',
        uno_team_mode: false,
      },
    ],
    players: [
      { id: 'A', name: 'Ann' },
      { id: 'B', name: 'Bob' },
      { id: 'C', name: 'Cara' },
    ],
  }
  return { tables, supabase: makeSupabase(tables) }
}
const handOf = (tables: Record<string, Row[]>, id: string) =>
  tables.uno_player_hands.find((h) => h.player_id === id)!.cards as UnoCard[]
const sess = (tables: Record<string, Row[]>) => tables.uno_sessions[0] as unknown as UnoSession

describe('processUnoChallenge (turn + hands)', () => {
  it('challenge SUCCEEDS (bluff caught): WD4 player draws 4, challenger keeps the turn', async () => {
    // A illegally held a red card → guilty.
    const { tables, supabase } = challengeWorld(
      [card({ id: 'r5', color: 'red', kind: 'number', value: 5 })],
      [
        card({ id: 'b2', color: 'blue', kind: 'number', value: 2 }),
        card({ id: 'g3', color: 'green', kind: 'number', value: 3 }),
      ]
    )
    const res = await processUnoChallenge(supabase, 'G', 'B', true)
    expect(res.error).toBeUndefined()
    expect(handOf(tables, 'A')).toHaveLength(5) // 1 + 4 drawn
    expect(handOf(tables, 'B')).toHaveLength(2) // challenger did NOT draw
    expect(sess(tables).current_turn_index).toBe(1) // stays on B — their turn to play
    expect(sess(tables).phase).toBe('playing')
    expect(sess(tables).draw_penalty).toBe(0)
    expect(sess(tables).required_color).toBe('blue') // B must match the named colour
  })

  it('challenge FAILS (not a bluff): challenger draws 6 and is skipped', async () => {
    // A held no red → innocent.
    const { tables, supabase } = challengeWorld(
      [card({ id: 'g5', color: 'green', kind: 'number', value: 5 })],
      [
        card({ id: 'b2', color: 'blue', kind: 'number', value: 2 }),
        card({ id: 'g3', color: 'green', kind: 'number', value: 3 }),
      ]
    )
    const res = await processUnoChallenge(supabase, 'G', 'B', true)
    expect(res.error).toBeUndefined()
    expect(handOf(tables, 'A')).toHaveLength(1) // unchanged
    expect(handOf(tables, 'B')).toHaveLength(8) // 2 + 6 drawn (4 + 2 penalty)
    expect(sess(tables).current_turn_index).toBe(2) // skipped past B to C
    expect(sess(tables).draw_penalty).toBe(0)
  })

  it('ACCEPT (no challenge): challenger draws 4 and is skipped', async () => {
    const { tables, supabase } = challengeWorld(
      [card({ id: 'r5', color: 'red', kind: 'number', value: 5 })],
      [card({ id: 'b2', color: 'blue', kind: 'number', value: 2 })]
    )
    const res = await processUnoChallenge(supabase, 'G', 'B', false)
    expect(res.error).toBeUndefined()
    expect(handOf(tables, 'A')).toHaveLength(1) // unchanged — accept never reveals
    expect(handOf(tables, 'B')).toHaveLength(5) // 1 + 4 drawn
    expect(sess(tables).current_turn_index).toBe(2) // skipped to C
  })

  it('only the wrong player may decide', async () => {
    const { supabase } = challengeWorld([card({ color: 'red', kind: 'number', value: 5 })], [])
    const res = await processUnoChallenge(supabase, 'G', 'C', true) // C is not the target
    expect(res.error).toBe('Not your decision')
  })

  it('color-only rule: a same-NUMBER card of another colour is NOT a bluff (challenge fails)', async () => {
    // A holds blue 5 + green 3 — no RED — even though blue 5 could match a red 5 by number.
    // Per UNO, only a colour match makes a WD4 illegal, so the challenge should FAIL.
    const { tables, supabase } = challengeWorld(
      [
        card({ id: 'b5', color: 'blue', kind: 'number', value: 5 }),
        card({ id: 'g3', color: 'green', kind: 'number', value: 3 }),
      ],
      [card({ id: 'y2', color: 'yellow', kind: 'number', value: 2 })]
    )
    const res = await processUnoChallenge(supabase, 'G', 'B', true)
    expect(res.error).toBeUndefined()
    expect(handOf(tables, 'A')).toHaveLength(2) // A did NOT draw — challenge failed
    expect(handOf(tables, 'B')).toHaveLength(7) // B drew 6 (1 + 6)
    expect(sess(tables).current_turn_index).toBe(2)
  })
})

// ── Match Up High Stakes: end-to-end stacking chain ─────────────────────────────
// The user reported: "if I play +4 or +4 Reverse and someone else plays 10 shouldn't
// the total be 14?" and "someone played +10 and I was able to play anything". Walk
// the full server-side flow to prove the answer is 14 and non-Draw plays are refused.
describe('High Stakes stacking (server flow)', () => {
  function highStakesWorld(aHand: UnoCard[], bHand: UnoCard[], cHand: UnoCard[]) {
    const drawPile: UnoCard[] = Array.from({ length: 40 }, (_, i) =>
      card({ id: `pool-${i}`, color: 'yellow', kind: 'number', value: (i % 9) as UnoCard['value'] })
    )
    const sessionRow: Row = {
      ...session({
        turn_order: ['A', 'B', 'C'],
        current_turn_index: 0,
        direction: 1,
        phase: 'playing',
        draw_pile: drawPile,
        discard_pile: [],
        top_card: card({ color: 'yellow', kind: 'number', value: 3 }),
        required_color: 'yellow',
        updated_at: 't0',
      }),
    }
    const tables: Record<string, Row[]> = {
      uno_sessions: [sessionRow],
      uno_player_hands: [handRow('A', aHand, 0), handRow('B', bHand, 1), handRow('C', cHand, 2)] as unknown as Row[],
      // uno_mode='no_mercy' — HS rules, stacking on, WD4 challenge off, Jump-In off.
      games: [
        {
          id: 'G',
          timer_seconds: 0,
          game_duration_seconds: 0,
          session_started_at: null,
          uno_wd4_challenge: false,
          uno_uno_penalty: 2,
          uno_wd4_challenge_penalty: 6,
          uno_zero_seven: true,
          uno_stacking: true,
          uno_multi_play_mode: 'off',
          uno_team_mode: false,
          uno_jump_in: false,
          uno_mode: 'no_mercy',
          uno_no_mercy_win: 'first_out',
        },
      ],
      players: [
        { id: 'A', name: 'Ann' },
        { id: 'B', name: 'Bob' },
        { id: 'C', name: 'Cara' },
      ],
    }
    return { tables, supabase: makeSupabase(tables) }
  }

  it('+4 → choose colour → +10 → choose colour → pending penalty is 14', async () => {
    const { tables, supabase } = highStakesWorld(
      // Each hand carries a filler so nobody goes out just by playing their action card
      // (an empty hand ends the round and short-circuits the stacking chain).
      [
        card({ id: 'plus4', color: 'wild', kind: 'wild_draw4' }),
        card({ id: 'y7', color: 'yellow', kind: 'number', value: 7 }),
      ],
      [
        card({ id: 'plus10', color: 'wild', kind: 'draw10' }),
        card({ id: 'g4', color: 'green', kind: 'number', value: 4 }),
      ],
      [card({ id: 'y1', color: 'yellow', kind: 'number', value: 1 })]
    )
    // A plays +4.
    let res = await processUnoPlay(supabase, 'G', 'A', 'plus4')
    expect(res.error).toBeUndefined()
    expect(sess(tables).phase).toBe('choose_color')
    expect(sess(tables).pending_wild).toBe('wild_draw4')

    // A picks red.
    res = await processUnoChoose(supabase, 'G', 'A', 'red')
    expect(res.error).toBeUndefined()
    // After choose_color for a lone +4, next player owes 4 with kind wild_draw4.
    expect(sess(tables).phase).toBe('playing')
    expect(sess(tables).current_turn_index).toBe(1)
    expect(sess(tables).draw_penalty).toBe(4)
    expect(sess(tables).draw_penalty_kind).toBe('wild_draw4')
    expect(sess(tables).required_color).toBe('red')

    // B stacks +10 on top of the pending +4.
    res = await processUnoPlay(supabase, 'G', 'B', 'plus10')
    expect(res.error).toBeUndefined()
    // Wild branch carries the pending 4 forward through choose_color.
    expect(sess(tables).phase).toBe('choose_color')
    expect(sess(tables).pending_wild).toBe('draw10')
    expect(sess(tables).draw_penalty).toBe(4)

    // B picks blue → accumulated should be 4 + 10 = 14, kind draw10, next player = C.
    res = await processUnoChoose(supabase, 'G', 'B', 'blue')
    expect(res.error).toBeUndefined()
    expect(sess(tables).phase).toBe('playing')
    expect(sess(tables).current_turn_index).toBe(2)
    expect(sess(tables).draw_penalty).toBe(14)
    expect(sess(tables).draw_penalty_kind).toBe('draw10')
    expect(sess(tables).required_color).toBe('blue')
  })

  it('non-Draw card played against a pending +10 penalty is rejected', async () => {
    // Same setup, but C tries to play a plain yellow 1 while +10 is pending on them.
    // First run the stacking chain to arm the +10 penalty on C.
    const { tables, supabase } = highStakesWorld(
      // Each hand carries a filler so nobody goes out just by playing their action card
      // (an empty hand ends the round and short-circuits the stacking chain).
      [
        card({ id: 'plus4', color: 'wild', kind: 'wild_draw4' }),
        card({ id: 'y7', color: 'yellow', kind: 'number', value: 7 }),
      ],
      [
        card({ id: 'plus10', color: 'wild', kind: 'draw10' }),
        card({ id: 'g4', color: 'green', kind: 'number', value: 4 }),
      ],
      [
        card({ id: 'y1', color: 'yellow', kind: 'number', value: 1 }),
        card({ id: 'b3', color: 'blue', kind: 'number', value: 3 }),
      ]
    )
    await processUnoPlay(supabase, 'G', 'A', 'plus4')
    await processUnoChoose(supabase, 'G', 'A', 'red')
    await processUnoPlay(supabase, 'G', 'B', 'plus10')
    await processUnoChoose(supabase, 'G', 'B', 'blue')
    // C's turn, draw_penalty=14 kind=draw10. A blue 3 would normally match the required
    // colour, but a non-Draw play must be refused while a penalty is pending.
    const res = await processUnoPlay(supabase, 'G', 'C', 'b3')
    expect(res.error).toBeTruthy()
    expect(res.error).toMatch(/Draw 14|Draw card of equal or higher/i)
    // The card is still in the hand — nothing persisted.
    expect(handOf(tables, 'C').some((c) => c.id === 'b3')).toBe(true)
    expect(sess(tables).draw_penalty).toBe(14)
  })
})
