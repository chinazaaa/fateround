import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimit: async () => null,
}))
vi.mock('@/lib/identity-server', () => ({ getProfileFromRequest: async () => null }))

const removal = vi.hoisted(() => ({
  uno: { error: null as string | null },
  scrabble: { error: null as string | null },
}))
vi.mock('@/lib/uno', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/uno')>()),
  removeUnoPlayer: async () => ({ error: removal.uno.error }),
}))
vi.mock('@/lib/scrabble', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/scrabble')>()),
  removeScrabblePlayer: async () => ({ error: removal.scrabble.error }),
}))

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}

/** Tiny stateful Supabase stand-in: equality / is-null / neq filters, update, delete. */
function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let patch: Row | null = null
  let deleting = false
  const match = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const run = async () => {
    await Promise.resolve()
    if (deleting) {
      const doomed = match()
      tables[table] = (tables[table] ?? []).filter((r) => !doomed.includes(r))
      return { data: null, error: null }
    }
    if (patch) {
      const rows = match()
      for (const r of rows) Object.assign(r, patch)
      return { data: rows.map((r) => ({ ...r })), error: null }
    }
    return { data: match().map((r) => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), api),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), api),
    update: (p: Row) => ((patch = p), api),
    delete: () => ((deleting = true), api),
    maybeSingle: async () => {
      const res = await run()
      return { data: (res.data as Row[] | null)?.[0] ?? null, error: res.error }
    },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => run().then(resolve, reject),
  }
  return api
}
const client = { from: builder, rpc: async () => ({ data: true, error: null }) }
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => client }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => client }))

type Del = typeof import('./route').DELETE
let DELETE: Del

const HOST_PID = '00000000-0000-4000-8000-00000000000a'
const OTHER_PID = '00000000-0000-4000-8000-00000000000b'
const TOKEN = 'ABCD1234'
const leave = () =>
  DELETE(
    new NextRequest('https://x.test/api/players', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameCode: 'abcd', playerId: HOST_PID, resumeToken: TOKEN }),
    })
  )

function setup(gameType: string, extra: Row = {}) {
  tables = {
    games: [
      {
        id: 'ABCD',
        status: 'active',
        game_type: gameType,
        participant_mode: 'players',
        host_player_id: HOST_PID,
        host_user_id: 'user-host',
        pending_host_player_id: null,
        pending_host_nominated_at: null,
        ...extra,
      },
    ],
    players: [
      {
        id: HOST_PID,
        game_id: 'ABCD',
        name: 'Host',
        resume_token: TOKEN,
        is_bot: false,
        spectator: false,
        joined_at: 1,
      },
      {
        id: OTHER_PID,
        game_id: 'ABCD',
        name: 'Other',
        resume_token: 'ZZZZ9999',
        is_bot: false,
        spectator: false,
        joined_at: 2,
      },
    ],
  }
}

beforeEach(async () => {
  DELETE ??= (await import('./route')).DELETE
  removal.uno.error = null
  removal.scrabble.error = null
})

describe.each(['uno', 'scrabble'] as const)('DELETE /api/players: host leave handoff (%s)', (gameType) => {
  const fail = () => {
    removal[gameType].error = 'Game changed, please try again.'
  }

  it('a failed (conflicting) leave does not leave a nominated successor behind', async () => {
    setup(gameType)
    fail()
    const res = await leave()
    expect(res.status).toBeGreaterThanOrEqual(400)
    const g = tables.games[0]
    expect(g.pending_host_player_id).toBeNull()
    expect(g.pending_host_nominated_at).toBeNull()
    expect(g.host_user_id).toBe('user-host')
  })

  it('a failed leave restores host_user_id when a nomination was already pending', async () => {
    setup(gameType, { pending_host_player_id: OTHER_PID, pending_host_nominated_at: 'T' })
    fail()
    await leave()
    const g = tables.games[0]
    expect(g.host_user_id).toBe('user-host')
    expect(g.pending_host_player_id).toBe(OTHER_PID)
  })

  it('a successful leave keeps the handoff', async () => {
    setup(gameType)
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.pending_host_player_id).toBe(OTHER_PID)
    expect(g.host_user_id).toBeNull()
  })
})
