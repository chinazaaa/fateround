import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
// A bookkeeping guard that may sit in front of this check (the stacked follow-up's) is not what this file tests.
vi.mock('@/lib/game-finish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/game-finish')>()),
  recoverFinishBookkeeping: async () => ({ state: 'none' }),
}))
const finalize = vi.hoisted(() => ({
  calls: 0,
  error: null as string | null,
  /** When set, the finalizer waits for this promise (a finalization that is still running). */
  hold: null as Promise<void> | null,
  /** Called when the finalizer starts (the test waits on it instead of sleeping). */
  onStart: null as (() => void) | null,
  /** Releases a held finalizer: always run by the cleanup, so a failed assertion can never leave the request pending. */
  release: null as (() => void) | null,
}))
vi.mock('@/lib/word-rush-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/word-rush-server')>()),
  ensureWordRushGameFinalized: async () => {
    finalize.calls++
    finalize.onStart?.()
    if (finalize.hold) await finalize.hold
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
  finalize.hold = null
  finalize.onStart = null
  finalize.release = null
  writes.length = 0
})
afterEach(() => finalize.release?.())

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

  it('the first delete waits for a finalization that is still running, then the reset succeeds', async () => {
    current = finished()
    const started = new Promise<void>((resolve) => {
      finalize.onStart = resolve
    })
    finalize.hold = new Promise<void>((resolve) => {
      finalize.release = resolve
    })
    const pending = post()
    try {
      // Wait until the request is PARKED on the finalizer (no sleeping): nothing may have been deleted or reset by then.
      await started
      expect(finalize.calls).toBe(1)
      expect(writes).toEqual([])
      // Destructive writes begin only after the finalizer settles.
      finalize.release!()
      const res = await pending
      expect(res.status).toBe(200)
      expect(writes).toContain('rounds:delete')
    } finally {
      // A failed assertion must not leave the request running into the next test's state: release it and WAIT for it.
      finalize.release!()
      await pending.catch(() => {})
    }
  })

  it('nothing owed: the reset runs (the check came first) and the reopened game carries no previous finish reason', async () => {
    current = finished({ result_reason: 'host_ended' })
    const res = await post()
    expect(res.status).toBe(200)
    expect(current.result_reason).toBeNull()
    expect(finalize.calls).toBe(1)
    expect(writes).toContain('rounds:delete')
  })

  it('another game type is not asked', async () => {
    current = finished({ game_type: 'trivia' })
    const res = await post()
    // The control must still replay: a route that rejected Trivia before the Word Rush check also asks nobody.
    expect(res.status).toBe(200)
    expect(writes).toContain('rounds:delete')
    expect(finalize.calls).toBe(0)
  })
})
