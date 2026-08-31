// @vitest-environment jsdom
/**
 * Both chat hooks used to refetch the ENTIRE history on every 15s poll tick. They now
 * fetch a bounded window of the most recent N rows. These tests pin two things that are
 * easy to get wrong:
 *   1. the query is bounded AND ordered descending (ascending + limit returns the OLDEST
 *      N, which would mean new messages never appear — a real regression), and
 *   2. the array handed to the feed is still oldest-first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

type QueryLog = {
  table: string
  ascending?: boolean
  limit?: number
}

const db = vi.hoisted(() => ({
  // Rows as the server would return them for `order('created_at', ascending:false)`:
  // newest first. The builder below slices/reverses to emulate real Postgres behaviour.
  rowsByTable: {} as Record<string, Array<Record<string, unknown>>>,
  queries: [] as QueryLog[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const log: QueryLog = { table }
      db.queries.push(log)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {}
      b.select = () => b
      b.eq = () => b
      b.order = (_col: string, opts?: { ascending?: boolean }) => {
        log.ascending = opts?.ascending
        return b
      }
      b.limit = (n: number) => {
        log.limit = n
        return b
      }
      const settle = () => {
        // Stored newest-first. Ascending means oldest-first.
        const all = db.rowsByTable[table] ?? []
        const ordered = log.ascending === false ? all : [...all].reverse()
        const data = log.limit == null ? ordered : ordered.slice(0, log.limit)
        return Promise.resolve({ data, error: null })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      b.then = (resolve: any, reject: any) => settle().then(resolve, reject)
      return b
    },
    channel() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = {}
      c.on = () => c
      c.subscribe = () => c
      return c
    },
    removeChannel: () => {},
  },
}))

import { useAnonymousMessages, ANONYMOUS_MESSAGES_HISTORY_LIMIT } from './useAnonymousMessages'
import { useCodewordsChat, CODEWORDS_CHAT_HISTORY_LIMIT } from './useCodewordsChat'

/** `count` rows, oldest = m0, newest = m{count-1}; stored newest-first. */
function makeRows(count: number, extra: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${count - 1 - i}`,
    game_id: 'ABCD',
    player_id: 'p1',
    text: `msg ${count - 1 - i}`,
    created_at: new Date(1_700_000_000_000 + (count - 1 - i) * 1000).toISOString(),
    ...extra,
  }))
}

beforeEach(() => {
  db.rowsByTable = {}
  db.queries = []
})
afterEach(() => vi.restoreAllMocks())

describe('useAnonymousMessages history window', () => {
  it('requests a bounded, descending window instead of the whole history', async () => {
    db.rowsByTable.anonymous_messages = makeRows(200)
    const { result } = renderHook(() => useAnonymousMessages('ABCD', true, []))
    await waitFor(() => expect(result.current.messages.length).toBeGreaterThan(0))

    const q = db.queries.find((x) => x.table === 'anonymous_messages')
    expect(q?.limit).toBe(ANONYMOUS_MESSAGES_HISTORY_LIMIT)
    expect(q?.ascending).toBe(false)
  })

  it('returns the NEWEST N messages, still ordered oldest-first for the feed', async () => {
    db.rowsByTable.anonymous_messages = makeRows(200)
    const { result } = renderHook(() => useAnonymousMessages('ABCD', true, []))
    await waitFor(() => expect(result.current.messages.length).toBe(ANONYMOUS_MESSAGES_HISTORY_LIMIT))

    const ids = result.current.messages.map((m) => m.id)
    // Newest row is m199; a window of 50 is m150..m199, rendered oldest-first.
    expect(ids[0]).toBe('m150')
    expect(ids[ids.length - 1]).toBe('m199')
    const times = result.current.messages.map((m) => new Date(m.created_at).getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('returns everything when the room has fewer messages than the window', async () => {
    db.rowsByTable.anonymous_messages = makeRows(3)
    const { result } = renderHook(() => useAnonymousMessages('ABCD', true, []))
    await waitFor(() => expect(result.current.messages.length).toBe(3))
    expect(result.current.messages.map((m) => m.id)).toEqual(['m0', 'm1', 'm2'])
  })
})

describe('useCodewordsChat history window', () => {
  it('requests a bounded, descending window instead of the whole history', async () => {
    db.rowsByTable.codewords_messages = makeRows(200, { team: 'red' })
    const { result } = renderHook(() => useCodewordsChat('ABCD', 'red', true, []))
    await waitFor(() => expect(result.current.messages.length).toBeGreaterThan(0))

    const q = db.queries.find((x) => x.table === 'codewords_messages')
    expect(q?.limit).toBe(CODEWORDS_CHAT_HISTORY_LIMIT)
    expect(q?.ascending).toBe(false)
  })

  it('returns the NEWEST N messages, still ordered oldest-first for the feed', async () => {
    db.rowsByTable.codewords_messages = makeRows(200, { team: 'red' })
    const { result } = renderHook(() => useCodewordsChat('ABCD', 'red', true, []))
    await waitFor(() => expect(result.current.messages.length).toBe(CODEWORDS_CHAT_HISTORY_LIMIT))

    const ids = result.current.messages.map((m) => m.id)
    expect(ids[0]).toBe('m150')
    expect(ids[ids.length - 1]).toBe('m199')
  })
})
