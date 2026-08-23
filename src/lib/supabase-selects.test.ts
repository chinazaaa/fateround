import { describe, expect, it } from 'vitest'
import { MONOPOLY_BOARD_NOT_NULL_KEYS, MONOPOLY_BOARD_SELECT, isCompleteMonopolyBoardRow } from './supabase-selects'

/** A fully-populated board row as a fresh REST select returns it. */
function completeRow(): Record<string, unknown> {
  return {
    property_owners: { '1': 'p1' },
    property_buildings: {},
    mortgaged_properties: {},
    chance_deck: [1, 2, 3],
    community_deck: [4, 5],
    chance_discard: [],
    community_discard: [],
    turn_order: ['p1', 'p2'],
    loans: [],
    phase: 'buy',
    pending_space: 1,
    auction_state: null, // legitimately null — nullable column
    updated_at: '2026-07-16T00:00:00Z',
  }
}

describe('isCompleteMonopolyBoardRow', () => {
  it('accepts a fully-populated row (nullable columns may still be null)', () => {
    expect(isCompleteMonopolyBoardRow(completeRow())).toBe(true)
  })

  // Realtime UPDATE payloads omit unchanged TOAST-ed columns, which then arrive as null. Each
  // NOT-NULL column being absent must mark the row as partial so callers fall back to a reload.
  it.each(MONOPOLY_BOARD_NOT_NULL_KEYS)('rejects a row whose %s was TOAST-truncated to null', (key) => {
    const row = completeRow()
    row[key] = null
    expect(isCompleteMonopolyBoardRow(row)).toBe(false)
  })

  it('rejects a row missing a NOT-NULL column entirely', () => {
    const row = completeRow()
    delete row.property_owners
    expect(isCompleteMonopolyBoardRow(row)).toBe(false)
  })

  it('keeps the NOT-NULL key list in sync with the board select', () => {
    for (const key of MONOPOLY_BOARD_NOT_NULL_KEYS) {
      expect(MONOPOLY_BOARD_SELECT.split(',')).toContain(key)
    }
  })
})
