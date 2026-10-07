import { describe, expect, it } from 'vitest'
import {
  MONOPOLY_BOARD_NOT_NULL_KEYS,
  MONOPOLY_BOARD_SELECT,
  isCompleteMonopolyBoardRow,
  WHOT_SESSION_NOT_NULL_KEYS,
  WHOT_SESSION_SELECT,
  isCompleteWhotSessionRow,
  RUMMY_SESSION_NOT_NULL_KEYS,
  RUMMY_SESSION_SELECT,
  isCompleteRummySessionRow,
} from './supabase-selects'

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

/**
 * Whot and Rummy got these gates only after `undefined is not an object (evaluating
 * 'e.turn_order.filter')` ran in production for weeks — Uno had had one since the hazard was
 * first documented. The sync test matters as much as the predicate: a key that is not in the
 * select is never present, so the gate would reject EVERY payload and force a reload each time,
 * which is the bug that was already found once in UNO_SESSION_NOT_NULL_KEYS after its piles
 * were revoked.
 */
describe('whot session completeness', () => {
  it('accepts a row carrying every NOT-NULL key', () => {
    expect(isCompleteWhotSessionRow({ turn_order: [], finish_order: [] })).toBe(true)
  })

  it.each(WHOT_SESSION_NOT_NULL_KEYS)('rejects a row whose %s was dropped', (dropped) => {
    const row = Object.fromEntries(WHOT_SESSION_NOT_NULL_KEYS.map((k) => [k, []]))
    delete row[dropped]
    expect(isCompleteWhotSessionRow(row)).toBe(false)
    // a truncated payload delivers null as well as absent — both must be rejected
    expect(isCompleteWhotSessionRow({ ...row, [dropped]: null })).toBe(false)
  })

  it('keeps the NOT-NULL key list in sync with the session select', () => {
    for (const key of WHOT_SESSION_NOT_NULL_KEYS) {
      expect(WHOT_SESSION_SELECT.split(',')).toContain(key)
    }
  })
})

describe('rummy session completeness', () => {
  it('accepts a row carrying every NOT-NULL key', () => {
    expect(isCompleteRummySessionRow({ turn_order: [], draw_pile: [], discard_pile: [] })).toBe(true)
  })

  it.each(RUMMY_SESSION_NOT_NULL_KEYS)('rejects a row whose %s was dropped', (dropped) => {
    const row = Object.fromEntries(RUMMY_SESSION_NOT_NULL_KEYS.map((k) => [k, []]))
    delete row[dropped]
    expect(isCompleteRummySessionRow(row)).toBe(false)
    expect(isCompleteRummySessionRow({ ...row, [dropped]: null })).toBe(false)
  })

  it('keeps the NOT-NULL key list in sync with the session select', () => {
    for (const key of RUMMY_SESSION_NOT_NULL_KEYS) {
      expect(RUMMY_SESSION_SELECT.split(',')).toContain(key)
    }
  })
})
