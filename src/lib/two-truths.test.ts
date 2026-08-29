import { describe, expect, it } from 'vitest'
import { buildTtlMetadata, buildTtlRoundRows, ownTtlStatementIsFresh, parseTtlMetadata } from './two-truths'
import type { TtlStatement } from '@/types'

function statement(playerId: string, lieIndex: number): TtlStatement {
  return {
    id: `stmt-${playerId}`,
    game_id: 'ABCD',
    player_id: playerId,
    statement_a: `${playerId}-a`,
    statement_b: `${playerId}-b`,
    statement_c: `${playerId}-c`,
    lie_index: lieIndex,
    created_at: '2026-08-07T00:00:00.000Z',
    updated_at: '2026-08-07T00:00:00.000Z',
  }
}

describe('buildTtlMetadata', () => {
  it('shuffles the statements and returns the lie separately, never inside the metadata', () => {
    for (let i = 0; i < 50; i += 1) {
      const { metadata, lieIndex } = buildTtlMetadata(statement('p1', 1))
      expect(metadata.lie_index).toBeNull()
      expect([...metadata.statements].sort()).toEqual(['p1-a', 'p1-b', 'p1-c'])
      // The returned index points at the shuffled position of the original lie (statement_b).
      expect(metadata.statements[lieIndex]).toBe('p1-b')
    }
  })

  it('refuses to build a round for a statement with no lie recorded', () => {
    expect(() => buildTtlMetadata({ ...statement('p1', 0), lie_index: null })).toThrow(/lie index/i)
  })
})

describe('buildTtlRoundRows', () => {
  const statements = [statement('p1', 0), statement('p2', 1), statement('p3', 2)]
  const opts = {
    gameId: 'ABCD',
    statements,
    playerOrder: ['p2', 'p3', 'p1'],
    now: '2026-08-07T00:00:00.000Z',
  }

  it('never puts lie_index in the round metadata (it is anon-readable)', () => {
    const { rows } = buildTtlRoundRows(opts)
    for (const row of rows) {
      expect(row.ttl_metadata).toBeTruthy()
      expect(Object.keys(row.ttl_metadata as object)).toEqual(['statements', 'lie_index'])
      expect((row.ttl_metadata as { lie_index: number | null }).lie_index).toBeNull()
      expect(JSON.stringify(row.ttl_metadata)).not.toContain('"lie_index":0')
    }
  })

  it('returns one lie per round, keyed by round_number, matching the shuffled statements', () => {
    const { rows, lies } = buildTtlRoundRows(opts)
    expect(lies.map((l) => l.round_number)).toEqual([1, 2, 3])
    expect(rows.map((r) => r.round_number)).toEqual([1, 2, 3])

    const originalLie: Record<string, string> = { p1: 'p1-a', p2: 'p2-b', p3: 'p3-c' }
    for (const row of rows) {
      const lie = lies.find((l) => l.round_number === row.round_number)!
      const meta = row.ttl_metadata as { statements: [string, string, string] }
      expect(meta.statements[lie.lie_index]).toBe(originalLie[row.submitter_player_id!])
      expect(lie.lie_index).toBeGreaterThanOrEqual(0)
      expect(lie.lie_index).toBeLessThanOrEqual(2)
    }
  })

  it('orders rounds by playerOrder and activates only the first', () => {
    const { rows } = buildTtlRoundRows(opts)
    expect(rows.map((r) => r.submitter_player_id)).toEqual(['p2', 'p3', 'p1'])
    expect(rows.map((r) => r.status)).toEqual(['active', 'pending', 'pending'])
    expect(rows[0].started_at).toBe(opts.now)
    expect(rows[1].started_at).toBeNull()
  })

  it('throws when a player in the order has no statement', () => {
    expect(() => buildTtlRoundRows({ ...opts, playerOrder: ['p1', 'ghost'] })).toThrow(/Missing statements/)
  })
})

describe('parseTtlMetadata', () => {
  it('accepts metadata with NO lie_index (an unrevealed round) and reports it as null', () => {
    const parsed = parseTtlMetadata({ statements: ['a', 'b', 'c'] })
    expect(parsed).toEqual({ statements: ['a', 'b', 'c'], lie_index: null })
  })

  it('treats an explicit null lie_index the same way', () => {
    expect(parseTtlMetadata({ statements: ['a', 'b', 'c'], lie_index: null })?.lie_index).toBeNull()
  })

  it('keeps the lie once the server folds it back in at reveal', () => {
    expect(parseTtlMetadata({ statements: ['a', 'b', 'c'], lie_index: 2 })).toEqual({
      statements: ['a', 'b', 'c'],
      lie_index: 2,
    })
  })

  it('still rejects an out-of-range or non-numeric lie_index', () => {
    expect(parseTtlMetadata({ statements: ['a', 'b', 'c'], lie_index: 3 })).toBeNull()
    expect(parseTtlMetadata({ statements: ['a', 'b', 'c'], lie_index: -1 })).toBeNull()
    expect(parseTtlMetadata({ statements: ['a', 'b', 'c'], lie_index: 'one' })).toBeNull()
  })

  it('rejects malformed statements', () => {
    expect(parseTtlMetadata(null)).toBeNull()
    expect(parseTtlMetadata({ lie_index: 1 })).toBeNull()
    expect(parseTtlMetadata({ statements: ['a', 'b'] })).toBeNull()
  })
})

describe('ownTtlStatementIsFresh', () => {
  const roster = { id: 'stmt-1', updated_at: '2026-08-16T10:00:00.000Z' }

  it('keeps the token-gated own row when it matches the roster row', () => {
    expect(ownTtlStatementIsFresh({ id: 'stmt-1', updated_at: roster.updated_at }, roster)).toBe(true)
  })

  it('drops a row from a different submission entirely', () => {
    expect(ownTtlStatementIsFresh({ id: 'stmt-2', updated_at: roster.updated_at }, roster)).toBe(false)
    expect(ownTtlStatementIsFresh(null, roster)).toBe(false)
    expect(ownTtlStatementIsFresh({ id: 'stmt-1', updated_at: roster.updated_at }, null)).toBe(false)
  })

  it('drops a re-edited row that kept its id but is older than the roster row', () => {
    // The re-submit UPSERTs the SAME id and only bumps updated_at; matching on id alone would
    // keep serving the PREVIOUS lie to the edit form.
    expect(ownTtlStatementIsFresh({ id: 'stmt-1', updated_at: '2026-08-16T09:59:00.000Z' }, roster)).toBe(false)
  })

  it('keeps an own row that is newer than the roster row (own refetch won the race)', () => {
    expect(ownTtlStatementIsFresh({ id: 'stmt-1', updated_at: '2026-08-16T10:00:01.000Z' }, roster)).toBe(true)
  })

  it('falls back to the id match when a timestamp is unparseable', () => {
    expect(ownTtlStatementIsFresh({ id: 'stmt-1', updated_at: 'not-a-date' }, roster)).toBe(true)
  })
})
