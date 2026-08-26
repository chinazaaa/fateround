import { describe, it, expect } from 'vitest'
import type { GoFishCard, GoFishPlayerHand, GoFishRank, GoFishSession } from '@/types'
import {
  askableRanks,
  buildGoFishDeck,
  buildGoFishStandings,
  clampGofishGameDuration,
  countRanks,
  currentPlayerId,
  dealGoFish,
  describeGoFishEvent,
  extractBooks,
  formatGofishGameDuration,
  GOFISH_DEFAULT_MAX_PLAYERS,
  GOFISH_GAME_DURATION_OPTIONS,
  GOFISH_MAX_PLAYERS,
  GOFISH_MIN_PLAYERS,
  GOFISH_RANKS,
  gofishDealCount,
  gofishGameSessionExpired,
  gofishTurnDeadline,
  isGameOver,
  nextActiveTurnIndex,
  pickAutoAsk,
  playerHasRank,
  resolveGoFishAsk,
  resolveWinner,
  shuffleDeck,
} from './gofish'

function card(rank: GoFishRank, suit: 'spades' | 'hearts' | 'diamonds' | 'clubs' = 'spades'): GoFishCard {
  return { id: `${suit}-${rank}`, suit, rank }
}

function hand(playerId: string, cards: GoFishCard[], books: GoFishRank[] = []): GoFishPlayerHand {
  return {
    id: `h-${playerId}`,
    game_id: 'g1',
    player_id: playerId,
    cards,
    books,
    player_order: 0,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function baseSession(overrides: Partial<GoFishSession> = {}): GoFishSession {
  return {
    id: 's1',
    game_id: 'g1',
    turn_order: ['a', 'b'],
    current_turn_index: 0,
    phase: 'playing',
    ocean: [],
    ocean_count: 0,
    event_log: [],
    status_message: null,
    winner_player_id: null,
    finish_order: [],
    turn_deadline_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('deck construction', () => {
  it('builds a 52-card deck with 4 of every rank', () => {
    const deck = buildGoFishDeck()
    expect(deck).toHaveLength(52)
    const counts = countRanks(deck)
    for (const rank of GOFISH_RANKS) expect(counts.get(rank)).toBe(4)
    const ids = new Set(deck.map((c) => c.id))
    expect(ids.size).toBe(52)
  })

  it('shuffle preserves cards and is deterministic with a seeded rng', () => {
    const deck = buildGoFishDeck()
    let seed = 1
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    const a = shuffleDeck(deck, rng)
    seed = 1
    const b = shuffleDeck(deck, rng)
    expect(a).toEqual(b)
    expect(new Set(a.map((c) => c.id))).toEqual(new Set(deck.map((c) => c.id)))
  })
})

describe('player limits + deal count', () => {
  it('enforces documented bounds', () => {
    expect(GOFISH_MIN_PLAYERS).toBe(2)
    expect(GOFISH_MAX_PLAYERS).toBe(6)
    expect(GOFISH_DEFAULT_MAX_PLAYERS).toBeGreaterThanOrEqual(GOFISH_MIN_PLAYERS)
  })

  it('deals 7 for two players and 5 for 3+', () => {
    expect(gofishDealCount(2)).toBe(7)
    expect(gofishDealCount(3)).toBe(5)
    expect(gofishDealCount(6)).toBe(5)
  })

  it('dealGoFish splits the deck and keeps a well-formed ocean', () => {
    const deck = buildGoFishDeck()
    const { hands, ocean } = dealGoFish(['a', 'b', 'c'], deck)
    expect(hands.a).toHaveLength(5)
    expect(hands.b).toHaveLength(5)
    expect(hands.c).toHaveLength(5)
    expect(ocean).toHaveLength(52 - 15)
    // Every card is accounted for.
    const seen = new Set<string>()
    ;[...hands.a, ...hands.b, ...hands.c, ...ocean].forEach((c) => seen.add(c.id))
    expect(seen.size).toBe(52)
  })

  it('extracts a book if all four of a rank land in one initial hand', () => {
    // Craft a deck where player "a" ends up with all four 7s.
    const sevens = [card(7, 'spades'), card(7, 'hearts'), card(7, 'diamonds'), card(7, 'clubs')]
    const others = buildGoFishDeck().filter((c) => c.rank !== 7)
    // Round-robin deal for 2 players deals 7 cards to a, then 7 to b, etc.
    // With interleaving (a,b,a,b,...), place sevens on the a slots (positions 0,2,4,6).
    const deck: GoFishCard[] = []
    for (let i = 0; i < 14; i += 1) {
      if (i % 2 === 0) deck.push(sevens[i / 2])
      else deck.push(others.shift()!)
    }
    for (const c of others) deck.push(c)
    const { hands, initialBooks } = dealGoFish(['a', 'b'], deck)
    expect(initialBooks.a).toEqual([7])
    expect(hands.a.some((c) => c.rank === 7)).toBe(false)
  })
})

describe('helpers', () => {
  it('askableRanks returns unique sorted ranks the player holds', () => {
    expect(askableRanks([card(3), card(7), card(3), card(11)])).toEqual([3, 7, 11])
  })

  it('playerHasRank works', () => {
    expect(playerHasRank([card(3), card(7)], 7)).toBe(true)
    expect(playerHasRank([card(3), card(7)], 8)).toBe(false)
  })

  it('nextActiveTurnIndex skips inactive players and wraps', () => {
    const order = ['a', 'b', 'c']
    const active = new Set(['a', 'c'])
    expect(nextActiveTurnIndex(order, 0, (id) => active.has(id))).toBe(2)
    expect(nextActiveTurnIndex(order, 2, (id) => active.has(id))).toBe(0)
    // Nobody active — stays put.
    expect(nextActiveTurnIndex(order, 1, () => false)).toBe(1)
  })

  it('extractBooks pulls out only completed sets of 4', () => {
    const h = [card(3), card(3), card(3), card(3), card(9), card(9)]
    const { hand: kept, books } = extractBooks(h)
    expect(books).toEqual([3])
    expect(kept.map((c) => c.rank).sort()).toEqual([9, 9])
  })
})

describe('resolveGoFishAsk — hits', () => {
  it('hands over all cards of the asked rank and lets asker go again', () => {
    const session = baseSession({ turn_order: ['a', 'b'], current_turn_index: 0 })
    const hands = [
      hand('a', [card(7, 'spades'), card(7, 'hearts'), card(3, 'hearts')]),
      hand('b', [card(7, 'diamonds'), card(7, 'clubs'), card(9, 'spades')]),
    ]
    const result = resolveGoFishAsk({
      session,
      hands,
      fromPlayerId: 'a',
      targetPlayerId: 'b',
      rank: 7,
      now: '2026-01-01T00:00:01Z',
    })
    if (!result.ok) throw new Error(result.error)
    expect(result.hit).toBe(true)
    expect(result.sameTurn).toBe(true)
    expect(result.transferred).toHaveLength(2)
    const askerUpdate = result.handUpdates.find((u) => u.playerId === 'a')!
    // 4 sevens completes a book, so only the 3 of hearts remains and books gains 7.
    expect(askerUpdate.books).toEqual([7])
    expect(askerUpdate.cards.map((c) => c.rank)).toEqual([3])
    const targetUpdate = result.handUpdates.find((u) => u.playerId === 'b')!
    expect(targetUpdate.cards.map((c) => c.rank).sort()).toEqual([9])
    expect(result.session.current_turn_index).toBe(0)
    expect(result.session.event_log.map((e) => e.kind)).toEqual(['ask_hit', 'book'])
    expect(result.newBooks).toEqual([7])
  })
})

describe('resolveGoFishAsk — misses', () => {
  it('draws from the ocean and passes the turn on a miss without lucky draw', () => {
    const session = baseSession({
      turn_order: ['a', 'b'],
      current_turn_index: 0,
      ocean: [card(11, 'hearts')],
      ocean_count: 1,
    })
    const hands = [hand('a', [card(7, 'spades')]), hand('b', [card(3, 'hearts')])]
    const result = resolveGoFishAsk({
      session,
      hands,
      fromPlayerId: 'a',
      targetPlayerId: 'b',
      rank: 7,
      now: '2026-01-01T00:00:02Z',
    })
    if (!result.ok) throw new Error(result.error)
    expect(result.hit).toBe(false)
    expect(result.sameTurn).toBe(false)
    expect(result.transferred).toHaveLength(1)
    expect(result.session.current_turn_index).toBe(1)
    expect(result.session.ocean).toHaveLength(0)
    expect(result.session.event_log[0]).toMatchObject({ kind: 'ask_miss', drew: true, lucky_draw: false })
  })

  it('lucky draw of asked rank lets the asker go again', () => {
    const session = baseSession({
      turn_order: ['a', 'b'],
      current_turn_index: 0,
      ocean: [card(7, 'diamonds')],
      ocean_count: 1,
    })
    const hands = [hand('a', [card(7, 'spades')]), hand('b', [card(3, 'hearts')])]
    const result = resolveGoFishAsk({
      session,
      hands,
      fromPlayerId: 'a',
      targetPlayerId: 'b',
      rank: 7,
      now: '2026-01-01T00:00:03Z',
    })
    if (!result.ok) throw new Error(result.error)
    expect(result.sameTurn).toBe(true)
    expect(result.session.current_turn_index).toBe(0)
    expect(result.session.event_log[0]).toMatchObject({ kind: 'ask_miss', lucky_draw: true })
  })

  it('miss with empty ocean still passes the turn and records no draw', () => {
    const session = baseSession({
      turn_order: ['a', 'b'],
      current_turn_index: 0,
      ocean: [],
      ocean_count: 0,
    })
    const hands = [hand('a', [card(7, 'spades')]), hand('b', [card(3, 'hearts')])]
    const result = resolveGoFishAsk({
      session,
      hands,
      fromPlayerId: 'a',
      targetPlayerId: 'b',
      rank: 7,
      now: '2026-01-01T00:00:04Z',
    })
    if (!result.ok) throw new Error(result.error)
    expect(result.transferred).toHaveLength(0)
    expect(result.session.current_turn_index).toBe(1)
    expect(result.session.event_log[0]).toMatchObject({ kind: 'ask_miss', drew: false })
  })
})

describe('resolveGoFishAsk — validation', () => {
  const session = baseSession({ turn_order: ['a', 'b'], current_turn_index: 0 })
  const hands = [hand('a', [card(7)]), hand('b', [card(3)])]

  it('rejects when not your turn', () => {
    const r = resolveGoFishAsk({ session, hands, fromPlayerId: 'b', targetPlayerId: 'a', rank: 3, now: 'n' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('not_your_turn')
  })

  it('rejects asking yourself', () => {
    const r = resolveGoFishAsk({ session, hands, fromPlayerId: 'a', targetPlayerId: 'a', rank: 7, now: 'n' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('ask_self')
  })

  it('rejects asking for a rank the asker does not hold', () => {
    const r = resolveGoFishAsk({ session, hands, fromPlayerId: 'a', targetPlayerId: 'b', rank: 9, now: 'n' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('must_hold_rank')
  })

  it('rejects asking a target with no cards', () => {
    const r = resolveGoFishAsk({
      session,
      hands: [hand('a', [card(7)]), hand('b', [])],
      fromPlayerId: 'a',
      targetPlayerId: 'b',
      rank: 7,
      now: 'n',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('target_no_cards')
  })

  it('rejects when session is finished', () => {
    const r = resolveGoFishAsk({
      session: baseSession({ phase: 'finished' }),
      hands,
      fromPlayerId: 'a',
      targetPlayerId: 'b',
      rank: 7,
      now: 'n',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('game_finished')
  })
})

describe('empty-hand refill', () => {
  it('refills the asker up to 5 when their hand empties while the ocean has cards', () => {
    // Asker holds one 7; target holds one 7. After the transfer, asker still has the pair,
    // so instead: asker holds ONLY 7s that form no book — a single 7 transferred creates a
    // book of… no. Use the "target hits with all four" -> book -> empty hand -> refill flow.
    // Set up: asker has three 7s (from earlier plays), target has the fourth 7. After the hit,
    // asker completes the book and is empty; ocean should refill 5 cards.
    const ocean = [card(1, 'spades'), card(2, 'spades'), card(3, 'clubs'), card(4, 'clubs'), card(5, 'clubs'), card(6, 'clubs')]
    const session = baseSession({
      turn_order: ['a', 'b'],
      current_turn_index: 0,
      ocean,
      ocean_count: ocean.length,
    })
    const hands = [
      hand('a', [card(7, 'spades'), card(7, 'hearts'), card(7, 'diamonds')]),
      hand('b', [card(7, 'clubs'), card(9, 'hearts')]),
    ]
    const r = resolveGoFishAsk({ session, hands, fromPlayerId: 'a', targetPlayerId: 'b', rank: 7, now: 'n' })
    if (!r.ok) throw new Error(r.error)
    const askerUpdate = r.handUpdates.find((u) => u.playerId === 'a')!
    expect(askerUpdate.books).toEqual([7])
    // Asker refilled 5 from the 6-card ocean.
    expect(askerUpdate.cards).toHaveLength(5)
    expect(r.session.ocean).toHaveLength(1)
    expect(r.session.event_log.some((e) => e.kind === 'refill' && e.player_id === 'a')).toBe(true)
  })

  it('marks a player out_of_cards when hand empties and ocean is empty', () => {
    const session = baseSession({
      turn_order: ['a', 'b'],
      current_turn_index: 0,
      ocean: [],
      ocean_count: 0,
    })
    const hands = [
      hand('a', [card(7, 'spades'), card(7, 'hearts'), card(7, 'diamonds')]),
      hand('b', [card(7, 'clubs'), card(9, 'hearts')]),
    ]
    const r = resolveGoFishAsk({ session, hands, fromPlayerId: 'a', targetPlayerId: 'b', rank: 7, now: 'n' })
    if (!r.ok) throw new Error(r.error)
    const askerUpdate = r.handUpdates.find((u) => u.playerId === 'a')!
    expect(askerUpdate.cards).toHaveLength(0)
    expect(r.session.event_log.some((e) => e.kind === 'out_of_cards' && e.player_id === 'a')).toBe(true)
    expect(r.session.finish_order).toContain('a')
  })
})

describe('game over', () => {
  it('ends when all 13 books are claimed', () => {
    const hands: GoFishPlayerHand[] = [
      { ...hand('a', []), books: [1, 2, 3, 4, 5, 6, 7] },
      { ...hand('b', []), books: [8, 9, 10, 11, 12, 13] },
    ]
    expect(isGameOver({ hands, ocean: [] })).toBe(true)
  })

  it('does not end while the ocean still has cards', () => {
    const hands = [hand('a', []), hand('b', [])]
    expect(isGameOver({ hands, ocean: [card(1)] })).toBe(false)
  })

  it('resolveWinner picks the most books, tiebreak by fewest cards then id', () => {
    const hands: GoFishPlayerHand[] = [
      { ...hand('a', [card(1), card(2)]), books: [3, 4] },
      { ...hand('b', []), books: [5, 6] },
      { ...hand('c', [card(7)]), books: [8, 9, 10] },
    ]
    expect(resolveWinner(hands)).toBe('c')
  })

  it('tiebreak: same books → fewest remaining cards wins', () => {
    const hands: GoFishPlayerHand[] = [
      { ...hand('a', [card(1), card(2)]), books: [3, 4] },
      { ...hand('b', []), books: [5, 6] },
    ]
    expect(resolveWinner(hands)).toBe('b')
  })
})

describe('standings + logging', () => {
  it('buildGoFishStandings ranks by books, then fewest cards', () => {
    const hands: GoFishPlayerHand[] = [
      { ...hand('a', [card(1)]), books: [3] },
      { ...hand('b', []), books: [4, 5] },
      { ...hand('c', [card(7)]), books: [4] },
    ]
    const players = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]
    const standings = buildGoFishStandings(hands, players)
    expect(standings.map((s) => s.playerId)).toEqual(['b', 'a', 'c'])
    expect(standings[0].rank).toBe(1)
  })

  it('describeGoFishEvent renders human-readable log lines', () => {
    const nameOf = (id: string) => (id === 'a' ? 'Alice' : 'Bob')
    expect(
      describeGoFishEvent({ kind: 'ask_hit', from_id: 'a', target_id: 'b', rank: 7, count: 2, at: '' }, nameOf)
    ).toBe('Alice asked Bob for 7s — handed over 2.')
    expect(
      describeGoFishEvent(
        { kind: 'ask_miss', from_id: 'a', target_id: 'b', rank: 7, drew: true, lucky_draw: true, at: '' },
        nameOf
      )
    ).toContain('goes again')
    expect(describeGoFishEvent({ kind: 'book', player_id: 'a', rank: 12, at: '' }, nameOf)).toBe(
      'Alice completed a book of Queens.'
    )
  })
})

describe('timers', () => {
  it('gofishTurnDeadline returns null when no timer set', () => {
    expect(gofishTurnDeadline(0)).toBe(null)
  })

  it('gofishTurnDeadline returns an ISO string N seconds ahead', () => {
    const now = new Date('2026-05-01T12:00:00Z')
    expect(gofishTurnDeadline(45, now)).toBe('2026-05-01T12:00:45.000Z')
  })

  it('clampGofishGameDuration accepts only the documented options', () => {
    for (const opt of GOFISH_GAME_DURATION_OPTIONS) {
      expect(clampGofishGameDuration(opt)).toBe(opt)
    }
    expect(clampGofishGameDuration(37)).toBe(0)
    expect(clampGofishGameDuration('nope')).toBe(0)
  })

  it('formatGofishGameDuration renders no-limit / hours / minutes cases', () => {
    expect(formatGofishGameDuration(0)).toBe('No limit')
    expect(formatGofishGameDuration(3600)).toBe('1 hour')
    expect(formatGofishGameDuration(1800)).toBe('30 minutes')
  })

  it('gofishGameSessionExpired matches whot semantics: 0 duration never expires', () => {
    const now = new Date('2026-05-01T13:00:00Z')
    expect(gofishGameSessionExpired('2026-05-01T12:00:00Z', 0, now)).toBe(false)
    expect(gofishGameSessionExpired(null, 600, now)).toBe(false)
  })

  it('gofishGameSessionExpired flips at the deadline', () => {
    const start = '2026-05-01T12:00:00Z'
    expect(gofishGameSessionExpired(start, 600, new Date('2026-05-01T12:09:59Z'))).toBe(false)
    expect(gofishGameSessionExpired(start, 600, new Date('2026-05-01T12:10:00Z'))).toBe(true)
    expect(gofishGameSessionExpired(start, 600, new Date('2026-05-01T13:00:00Z'))).toBe(true)
  })
})

describe('pickAutoAsk', () => {
  it('returns null when the player has no cards', () => {
    expect(pickAutoAsk([], new Map([['b', 3]]))).toBeNull()
  })

  it('returns null when nobody else has cards', () => {
    expect(pickAutoAsk([card(7)], new Map([['b', 0]]))).toBeNull()
  })

  it('picks a rank the player holds and a target with cards', () => {
    const hand = [card(3), card(7)]
    const opponents = new Map([['b', 2], ['c', 0], ['d', 5]])
    // Deterministic rng — return 0 always.
    const pick = pickAutoAsk(hand, opponents, () => 0)
    expect(pick).not.toBeNull()
    expect([3, 7]).toContain(pick!.rank)
    expect(['b', 'd']).toContain(pick!.targetPlayerId)
    expect(pick!.targetPlayerId).not.toBe('c')
  })
})

describe('currentPlayerId', () => {
  it('reads through the session turn pointer', () => {
    expect(currentPlayerId(baseSession({ turn_order: ['a', 'b'], current_turn_index: 1 }))).toBe('b')
    expect(currentPlayerId(baseSession({ turn_order: [], current_turn_index: 0 }))).toBe(null)
  })
})
