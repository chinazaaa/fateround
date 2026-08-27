import { describe, expect, it } from 'vitest'
import { buildCrazyEightsStandings, crazyEightsPlacementOrder } from '@/lib/crazy-eights'
import { redactHands } from '@/lib/hand-redaction'
import type { CrazyEightsCard, CrazyEightsPlayerHand } from '@/types'

const card = (suit: CrazyEightsCard['suit'], rank: number): CrazyEightsCard => ({ id: `${suit}-${rank}`, suit, rank })

function hand(playerId: string, cards: CrazyEightsCard[], order: number): CrazyEightsPlayerHand {
  return {
    id: `h-${playerId}`,
    game_id: 'ABC123',
    player_id: playerId,
    cards,
    player_order: order,
    created_at: '2026-08-01T00:00:00Z',
  }
}

// a: 2 points, b: 9 points, c: still holding one card
const fullHands = [
  hand('a', [card('spades', 2)], 0),
  hand('b', [card('hearts', 9)], 1),
  hand('c', [card('clubs', 5)], 2),
]
const turnOrder = ['a', 'b', 'c']
const players = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
  { id: 'c', name: 'Cy' },
]

describe('crazyEightsPlacementOrder with full hands (unchanged)', () => {
  it('ranks by hand total, finishers first', () => {
    expect(crazyEightsPlacementOrder(fullHands, turnOrder, ['c'])).toEqual(['c', 'a', 'b'])
  })
})

describe('standings built from REDACTED hands', () => {
  // What a live (unfinished) game's client actually holds: own hand in full, everyone else's
  // as a count — /history/[code] on an unfinished game, or the beat before the post-finish
  // refetch lands.
  const redacted = redactHands(fullHands, 'a') as unknown as CrazyEightsPlayerHand[]

  it('never reports a hidden hand as 0 cards / 0 points — that is "out of cards"', () => {
    const standings = buildCrazyEightsStandings(redacted, players, turnOrder, [])
    const bo = standings.find((s) => s.playerId === 'b')!
    expect(bo.cardCount).toBe(1) // the count survives redaction
    expect(bo.handSum).toBeNull() // the points do not — and null, never 0
    expect(standings.every((s) => s.cardCount !== 0)).toBe(true)
  })

  it('does not let hidden players collapse onto the podium ahead of a scored one', () => {
    // Ada is the only visible hand, so she is the only rankable player: 1st.
    const standings = buildCrazyEightsStandings(redacted, players, turnOrder, [])
    expect(standings.map((s) => s.playerId)).toEqual(['a', 'b', 'c'])
    expect(standings[0]).toMatchObject({ playerId: 'a', cardCount: 1, handSum: 2, rank: 1 })
  })

  it('still trusts finish_order — that is public session state, not a redacted hand', () => {
    const standings = buildCrazyEightsStandings(redacted, players, turnOrder, ['c'])
    expect(standings[0]).toMatchObject({ playerId: 'c', cardCount: 0, handSum: 0, rank: 1 })
  })

  it('treats a redacted row with card_count 0 as genuinely empty', () => {
    const withEmpty = redactHands(
      [hand('a', [card('spades', 2)], 0), hand('b', [], 1)],
      'a'
    ) as unknown as CrazyEightsPlayerHand[]
    const standings = buildCrazyEightsStandings(withEmpty, players, ['a', 'b'], [])
    const bo = standings.find((s) => s.playerId === 'b')!
    expect(bo.cardCount).toBe(0)
    expect(bo.handSum).toBe(0)
  })

  it('reports "unknown" rather than zero when even the count is missing', () => {
    const countless = [{ ...hand('b', [], 1), cards: null, card_count: undefined }] as CrazyEightsPlayerHand[]
    const standings = buildCrazyEightsStandings(countless, players, ['b'], [])
    expect(standings[0]).toMatchObject({ playerId: 'b', cardCount: null, handSum: null })
  })
})
