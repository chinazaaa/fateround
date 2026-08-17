import { describe, expect, it } from 'vitest'
import { mergeHandRow, pushedCardCount } from '@/lib/hand-rows'

type Row = { id: string; player_id: string; player_order: number; cards?: unknown; card_count?: number }

const row = (over: Partial<Row> = {}): Row => ({ id: 'h1', player_id: 'p1', player_order: 0, ...over })

describe('pushedCardCount', () => {
  it('reads an explicit count', () => {
    expect(pushedCardCount(row({ card_count: 3 }))).toBe(3)
  })

  it('falls back to the length of a visible hand', () => {
    expect(pushedCardCount(row({ cards: [{}, {}] }))).toBe(2)
  })

  it('reports a genuinely empty hand as 0, not unknown', () => {
    expect(pushedCardCount(row({ cards: [] }))).toBe(0)
    expect(pushedCardCount(row({ card_count: 0 }))).toBe(0)
  })

  it('reports a redacted row as unknown, never as zero', () => {
    // The realtime payload after the `cards` revoke: no cards, no count. Zero here would read as
    // "this player is out".
    expect(pushedCardCount(row({ cards: null }))).toBeNull()
    expect(pushedCardCount(row())).toBeNull()
  })
})

describe('mergeHandRow', () => {
  it('carries the last known count forward when the payload is redacted', () => {
    const prev = [row({ card_count: 5 })]
    expect(mergeHandRow(prev, row({ cards: null }))[0].card_count).toBe(5)
  })

  it('takes the new count when the payload carries one', () => {
    const prev = [row({ card_count: 5 })]
    expect(mergeHandRow(prev, row({ card_count: 1 }))[0].card_count).toBe(1)
  })

  it('does not resurrect a stale count over a genuinely empty hand', () => {
    const prev = [row({ card_count: 5 })]
    expect(mergeHandRow(prev, row({ cards: [] }))[0].card_count).toBe(0)
  })

  it('inserts an unseen row in player_order', () => {
    const prev = [row({ id: 'h1', player_id: 'p1', player_order: 0, card_count: 1 })]
    const merged = mergeHandRow(prev, row({ id: 'h0', player_id: 'p0', player_order: -1, card_count: 7 }))
    expect(merged.map((h) => h.id)).toEqual(['h0', 'h1'])
  })
})
