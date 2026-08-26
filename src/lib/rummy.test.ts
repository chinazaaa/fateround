import { describe, it, expect } from 'vitest'
import {
  buildRummyDeck,
  buildRummyMelds,
  canGoOut,
  classifyMeld,
  dealRummy,
  drawFromDiscard,
  drawFromPile,
  isValidRun,
  isValidSet,
  maxMeldableCount,
  rummyCardPoints,
  rummyHandSize,
  rummyHandSum,
  rummyPlacementOrder,
} from './rummy'
import type { RummyCard, RummySuit } from '@/types'

const c = (suit: RummySuit, rank: number): RummyCard => ({ id: `${suit}-${rank}`, suit, rank })

describe('deck + deal', () => {
  it('builds a 52-card unique deck', () => {
    const deck = buildRummyDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(deck.map((x) => x.id)).size).toBe(52)
  })

  it.each([
    [2, 10],
    [3, 7],
    [4, 7],
    [5, 6],
    [6, 6],
  ])('%i players → %i cards each', (players, expected) => {
    expect(rummyHandSize(players)).toBe(expected)
  })

  it('deals correct hands + first discard + non-overlapping draw pile', () => {
    const turnOrder = ['a', 'b', 'c']
    const { hands, drawPile, discardPile } = dealRummy(turnOrder)
    expect(Object.keys(hands)).toEqual(turnOrder)
    for (const id of turnOrder) expect(hands[id]).toHaveLength(7)
    expect(discardPile).toHaveLength(1)
    const all = [...Object.values(hands).flat(), ...drawPile, ...discardPile]
    expect(all).toHaveLength(52)
    expect(new Set(all.map((x) => x.id)).size).toBe(52)
  })
})

describe('sets', () => {
  it('accepts 3 of a kind, all different suits', () => {
    expect(isValidSet([c('spades', 7), c('hearts', 7), c('diamonds', 7)])).toBe(true)
  })
  it('accepts 4 of a kind', () => {
    expect(isValidSet([c('spades', 7), c('hearts', 7), c('diamonds', 7), c('clubs', 7)])).toBe(true)
  })
  it('rejects 2 cards', () => {
    expect(isValidSet([c('spades', 7), c('hearts', 7)])).toBe(false)
  })
  it('rejects mixed ranks', () => {
    expect(isValidSet([c('spades', 7), c('hearts', 8), c('diamonds', 7)])).toBe(false)
  })
  it('rejects duplicate suit (impossible in one deck)', () => {
    expect(isValidSet([c('spades', 7), c('spades', 7), c('diamonds', 7)])).toBe(false)
  })
})

describe('runs', () => {
  it('accepts 3 consecutive same suit', () => {
    expect(isValidRun([c('clubs', 4), c('clubs', 5), c('clubs', 6)])).toBe(true)
  })
  it('accepts unsorted input', () => {
    expect(isValidRun([c('clubs', 6), c('clubs', 4), c('clubs', 5)])).toBe(true)
  })
  it('accepts A-2-3 (ace low)', () => {
    expect(isValidRun([c('hearts', 1), c('hearts', 2), c('hearts', 3)])).toBe(true)
  })
  it('rejects Q-K-A wrap', () => {
    expect(isValidRun([c('hearts', 12), c('hearts', 13), c('hearts', 1)])).toBe(false)
  })
  it('rejects mixed suit', () => {
    expect(isValidRun([c('clubs', 4), c('hearts', 5), c('clubs', 6)])).toBe(false)
  })
  it('rejects gap', () => {
    expect(isValidRun([c('clubs', 4), c('clubs', 6), c('clubs', 7)])).toBe(false)
  })
  it('rejects fewer than 3', () => {
    expect(isValidRun([c('clubs', 4), c('clubs', 5)])).toBe(false)
  })
})

describe('classifyMeld', () => {
  it('detects set vs run vs junk', () => {
    expect(classifyMeld([c('spades', 7), c('hearts', 7), c('diamonds', 7)])).toBe('set')
    expect(classifyMeld([c('clubs', 4), c('clubs', 5), c('clubs', 6)])).toBe('run')
    expect(classifyMeld([c('clubs', 4), c('hearts', 5), c('diamonds', 6)])).toBeNull()
  })
})

describe('canGoOut / buildRummyMelds', () => {
  const hand = [
    c('spades', 7),
    c('hearts', 7),
    c('diamonds', 7),
    c('clubs', 4),
    c('clubs', 5),
    c('clubs', 6),
    c('spades', 10),
  ]

  it('accepts all-cards-meld with a discard', () => {
    const ok = canGoOut(
      hand,
      [
        [c('spades', 7), c('hearts', 7), c('diamonds', 7)],
        [c('clubs', 4), c('clubs', 5), c('clubs', 6)],
      ],
      { discard: c('spades', 10) }
    )
    expect(ok).toBe(true)
  })

  it('accepts all-cards-meld with no discard (rummy)', () => {
    const bigHand = hand.slice(0, 6)
    expect(
      canGoOut(bigHand, [
        [c('spades', 7), c('hearts', 7), c('diamonds', 7)],
        [c('clubs', 4), c('clubs', 5), c('clubs', 6)],
      ])
    ).toBe(true)
  })

  it('rejects when a card is left over', () => {
    expect(
      canGoOut(hand, [
        [c('spades', 7), c('hearts', 7), c('diamonds', 7)],
        [c('clubs', 4), c('clubs', 5), c('clubs', 6)],
      ])
    ).toBe(false)
  })

  it('rejects reusing a card in two melds', () => {
    const bad = [
      [c('spades', 7), c('hearts', 7), c('diamonds', 7)],
      [c('spades', 7), c('clubs', 5), c('clubs', 6)],
    ]
    expect(canGoOut(hand, bad, { discard: c('spades', 10) })).toBe(false)
  })

  it('rejects melding a card not in hand', () => {
    const bad = [
      [c('spades', 7), c('hearts', 7), c('clubs', 7)],
      [c('clubs', 4), c('clubs', 5), c('clubs', 6)],
    ]
    expect(canGoOut(hand, bad, { discard: c('spades', 10) })).toBe(false)
  })

  it('buildRummyMelds returns typed melds on success and null on failure', () => {
    const good = buildRummyMelds(
      hand,
      [
        [c('spades', 7), c('hearts', 7), c('diamonds', 7)],
        [c('clubs', 4), c('clubs', 5), c('clubs', 6)],
      ],
      { discard: c('spades', 10) }
    )
    expect(good).not.toBeNull()
    expect(good!.map((m) => m.kind)).toEqual(['set', 'run'])
    expect(buildRummyMelds(hand, [[c('spades', 7)]])).toBeNull()
  })
})

