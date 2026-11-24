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
  if (!r.error && !keepSeat) tables.games[0].host_player_id = null
  r.onCall?.()
  return { error: r.error }
}
/** Number of upcoming nomination writes (games updates setting pending_host_player_id) that return an error. */
let nominationFailBudget = 0
/** The errored nomination write still committed (an ambiguous failure). */
let nominationCommitsOnError = false
let failSuccessorLookup = false
/** Number of upcoming successor lookups that fail (the deferred, post-removal ones). */
let lookupFailBudget = 0
/** A finished host's seat is retained by the removal helper, so host_player_id keeps naming them. */
let keepSeat = false
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
      if (table === 'games' && 'pending_host_player_id' in patch && nominationFailBudget > 0) {
        nominationFailBudget--
        if (nominationCommitsOnError) for (const r of match()) Object.assign(r, patch)
        return { data: null, error: { message: 'boom' } }
      }
      const rows = match()
      for (const r of rows) Object.assign(r, patch)
      return { data: rows.map((r) => ({ ...r })), error: null }
    }
    if (excludesSomeone && (failSuccessorLookup || lookupFailBudget > 0)) {
      if (!failSuccessorLookup) lookupFailBudget--
      return { data: null, error: { message: 'boom' } }
    }
    return { data: match().map((r) => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
    neq: (k: string, v: unknown) => ((excludesSomeone = true), filters.push((r) => r[k] !== v), api),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), api),
    // Only the `col.is.null,col.eq.X` shape the route uses.
    or: (expr: string) => {
      const alts = expr.split(',').map((a) => a.split('.'))
      filters.push((r) => alts.some(([k, op, v]) => (op === 'is' ? (r[k] ?? null) === null : r[k] === v)))
      return api
    },
    lte: (k: string, v: string) => (filters.push((r) => r[k] != null && (r[k] as string) <= v), api),
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
  lookupFailBudget = 0
  nominationFailBudget = 0
  nominationCommitsOnError = false
  keepSeat = false
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

  it('a transient deferred successor lookup failure is retried and the nominee is still set', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      lookupFailBudget = 1
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
    expect(tables.games[0].status).toBe('active')
  })

  it('a persistent deferred successor lookup failure ends the game rather than leaving it host-less', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      lookupFailBudget = 2
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].status).toBe('finished')
    // The finish ran after the seat was gone, so nothing else clears the linkage Continue routes by.
    expect(tables.games[0].host_user_id).toBeNull()
  })

  it('a transient nomination write error after the seat delete is retried and the nominee is still set', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      nominationFailBudget = 1
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
    expect(tables.games[0].status).toBe('active')
  })

  it('a persistent nomination write error ends the game rather than leaving it host-less and unrecoverable', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      nominationFailBudget = 2
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].status).toBe('finished')
    expect(tables.games[0].result_reason).toBe('host_ended')
    expect(tables.games[0].host_user_id).toBeNull()
  })

  it('an errored nomination write that actually committed keeps the game live with its nominee', async () => {
    setup('uno')
    nominationCommitsOnError = true
    removal.uno.onCall = () => {
      nominationFailBudget = 2
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].status).toBe('active')
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
    expect(tables.games[0].host_user_id).toBeNull()
  })

  it('a nomination that matches no row (concurrent nomination) is not an error and keeps the game live', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      tables.games[0].pending_host_player_id = 'someone-else'
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].status).toBe('active')
    expect(tables.games[0].pending_host_player_id).toBe('someone-else')
    expect(tables.games[0].host_user_id).toBeNull()
  })

  it('a finished host whose seat is retained still has host_user_id cleared (pending nominee path)', async () => {
    setup('uno', { pending_host_player_id: OTHER_PID })
    keepSeat = true
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].host_player_id).toBe(HOST_PID)
    expect(tables.games[0].host_user_id).toBeNull()
  })

  it('does not clear host_user_id when a different player claimed host in between', async () => {
    setup('uno', { pending_host_player_id: OTHER_PID })
    keepSeat = true
    removal.uno.onCall = () => {
      tables.games[0].host_player_id = OTHER_PID
      tables.games[0].host_user_id = 'user-other'
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].host_user_id).toBe('user-other')
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
    expect(tables.games[0].host_user_id).toBeNull()
  })

  it('an explicit nominee who claimed host during the leave is not overwritten by the automatic nomination', async () => {
    // Pre-check sees no nominee; before the post-removal nomination, the host nominates OTHER and OTHER claims.
    setup('uno')
    removal.uno.onCall = () => {
      Object.assign(tables.games[0], {
        host_player_id: OTHER_PID,
        host_user_id: 'user-other',
        pending_host_player_id: null,
        pending_host_nominated_at: null,
      })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.host_player_id).toBe(OTHER_PID)
    expect(g.host_user_id).toBe('user-other')
    expect(g.pending_host_player_id).toBeNull()
  })

  it('a nomination made meanwhile is kept and the outgoing host_user_id is still cleared', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      Object.assign(tables.games[0], { pending_host_player_id: OTHER_PID, pending_host_nominated_at: 'MANUAL' })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.pending_host_nominated_at).toBe('MANUAL')
    expect(g.host_user_id).toBeNull()
  })

  it('a retained finished host seat does not get a nomination, but host_user_id is cleared', async () => {
    setup('uno')
    keepSeat = true
    removal.uno.onCall = () => {
      tables.games[0].status = 'finished'
    }
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.pending_host_player_id).toBeNull()
    expect(g.host_user_id).toBeNull()
  })

  it('the no-successor end stamps host_ended when this call finished the game', async () => {
    setup('uno')
    tables.players = tables.players.filter((p) => p.id === HOST_PID)
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].status).toBe('finished')
    expect(tables.games[0].result_reason).toBe('host_ended')
  })

  it('the deferred end does not relabel a game another caller finished first', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      tables.players = tables.players.filter((p) => p.id !== OTHER_PID)
      Object.assign(tables.games[0], { status: 'finished', result_reason: null })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].result_reason).toBeNull()
  })

  it('the deferred end of a WAITING game does not touch a game another caller finished first', async () => {
    setup('uno', { status: 'waiting' })
    removal.uno.onCall = () => {
      tables.players = tables.players.filter((p) => p.id !== OTHER_PID)
      Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended', finished_at: 'THEIRS' })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].result_reason).toBe('admin_ended')
    expect(tables.games[0].finished_at).toBe('THEIRS')
  })

  it('the fallback end never finishes a game another player took over during the removal', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      lookupFailBudget = 2
      Object.assign(tables.games[0], { host_player_id: OTHER_PID, host_user_id: 'user-other' })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.status).toBe('active')
    expect(g.result_reason).toBeUndefined()
    expect(g.host_user_id).toBe('user-other')
  })

  it('a retried chess forfeit cleanup removes the seat and clears the departed host linkage', async () => {
    setup('chess', { status: 'finished' })
    tables.chess_sessions = [
      {
        game_id: 'ABCD',
        status: 'finished',
        player_white_id: HOST_PID,
        player_black_id: OTHER_PID,
        winner_player_id: OTHER_PID,
        is_draw: false,
        status_message: 'Host left — Other wins!',
      },
    ]
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    expect(tables.games[0].host_user_id).toBeNull()
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

describe('DELETE /api/players: host-left round cleanup recovery', () => {
  const finishedHostLeft: Row = {
    status: 'finished',
    result_reason: 'host_ended',
    finished_at: '2026-01-01T00:00:00.000Z',
  }

  it('a retried leave finishes the stuck round of the finished session and nothing else', async () => {
    setup('trivia', finishedHostLeft)
    tables.rounds = [
      { id: 'old', game_id: 'ABCD', status: 'active', started_at: '2025-12-31T23:59:00.000Z' },
      { id: 'newer', game_id: 'ABCD', status: 'active', started_at: '2026-01-02T00:00:00.000Z' },
    ]
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.rounds.find((r) => r.id === 'old')?.status).toBe('finished')
    expect(tables.rounds.find((r) => r.id === 'newer')?.status).toBe('active')
  })

  it('a no-successor host-left finish never finishes a round of a newer session', async () => {
    setup('trivia')
    tables.players = tables.players.filter((p) => p.id === HOST_PID)
    tables.rounds = [
      { id: 'old', game_id: 'ABCD', status: 'active', started_at: '2000-01-01T00:00:00.000Z' },
      { id: 'newer', game_id: 'ABCD', status: 'active', started_at: '2999-01-01T00:00:00.000Z' },
    ]
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.rounds.find((r) => r.id === 'old')?.status).toBe('finished')
    expect(tables.rounds.find((r) => r.id === 'newer')?.status).toBe('active')
  })

  it('does not touch rounds of a live game (Play Again) when the host leaves', async () => {
    setup('trivia', { result_reason: 'host_ended' })
    tables.rounds = [{ id: 'live', game_id: 'ABCD', status: 'active', started_at: '2025-12-31T00:00:00.000Z' }]
    await leave()
    expect(tables.rounds[0].status).toBe('active')
  })
})
