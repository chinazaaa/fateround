import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimit: async () => null,
}))
vi.mock('@/lib/identity-server', () => ({ getProfileFromRequest: async () => null }))

const removal = vi.hoisted(() => ({
  reconcileError: null as string | null,
  uno: { error: null as string | null, onCall: null as (() => void) | null },
  scrabble: { error: null as string | null, onCall: null as (() => void) | null },
}))
vi.mock('@/lib/uno', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/uno')>()),
  removeUnoPlayer: async () => removed(removal.uno),
}))
vi.mock('@/lib/scrabble', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/scrabble')>()),
  removeScrabblePlayer: async () => removed(removal.scrabble),
}))
vi.mock('@/lib/codewords', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/codewords')>()),
  reconcileCodewordsTeamAfterRemoval: async () => ({
    error: removal.reconcileError,
    outcome: { ended: false },
  }),
}))

type Row = Record<string, unknown>
/** A successful removal deletes the seat (games.host_player_id is ON DELETE SET NULL); `onCall` runs after it. */
function removed(r: { error: string | null; onCall: (() => void) | null }) {
  if (!r.error) tables.games[0].host_player_id = null
  r.onCall?.()
  return { error: r.error }
}
let failSuccessorLookup = false
let tables: Record<string, Row[]> = {}

/** Tiny stateful Supabase stand-in: equality / is-null / neq filters, update, delete. */
function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let patch: Row | null = null
  let deleting = false
  let excludesSomeone = false
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
    if (failSuccessorLookup && excludesSomeone) return { data: null, error: { message: 'boom' } }
    return { data: match().map((r) => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
    neq: (k: string, v: unknown) => ((excludesSomeone = true), filters.push((r) => r[k] !== v), api),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), api),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), api),
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
  failSuccessorLookup = false
  removal.reconcileError = null
  removal.uno.error = null
  removal.scrabble.error = null
  removal.uno.onCall = null
  removal.scrabble.onCall = null
})

describe.each(['uno', 'scrabble'] as const)('DELETE /api/players: host leave handoff (%s)', (gameType) => {
  const fail = () => {
    removal[gameType].error = 'Game changed, please try again.'
  }

  it('a failed (conflicting) leave never nominates a successor (nothing to roll back)', async () => {
    setup(gameType)
    fail()
    const res = await leave()
    expect(res.status).toBeGreaterThanOrEqual(400)
    const g = tables.games[0]
    expect(g.pending_host_player_id).toBeNull()
    expect(g.pending_host_nominated_at).toBeNull()
    expect(g.host_user_id).toBe('user-host')
  })

  it('a failed leave leaves a pending nomination and host_user_id untouched', async () => {
    setup(gameType, { pending_host_player_id: OTHER_PID, pending_host_nominated_at: 'T' })
    fail()
    await leave()
    const g = tables.games[0]
    expect(g.host_user_id).toBe('user-host')
    expect(g.pending_host_player_id).toBe(OTHER_PID)
    expect(g.pending_host_nominated_at).toBe('T')
  })

  it('a renewed nomination during a failed leave is not clobbered', async () => {
    setup(gameType, { pending_host_player_id: OTHER_PID, pending_host_nominated_at: 'T' })
    removal[gameType].onCall = () => {
      tables.games[0].pending_host_nominated_at = 'RENEWED'
    }
    fail()
    await leave()
    expect(tables.games[0].pending_host_nominated_at).toBe('RENEWED')
  })

  it('the nomination is written only after the removal ran', async () => {
    setup(gameType)
    let seenDuringRemoval: unknown = 'unset'
    removal[gameType].onCall = () => {
      seenDuringRemoval = tables.games[0].pending_host_player_id
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(seenDuringRemoval).toBeNull()
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })

  it('a pending nomination is only claimable-routed (host_user_id cleared) after a successful leave', async () => {
    setup(gameType, { pending_host_player_id: OTHER_PID, pending_host_nominated_at: 'T' })
    let during: unknown = 'unset'
    removal[gameType].onCall = () => {
      during = tables.games[0].host_user_id
    }
    await leave()
    expect(during).toBe('user-host')
    expect(tables.games[0].host_user_id).toBeNull()
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

describe('DELETE /api/players: host leave handoff edge cases', () => {
  it('a claim that lands between the leave and the clear is not overwritten', async () => {
    setup('uno', { pending_host_player_id: OTHER_PID, pending_host_nominated_at: 'T' })
    removal.uno.onCall = () => {
      Object.assign(tables.games[0], {
        host_player_id: OTHER_PID,
        host_user_id: 'user-other',
        pending_host_player_id: null,
      })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].host_user_id).toBe('user-other')
  })

  it('a failed successor lookup fails the leave instead of ending a game that still has players', async () => {
    setup('uno')
    failSuccessorLookup = true
    const res = await leave()
    expect(res.status).toBe(500)
    expect(tables.games[0].status).toBe('active')
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
  })

  it('when every other player left before the handoff, the game is ended', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      tables.players = tables.players.filter((p) => p.id !== OTHER_PID)
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].status).toBe('finished')
    expect(tables.games[0].pending_host_player_id).toBeNull()
  })

  it('a codewords host whose seat is gone still hands off when the team cleanup then errors', async () => {
    setup('codewords')
    removal.reconcileError = 'cleanup failed'
    const res = await leave()
    expect(res.status).toBe(500)
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })
})
