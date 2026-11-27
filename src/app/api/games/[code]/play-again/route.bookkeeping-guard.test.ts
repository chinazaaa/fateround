import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * A finish that still owes its post-finish bookkeeping (a host-left finish writes the durable marker for every game
 * type) must complete it BEFORE Play Again resets the game: the bookkeeping reads rows the reset deletes. Two layers:
 *  - the snapshot check (`recoverFinishBookkeeping`): refuse while the previous finish owes something;
 *  - `begin_play_again_reset`, the FIRST write of the reset: one atomic database step that re-checks status, session
 *    identity, owed bookkeeping and a running reset, and marks the reset as started. Every later write is gated on it.
 *
 * The database function is modelled below with ALL of its predicates (the SQL itself is tested against a real database
 * in supabase/tests/play-again-reset-fence.sql and play-again-reset-locks.sh).
 */

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

const recover = vi.hoisted(() => vi.fn())
vi.mock('@/lib/game-finish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/game-finish')>()),
  recoverFinishBookkeeping: recover,
}))

type Row = Record<string, unknown>
let current: Row = gameRow({ status: 'finished', game_type: 'trivia', session_started_at: null, sessions_played: 3 })
/** Every write to ANY table (`table:op`) and every rpc (`rpc:name`), in order. */
const writes: string[] = []
/** The reset-marker token handed out by begin_play_again_reset. */
const TOKEN = '2026-11-27T00:00:00.123456+00:00'
let hookBeforeBegin: (() => void) | null = null
/** Runs once, at the first delete of the reset (e.g. the marker expires and another reset takes over). */
let hookOnFirstDelete: (() => void) | null = null
let beginArgs: Row | null = null
let abortArgs: Row | null = null
/** A delete of this table fails (a reset that dies half-way). */
let failTable: string | null = null
/** The `.eq` filters of the final games update. */
let finalUpdateFilters: Array<[string, unknown]> = []

function begin(a: Row) {
  beginArgs = a
  hookBeforeBegin?.()
  hookBeforeBegin = null
  // ALL predicates of the function: owed bookkeeping, the status AND the session identity read by the request, and a
  // reset already running.
  if (current.finish_bookkeeping != null) return { status: 'bookkeeping_owed' }
  if (
    current.status !== a.p_status ||
    ((current.session_started_at as string | null) ?? null) !== a.p_session_started_at ||
    current.sessions_played !== a.p_sessions_played
  ) {
    return { status: 'changed' }
  }
  if (current.reset_started_at != null) return { status: 'in_progress' }
  current.reset_started_at = TOKEN
  return { status: 'started', token: TOKEN }
}

const resolvers = new Proxy({} as Record<string, never>, {
  get:
    (_t, table: string) =>
    (call: { op: string; payload?: unknown; filterCalls?: Array<{ method: string; args: unknown[] }> }) => {
      if (call.op !== 'select') writes.push(`${table}:${call.op}`)
      if (call.op === 'delete' && hookOnFirstDelete) {
        const hook = hookOnFirstDelete
        hookOnFirstDelete = null
        hook()
      }
      if (call.op === 'delete' && failTable === table) return { data: null, error: { message: 'delete failed' } }
      if (table === 'games' && call.op === 'update') {
        finalUpdateFilters = (call.filterCalls ?? [])
          .filter((c) => c.method === 'eq')
          .map((c) => c.args as [string, unknown])
        // The final update only matches while this reset's marker is still on the row.
        if (current.reset_started_at !== TOKEN) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        Object.assign(current, call.payload as Row, { status: 'waiting' })
        return { data: { ...current }, error: null }
      }
      if (table === 'games') return { data: current, error: null }
      return { data: null, error: null }
    },
}) as never
const base = makeSupabaseStub(resolvers)
const supabase = {
  ...base,
  rpc: async (name: string, args: Row) => {
    writes.push(`rpc:${name}`)
    if (name === 'begin_play_again_reset') return { data: begin(args), error: null }
    if (name === 'abort_play_again_reset') {
      abortArgs = args
      if (current.reset_started_at === args.p_token) current.reset_started_at = null
      return { data: null, error: null }
    }
    return { data: null, error: null }
  },
}
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))

type Post = typeof import('./route').POST
let POST: Post
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  recover.mockReset()
  recover.mockResolvedValue({ state: 'none' })
  writes.length = 0
  hookBeforeBegin = null
  hookOnFirstDelete = null
  beginArgs = null
  abortArgs = null
  failTable = null
  finalUpdateFilters = []
  current = gameRow({ status: 'finished', game_type: 'trivia', session_started_at: null, sessions_played: 3 })
})

const post = () => POST(jsonRequest(`/api/games/${GAME_CODE}/play-again`, { hostToken: HOST_TOKEN }), codeParams())

