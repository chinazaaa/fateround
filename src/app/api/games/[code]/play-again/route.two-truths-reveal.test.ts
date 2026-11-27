import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * A Two Truths game ended by its host leaving closes and reveals its rounds in a cleanup that runs AFTER the finish
 * commits. Play Again deletes those rounds, so it must complete a pending cleanup first (a failed reveal could never
 * run again afterwards, losing the hidden lies and guesses) and refuse to reset while it still fails.
 */
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

const cleanup = vi.hoisted(() => ({
  calls: 0,
  error: null as string | null,
  superseded: false,
  args: [] as unknown[],
}))
vi.mock('@/lib/admin-end-game', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin-end-game')>()),
  completeHostLeftCleanup: async (_admin: unknown, _gameId: string, bind: unknown) => {
    cleanup.calls++
    cleanup.args.push(bind)
    return { finished: true, error: cleanup.error, ...(cleanup.superseded ? { superseded: true } : {}) }
  },
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
  cleanup.calls = 0
  cleanup.error = null
  cleanup.superseded = false
  cleanup.args = []
  writes.length = 0
})

const post = () => POST(jsonRequest(`/api/games/${GAME_CODE}/play-again`, { hostToken: HOST_TOKEN }), codeParams())
const hostEnded = (extra: Record<string, unknown> = {}) =>
  gameRow({ status: 'finished', game_type: 'two_truths', result_reason: 'host_ended', ...extra })

describe('POST /api/games/[code]/play-again — a host-left Two Truths finish', () => {
  it('a cleanup that still fails refuses the reset: nothing is deleted or reset, and it can be retried', async () => {
    current = hostEnded()
    cleanup.error = 'Could not reveal every Two Truths round'
    const res = await post()
    expect(res.status).toBe(409)
    expect(cleanup.calls).toBe(1)
    expect(writes).toEqual([])
  })

  it('binds the cleanup to the finish this request read, and a superseded finish refuses the reset', async () => {
    current = hostEnded({ finished_at: '2026-02-02T00:00:00.000Z' })
    cleanup.superseded = true
    const res = await post()
    expect(cleanup.args).toEqual([{ finishedAt: '2026-02-02T00:00:00.000Z' }])
    expect(res.status).toBe(409)
    expect(writes).toEqual([])
  })

  it('a completed cleanup lets the reset run', async () => {
    current = hostEnded()
    const res = await post()
    expect(res.status).toBe(200)
    expect(cleanup.calls).toBe(1)
    expect(writes).toContain('rounds:delete')
  })

  it.each([
    ['another finish reason', hostEnded({ result_reason: 'admin_ended' })],
    ['another game type', hostEnded({ game_type: 'trivia' })],
  ])('%s: the cleanup is not consulted', async (_name, row) => {
    current = row
    await post()
    expect(cleanup.calls).toBe(0)
  })
})