describe('scoring', () => {
  it('face cards are 10, ace is 1, numerics are face value', () => {
    expect(rummyCardPoints(c('hearts', 1))).toBe(1)
    expect(rummyCardPoints(c('hearts', 5))).toBe(5)
    expect(rummyCardPoints(c('hearts', 10))).toBe(10)
    expect(rummyCardPoints(c('hearts', 11))).toBe(10)
    expect(rummyCardPoints(c('hearts', 13))).toBe(10)
  })

  it('rummyHandSum totals deadwood', () => {
    expect(rummyHandSum([c('hearts', 1), c('spades', 11), c('clubs', 5)])).toBe(16)
  })
})

describe('maxMeldableCount', () => {
  it('is 0 for hands too short to meld', () => {
    expect(maxMeldableCount([])).toBe(0)
    expect(maxMeldableCount([c('hearts', 5), c('spades', 5)])).toBe(0)
  })

  it('is the full hand when every card lays down', () => {
    const hand = [c('spades', 7), c('hearts', 7), c('diamonds', 7), c('clubs', 4), c('clubs', 5), c('clubs', 6)]
    expect(maxMeldableCount(hand)).toBe(6)
  })

  it('ignores stray deadwood', () => {
    const hand = [
      c('spades', 7),
      c('hearts', 7),
      c('diamonds', 7),
      c('clubs', 4),
      c('clubs', 5),
      c('clubs', 6),
      c('spades', 10), // deadwood — 5♣6♣7♠ never both use 7♠ / 6♣ / 5♣ optimally
      c('hearts', 13),
    ]
    expect(maxMeldableCount(hand)).toBe(6)
  })

  it('resolves overlap by choosing one meld — best is 3, not both', () => {
    // Both 5♣6♣7♣ (run) and 7♠7♥7♣ (set) use 7♣, so at most one can be melded.
    const hand = [c('spades', 7), c('hearts', 7), c('clubs', 7), c('clubs', 5), c('clubs', 6)]
    expect(maxMeldableCount(hand)).toBe(3)
  })
})

describe('placement order', () => {
  it('declared winner first, then closest-to-going-out, then lower deadwood', () => {
    const hands = [
      { player_id: 'w', cards: [] },
      // 'a' can meld 3 cards (7-7-7)
      { player_id: 'a', cards: [c('spades', 7), c('hearts', 7), c('diamonds', 7)] },
      // 'b' can meld none, 5 pts of deadwood
      { player_id: 'b', cards: [c('hearts', 5)] },
      // 'c' can meld none, 12 pts of deadwood
      { player_id: 'c', cards: [c('hearts', 5), c('hearts', 7)] },
    ]
    expect(rummyPlacementOrder(hands, ['w', 'a', 'b', 'c'], 'w')).toEqual(['w', 'a', 'b', 'c'])
  })

  it('no declared winner (time out) ranks by closest-to-going-out', () => {
    const hands = [
      // 'a' can meld all 3 of a run
      { player_id: 'a', cards: [c('clubs', 4), c('clubs', 5), c('clubs', 6)] },
      // 'b' can meld nothing (only 1 card)
      { player_id: 'b', cards: [c('hearts', 2)] },
    ]
    expect(rummyPlacementOrder(hands, ['a', 'b'], null)).toEqual(['a', 'b'])
  })
})

describe('draw + discard helpers', () => {
  it('drawFromPile pops top', () => {
    const pile = [c('hearts', 3), c('hearts', 4)]
    const r = drawFromPile(pile, [])
    expect(r.card).toEqual(c('hearts', 3))
    expect(r.drawPile).toEqual([c('hearts', 4)])
    expect(r.reshuffled).toBe(false)
  })

  it('drawFromPile rebuilds from discard when empty', () => {
    const discard = [c('hearts', 3), c('hearts', 4), c('hearts', 5)] // top = 5♥
    const r = drawFromPile([], discard)
    expect(r.card).not.toBeNull()
    expect(r.reshuffled).toBe(true)
    expect(r.discardPile).toEqual([c('hearts', 5)]) // top preserved
    expect(r.drawPile.length + 1).toBe(2)
  })

  it('drawFromPile returns null when both piles are empty enough', () => {
    expect(drawFromPile([], [c('hearts', 3)]).card).toBeNull()
  })

  it('drawFromDiscard takes the top', () => {
    const r = drawFromDiscard([c('clubs', 2), c('clubs', 3)])
    expect(r.card).toEqual(c('clubs', 3))
    expect(r.discardPile).toEqual([c('clubs', 2)])
  })
})
