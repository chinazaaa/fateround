import { describe, expect, it } from 'vitest'
import { redactHands } from '@/lib/hand-redaction'

const rows = [
  { id: 'h1', game_id: 'ABC123', player_id: 'me', cards: ['w1', 'w2', 'w3'], player_order: 0 },
  { id: 'h2', game_id: 'ABC123', player_id: 'them', cards: ['x1', 'x2'], player_order: 1 },
  { id: 'h3', game_id: 'ABC123', player_id: 'out', cards: [], player_order: 2 },
]

describe('redactHands', () => {
  it("returns the viewer's own cards in full", () => {
    const mine = redactHands(rows, 'me').find((h) => h.player_id === 'me')
    expect(mine?.cards).toEqual(['w1', 'w2', 'w3'])
    expect(mine?.card_count).toBe(3)
  })

  it("never returns another player's cards", () => {
    for (const row of redactHands(rows, 'me').filter((h) => h.player_id !== 'me')) {
      expect(row.cards).toBeNull()
    }
  })

  it('still reports every count, so the table UI and out-checks keep working', () => {
    expect(redactHands(rows, 'me').map((h) => h.card_count)).toEqual([3, 2, 0])
  })

  it('redacts everything for a spectator (null viewer)', () => {
    const out = redactHands(rows, null)
    expect(out.every((h) => h.cards === null)).toBe(true)
    expect(out.map((h) => h.card_count)).toEqual([3, 2, 0])
  })

  it('distinguishes "redacted" from "genuinely empty" — the bug that would mark a player out', () => {
    const viewed = redactHands(rows, 'out')
    const genuinelyEmpty = viewed.find((h) => h.player_id === 'out')
    const merelyHidden = viewed.find((h) => h.player_id === 'me')
    // An empty own hand is [] (really out); somebody else's is null (unknown), never [].
    expect(genuinelyEmpty?.cards).toEqual([])
    expect(genuinelyEmpty?.card_count).toBe(0)
    expect(merelyHidden?.cards).toBeNull()
    expect(merelyHidden?.card_count).toBe(3)
  })

  it('treats a malformed cards value as empty rather than throwing', () => {
    const bad = [{ id: 'h4', game_id: 'A', player_id: 'me', cards: null, player_order: 0 }]
    expect(redactHands(bad, 'me')[0].card_count).toBe(0)
  })
})
