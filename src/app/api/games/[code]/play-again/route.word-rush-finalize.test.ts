import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

/**
 * A finished Word Rush game's owed effects (the finish's bookkeeping, a closed round's points) read rows that Play Again's
 * deletes remove (votes, rounds, participants, ...). The check therefore runs BEFORE the first delete, and refuses the reset
 * while anything is still owed.
 */
const finalize = vi.hoisted(() => ({ calls: 0, error: null as string | null }))
vi.mock('@/lib/word-rush-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/word-rush-server')>()),
  ensureWordRushGameFinalized: async () => {
    finalize.calls++
    return finalize.error ? { error: finalize.error } : {}
  },
  clearWordRushSessionData: async () => ({}),
}))

let current: Record<string, unknown>
const writes: string[] = []
const resolvers = new Proxy({} as Record<string, never>, {
  get: (_t, table: string) => (call: { op: string; payload?: unknown }) => {
    if (call.op !== 'select') writes.push(`${table}:${call.op}`)
    if (table === 'games' && call.op === 'update') {
      Object.assign(current, call.payload as Record<string, unknown>, { status: 'waiting' })
      return { data: { ...current }, error: null }
    }
    if (table === 'games') return { data: current, error: null }
    return { data: null, error: null }
  },
}) as never
const base = makeSupabaseStub(resolvers)
const supabase = { ...base, rpc: async () => ({ data: null, error: null }) }
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  finalize.calls = 0
  finalize.error = null
  writes.length = 0
})

const post = () => POST(jsonRequest(`/api/games/${GAME_CODE}/play-again`, { hostToken: HOST_TOKEN }), codeParams())
const finished = (extra: Record<string, unknown> = {}) =>
  gameRow({ status: 'finished', game_type: 'word_rush', result_reason: null, ...extra })

describe('POST /api/games/[code]/play-again — a finished Word Rush game', () => {
  it('owed effects refuse the reset BEFORE any delete (nothing is deleted or reset, and it can be retried)', async () => {
    current = finished()
    finalize.error = 'The previous game is still being finalized — try again in a moment'
    const res = await post()
    expect(res.status).toBe(409)
    expect(finalize.calls).toBe(1)
    expect(writes).toEqual([])
  })

  it('nothing owed: the reset runs (the check came first)', async () => {
    current = finished()
    const res = await post()
    expect(res.status).toBe(200)
    expect(finalize.calls).toBe(1)
    expect(writes).toContain('rounds:delete')
  })

  it('another game type is not asked', async () => {
    current = finished({ game_type: 'trivia' })
    await post()
    expect(finalize.calls).toBe(0)
  })
})
