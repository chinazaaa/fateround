import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

import { WORD_GROUPING_MAX_MISTAKES } from '@/lib/word-grouping'

type Row = Record<string, unknown>

const SOLUTION = {
  groups: [
    { category: 'A', words: ['a1', 'a2', 'a3', 'a4'], difficulty: 1 },
    { category: 'B', words: ['b1', 'b2', 'b3', 'b4'], difficulty: 2 },
    { category: 'C', words: ['c1', 'c2', 'c3', 'c4'], difficulty: 3 },
    { category: 'D', words: ['d1', 'd2', 'd3', 'd4'], difficulty: 4 },
  ],
}

let submissions: Row[] = []
let counter = 0

/** Minimal PostgREST-shaped stand-in. Every call yields once, so concurrent requests interleave. */
function table(name: string) {
  const filters: [string, unknown][] = []
  let mode: 'select' | 'insert' | 'delete' = 'select'
  let inserted: Row | null = null
  const rows = (): Row[] => {
    if (name === 'games') return [{ id: 'ABCD', status: 'active', session_started_at: null, game_duration_seconds: 0 }]
    if (name === 'rounds') return [{ id: 'r1', word_grouping_metadata: {} }]
    if (name === 'word_grouping_solutions') return [{ round_id: 'r1', solution: SOLUTION }]
    if (name === 'players') return [{ id: 'p1', game_id: 'ABCD', spectator: false }]
    if (name === 'word_grouping_submissions') return submissions
    return []
  }
  // Only the submissions table needs real filtering; the single game/round/player rows always match.
  const filtered = () =>
    name === 'word_grouping_submissions' ? rows().filter((r) => filters.every(([k, v]) => r[k] === v)) : rows()
  const run = async () => {
    await Promise.resolve()
    if (mode === 'insert') return { data: inserted ? { ...inserted } : null, error: null }
    if (mode === 'delete') {
      const ids = new Set(filtered().map((r) => r.id))
      submissions = submissions.filter((r) => !ids.has(r.id))
      return { data: null, error: null }
    }
    return { data: filtered().map((r) => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    single: async () => {
      const res = await run()
      return { data: res.data, error: null }
    },
    eq: (k: string, v: unknown) => {
      filters.push([k, v])
      return api
    },
    insert: (row: Row) => {
      mode = 'insert'
      inserted = { id: `sub-${++counter}`, ...row }
      submissions.push(inserted)
      return api
    },
    delete: () => {
      mode = 'delete'
      return api
    },
    maybeSingle: async () => {
      const res = await run()
      return { data: (res.data as Row[])[0] ?? null, error: null }
    },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => run().then(resolve, reject),
  }
  return api
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: table }) }))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: async () => ({ player: { id: 'p1', spectator: false } }) }))
vi.mock('@/lib/game-finish', () => ({ markGameFinished: async () => ({ error: null, won: true }) }))

import { POST } from './route'

const send = (words: string[]) =>
  POST(
    new NextRequest('https://x.test/api/word-grouping/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'ABCD', resumeToken: 'TOKEN-1234', words }),
    })
  )

const wrong = (n: number) => ['a1', 'b1', 'c1', `x${n}`]

describe('POST /api/word-grouping/submit', () => {
  beforeEach(() => {
    submissions = []
    counter = 0
  })

  it('stops at the mistake limit when wrong guesses are sent one after another', async () => {
    const statuses: number[] = []
    for (let i = 0; i < WORD_GROUPING_MAX_MISTAKES + 2; i++) statuses.push((await send(wrong(i))).status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(WORD_GROUPING_MAX_MISTAKES)
    expect(submissions.filter((s) => !s.is_correct)).toHaveLength(WORD_GROUPING_MAX_MISTAKES)
  })

  it('does not let simultaneous wrong guesses exceed the mistake limit', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => send(wrong(i))))
    expect(results.filter((r) => r.status === 200)).toHaveLength(WORD_GROUPING_MAX_MISTAKES)
    expect(submissions.filter((s) => !s.is_correct)).toHaveLength(WORD_GROUPING_MAX_MISTAKES)
  })

  it('accepts a correct group', async () => {
    const res = await send(['a1', 'a2', 'a3', 'a4'])
    expect(res.status).toBe(200)
    expect((await res.json()).isCorrect).toBe(true)
  })

  it('rejects an oversized word instead of storing it', async () => {
    const res = await send(['a1', 'a2', 'a3', 'x'.repeat(300_000)])
    expect(res.status).toBe(400)
    expect(submissions).toHaveLength(0)
  })
})