describe('POST /api/games/[code]/play-again — owed bookkeeping (snapshot check)', () => {
  it.each(['held', 'retry', 'error'])(
    'refuses to reset while the previous finish is %s: 409 and NO write or rpc at all',
    async (state) => {
      recover.mockResolvedValue({ state })
      const res = await post()
      expect(res.status).toBe(409)
      expect(writes).toEqual([])
    }
  )

  it.each(['none', 'done'])(
    'resets once the bookkeeping is %s: success, and the reset writes happened',
    async (state) => {
      recover.mockResolvedValue({ state })
      const res = await post()
      expect(res.status).toBe(200)
      expect(recover).toHaveBeenCalledTimes(1)
      expect(writes).toEqual(expect.arrayContaining(['votes:delete', 'rounds:delete', 'games:update']))
    }
  )
})

describe('POST /api/games/[code]/play-again — begin_play_again_reset is the first write', () => {
  it('runs before every write, with the status and session identity READ AT THE START of the request', async () => {
    current = gameRow({
      status: 'finished',
      game_type: 'trivia',
      session_started_at: '2026-01-01T00:00:00.000Z',
      sessions_played: 5,
    })
    const res = await post()
    expect(res.status).toBe(200)
    expect(writes[0]).toBe('rpc:begin_play_again_reset')
    expect(beginArgs).toMatchObject({
      p_game_id: GAME_CODE.toUpperCase(),
      p_status: 'finished',
      p_session_started_at: '2026-01-01T00:00:00.000Z',
      p_sessions_played: 5,
    })
  })

  it('the final update is bound to THIS reset (its marker) and clears it; the release afterwards is a no-op', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(finalUpdateFilters).toContainEqual(['reset_started_at', TOKEN])
    expect(current.reset_started_at).toBeNull()
    expect(abortArgs).toMatchObject({ p_token: TOKEN })
  })

  it.each([
    ['a host-left finish committed after the snapshot (the marker is owed)', { finish_bookkeeping: { attempts: 0 } }],
    ['the game finished normally after the read (status moved)', { status: 'waiting' }],
    ['a replay ran after the read (sessions_played moved)', { sessions_played: 4 }],
    ['a start ran after the read (session_started_at moved)', { session_started_at: '2026-02-02T00:00:00.000Z' }],
    ['another reset is already running', { reset_started_at: 'OTHER' }],
  ])('refuses with 409 and writes nothing when %s', async (_name, change) => {
    hookBeforeBegin = () => Object.assign(current, change)
    const res = await post()
    expect(res.status).toBe(409)
    // Only the (refused) begin ran: no delete of any table, no final reset update, no marker released that is not ours.
    expect(writes).toEqual(['rpc:begin_play_again_reset'])
  })

  it('a LIVE game resets when nothing moved: the fence is given its live status, not a constant', async () => {
    current = gameRow({
      status: 'active',
      game_type: 'codewords',
      session_started_at: '2026-01-01T00:00:00.000Z',
      sessions_played: 3,
    })
    const res = await post()
    expect(res.status).toBe(200)
    expect(beginArgs).toMatchObject({ p_status: 'active' })
    expect(current.status).toBe('waiting')
  })

  it('a LIVE game is fenced the same way: a host-left finish after the snapshot refuses the reset', async () => {
    current = gameRow({
      status: 'active',
      game_type: 'codewords',
      session_started_at: '2026-01-01T00:00:00.000Z',
      sessions_played: 3,
    })
    hookBeforeBegin = () => Object.assign(current, { status: 'finished', finish_bookkeeping: { attempts: 0 } })
    const res = await post()
    expect(res.status).toBe(409)
    expect(writes).toEqual(['rpc:begin_play_again_reset'])
  })
})

describe('POST /api/games/[code]/play-again — a failed reset keeps the previous state', () => {
  it('a delete that fails leaves the game as it was (never exposed as a lobby), releases the marker, and the retry works', async () => {
    failTable = 'rounds'
    const first = await post()
    expect(first.status).toBe(500)
    // Nothing flipped the game: the visible state is untouched and the marker is released for an immediate retry.
    expect(current.status).toBe('finished')
    expect(current.reset_started_at).toBeNull()
    expect(writes).not.toContain('games:update')
    failTable = null
    writes.length = 0
    const retry = await post()
    expect(retry.status).toBe(200)
    expect(current.status).toBe('waiting')
  })
})

describe('POST /api/games/[code]/play-again — a superseded reset', () => {
  it('whose marker was replaced mid-way answers 409 and does not flip the game', async () => {
    hookOnFirstDelete = () => {
      current.reset_started_at = 'ANOTHER-RESET'
    }
    const res = await post()
    expect(res.status).toBe(409)
    expect(current.status).toBe('finished')
    // The release is bound to THIS reset's token, so it must not clear the other reset's marker.
    expect(current.reset_started_at).toBe('ANOTHER-RESET')
  })
})
