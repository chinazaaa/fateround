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
/**
 * A successful removal DELETES the seat row (and games.host_player_id is ON DELETE SET NULL); a retained seat
 * (`keepSeat`: a finisher's row) answers success but stays. `onCall` runs after the removal.
 */
function removed(r: { error: string | null; onCall: (() => void) | null }) {
  if (!r.error && !keepSeat) {
    deletePlayers([HOST_PID])
  }
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
/** Whether the outgoing host's seat row still existed when a nomination write ran (it must not). */
let hostSeatAtNomination: boolean | null = null
/** Runs after an errored nomination write (e.g. the roster moves between two attempts). */
let afterNominationError: (() => void) | null = null
/** Deleting a players row fails (the forfeit cleanup cannot remove the seat). */
let failPlayerDelete = false
/** Updates that carry only a result_reason (a follow-up relabel) fail: the reason must ride the finish itself. */
let failReasonOnlyUpdates = false
/** The guarded finish commits but its response is lost (transport error). */
let finishCommitsButErrors = false
/** Runs right after a players delete committed (and its ON DELETE SET NULL ran): e.g. a claim lands. */
let afterPlayerDelete: (() => void) | null = null
/** Number of upcoming seat-existence reads (players select 'id' by id alone) that fail. */
let seatReadFailBudget = 0
/** Reads of games.host_player_id alone (the fallback seat signal) fail. */
let hostRefReadFails = false
/** Runs once, right after the first successor lookup (a stalled leave: the world moves on meanwhile). */
let afterSuccessorLookup: (() => void) | null = null
/** Every games update the route attempted: its patch and how many rows it matched. */
let gameUpdateLog: Array<{ patch: Row; matched: number }> = []
let tables: Record<string, Row[]> = {}

/** Deleting players models ON DELETE SET NULL for the games columns that reference them. */
function deletePlayers(ids: unknown[]) {
  tables.players = tables.players.filter((p) => !ids.includes(p.id))
  for (const g of tables.games ?? []) {
    for (const col of ['host_player_id', 'pending_host_player_id']) if (ids.includes(g[col])) g[col] = null
  }
}

/** Tiny stateful Supabase stand-in: equality / is-null / neq filters, update, delete. */
function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let patch: Row | null = null
  let deleting = false
  let excludesSomeone = false
  let selectCols: string | undefined
  let idOnly = true
  let orderBy: { col: string; asc: boolean } | null = null
  let limitTo: number | null = null
  const match = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const run = async () => {
    await Promise.resolve()
    if (deleting) {
      if (table === 'players' && failPlayerDelete) return { data: null, error: { message: 'delete failed' } }
      const doomed = match()
      if (table === 'players') {
        deletePlayers(doomed.map((r) => r.id))
        afterPlayerDelete?.()
      } else {
        tables[table] = (tables[table] ?? []).filter((r) => !doomed.includes(r))
      }
      return { data: null, error: null }
    }
    if (patch) {
      if (table === 'games' && 'pending_host_player_id' in patch) {
        hostSeatAtNomination = tables.players.some((p) => p.id === HOST_PID)
      }
      if (table === 'games' && failReasonOnlyUpdates && Object.keys(patch).join() === 'result_reason') {
        return { data: null, error: { message: 'relabel failed' } }
      }
      if (table === 'games' && patch.status === 'finished' && finishCommitsButErrors) {
        finishCommitsButErrors = false
        for (const r of match()) Object.assign(r, patch)
        return { data: null, error: { message: 'response lost' } }
      }
      if (table === 'games' && 'pending_host_player_id' in patch && nominationFailBudget > 0) {
        nominationFailBudget--
        if (nominationCommitsOnError) for (const r of match()) Object.assign(r, patch)
        afterNominationError?.()
        return { data: null, error: { message: 'boom' } }
      }
      const rows = match()
      for (const r of rows) Object.assign(r, patch)
      if (table === 'games') gameUpdateLog.push({ patch, matched: rows.length })
      return { data: rows.map((r) => ({ ...r })), error: null }
    }
    if (table === 'players' && selectCols === 'id' && idOnly && !excludesSomeone && seatReadFailBudget > 0) {
      seatReadFailBudget--
      return { data: null, error: { message: 'seat read failed' } }
    }
    if (table === 'games' && selectCols === 'host_player_id' && hostRefReadFails) {
      return { data: null, error: { message: 'host ref read failed' } }
    }
    if (excludesSomeone && (failSuccessorLookup || lookupFailBudget > 0)) {
      if (!failSuccessorLookup) lookupFailBudget--
      return { data: null, error: { message: 'boom' } }
    }
    let out = match().map((r) => ({ ...r }))
    // The roster read relies on the database ordering and limiting it; model both.
    if (orderBy) {
      const { col, asc } = orderBy
      out = out.sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1))
    }
    if (limitTo !== null) out = out.slice(0, limitTo)
    if (excludesSomeone && afterSuccessorLookup) {
      const hook = afterSuccessorLookup
      afterSuccessorLookup = null
      hook()
    }
    return { data: out, error: null }
  }
  const api: Record<string, unknown> = {
    select: (cols?: string) => ((selectCols = cols), api),
    order: (col: string, opts?: { ascending?: boolean }) => ((orderBy = { col, asc: opts?.ascending !== false }), api),
    limit: (n: number) => ((limitTo = n), api),
    eq: (k: string, v: unknown) => ((idOnly = idOnly && k === 'id'), filters.push((r) => r[k] === v), api),
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
        session_started_at: 'S1',
        sessions_played: 1,
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
  hostSeatAtNomination = null
  afterNominationError = null
  failPlayerDelete = false
  afterPlayerDelete = null
  seatReadFailBudget = 0
  hostRefReadFails = false
  afterSuccessorLookup = null
  gameUpdateLog = []
  failReasonOnlyUpdates = false
  finishCommitsButErrors = false
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
    // The nomination ran only once the outgoing host's seat row was really gone.
    expect(hostSeatAtNomination).toBe(false)
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
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
      lookupFailBudget = 3
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
      nominationFailBudget = 3
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
      nominationFailBudget = 3
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

  it('an active host whose seat is retained (already in finish_order) is not handed off: still the host', async () => {
    // removeUnoPlayer answers success for a finisher but keeps the row, so a 2xx is NOT proof the seat is gone.
    setup('uno')
    keepSeat = true
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(hostSeatAtNomination).toBeNull()
    const g = tables.games[0]
    expect(g.pending_host_player_id).toBeNull()
    expect(g.host_player_id).toBe(HOST_PID)
    expect(g.host_user_id).toBe('user-host')
    expect(g.status).toBe('active')
  })

  it('an active host whose seat is retained keeps an existing nominee untouched too', async () => {
    setup('uno', { pending_host_player_id: OTHER_PID, pending_host_nominated_at: 'T' })
    keepSeat = true
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].host_player_id).toBe(HOST_PID)
    expect(tables.games[0].host_user_id).toBe('user-host')
    expect(tables.games[0].pending_host_nominated_at).toBe('T')
  })

  it('a retained finished Uno host seat (the game finished with this leave) is routed away, never nominated', async () => {
    setup('uno')
    keepSeat = true
    removal.uno.onCall = () => {
      tables.games[0].status = 'finished'
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    const g = tables.games[0]
    expect(g.host_player_id).toBe(HOST_PID)
    expect(g.pending_host_player_id).toBeNull()
    expect(g.host_user_id).toBeNull()
  })

  it('does not clear host_user_id when a different player claimed host in between', async () => {
    setup('uno', { pending_host_player_id: OTHER_PID })
    keepSeat = true
    removal.uno.onCall = () => {
      Object.assign(tables.games[0], { status: 'finished', host_player_id: OTHER_PID, host_user_id: 'user-other' })
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
      lookupFailBudget = 3
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
    // ON DELETE SET NULL cleared the seat reference; the route cleared the user linkage.
    expect(tables.games[0].host_player_id).toBeNull()
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

const THIRD_PID = '00000000-0000-4000-8000-00000000000c'
const addThird = () =>
  tables.players.push({
    id: THIRD_PID,
    game_id: 'ABCD',
    name: 'Third',
    resume_token: 'YYYY8888',
    is_bot: false,
    spectator: false,
    joined_at: 3,
  })

describe('DELETE /api/players: host handoff is one guarded step', () => {
  it('re-selects the successor from the current roster on every attempt (a nominee who left is never reused)', async () => {
    setup('uno')
    addThird()
    nominationFailBudget = 1
    afterNominationError = () => {
      // OTHER (the first pick) leaves between the attempts: a stale id would violate the nominee foreign key.
      tables.players = tables.players.filter((p) => p.id !== OTHER_PID)
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].pending_host_player_id).toBe(THIRD_PID)
    expect(tables.games[0].status).toBe('active')
  })

  it('ends the game only when no eligible successor remains after the roster moved', async () => {
    setup('uno')
    nominationFailBudget = 1
    afterNominationError = () => {
      tables.players = tables.players.filter((p) => p.id !== OTHER_PID)
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].status).toBe('finished')
    expect(tables.games[0].pending_host_player_id).toBeNull()
  })

  it('the fallback finish refuses to end a game that has a valid nominee (decided in the one guarded update)', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      // Lookups keep failing, and a manual transfer nominates meanwhile; the seat delete nulled host_player_id,
      // so the host guard alone would let the finish through.
      lookupFailBudget = 3
      Object.assign(tables.games[0], { pending_host_player_id: OTHER_PID, pending_host_nominated_at: 'MANUAL' })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.status).toBe('active')
    expect(g.pending_host_player_id).toBe(OTHER_PID)
    expect(g.host_user_id).toBeNull()
  })

  it('writes the host_ended reason in the finishing update itself, never as a follow-up write', async () => {
    setup('uno')
    tables.players = tables.players.filter((p) => p.id === HOST_PID)
    failReasonOnlyUpdates = true
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].status).toBe('finished')
    expect(tables.games[0].result_reason).toBe('host_ended')
  })

  it('a finish that commits but loses its response is read back, and the same leave still cleans up', async () => {
    setup('trivia')
    tables.players = tables.players.filter((p) => p.id === HOST_PID)
    tables.rounds = [{ id: 'r', game_id: 'ABCD', status: 'active', started_at: '2000-01-01T00:00:00.000Z' }]
    finishCommitsButErrors = true
    const res = await leave()
    // The reason rode the finishing update, so the committed finish is classified without any follow-up write.
    expect(res.status).toBe(200)
    expect(tables.games[0].status).toBe('finished')
    expect(tables.games[0].result_reason).toBe('host_ended')
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(tables.rounds[0].status).toBe('finished')
  })
})

describe('DELETE /api/players: retained host leave', () => {
  const chessFinished = () => {
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
  }

  it('a failed forfeit-cleanup seat delete leaves the host linkage untouched so the repeat can still resolve it', async () => {
    chessFinished()
    failPlayerDelete = true
    const res = await leave()
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(tables.games[0].host_user_id).toBe('user-host')
    expect(tables.games[0].host_player_id).toBe(HOST_PID)
    failPlayerDelete = false
    const retry = await leave()
    expect(retry.status).toBe(200)
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    expect(tables.games[0].host_player_id).toBeNull()
    expect(tables.games[0].host_user_id).toBeNull()
  })

  it.each([
    ['host_player_id and host_user_id', { host_player_id: OTHER_PID, host_user_id: 'user-other' }],
    ['host_player_id only (the user linkage still reads as the outgoing host)', { host_player_id: OTHER_PID }],
    ['host_user_id only (the seat reference still reads null)', { host_user_id: 'user-other' }],
  ])(
    'does not undo a replacement host who took over %s after the leave captured the linkage, before the clear',
    async (_name, rawClaim) => {
      const claim = rawClaim as { host_player_id?: string; host_user_id?: string }
      chessFinished()
      // Ownership changes AFTER the route captured host_user_id and deleted the seat, BEFORE it clears.
      afterPlayerDelete = () => Object.assign(tables.games[0], claim)
      const before = { ...tables.games[0] }
      const res = await leave()
      expect(res.status).toBe(200)
      // The clear was attempted, matched nothing, and the replacement linkage survived.
      expect(gameUpdateLog).toContainEqual({ patch: { host_user_id: null }, matched: 0 })
      expect(tables.games[0].host_player_id).toBe(claim.host_player_id ?? null)
      expect(tables.games[0].host_user_id).toBe(claim.host_user_id ?? before.host_user_id)
    }
  )

  it('the clear really does apply when nobody claimed (the same attempt matches the departed host)', async () => {
    chessFinished()
    await leave()
    expect(gameUpdateLog).toContainEqual({ patch: { host_user_id: null }, matched: 1 })
  })

  const finishedAt = '2026-01-01T00:00:00.000Z'
  const before = '2025-12-31T23:59:00.000Z'
  const after = '2026-01-02T00:00:00.000Z'
  const hostLeft = { status: 'finished', result_reason: 'host_ended', finished_at: finishedAt }

  it.each([
    ['anonymous_messages', ['anonymous_messages', 'anonymous_room_bans']],
    ['secret_message', ['anonymous_messages', 'anonymous_room_bans']],
    ['codewords', ['codewords_messages']],
  ])(
    '%s: a later leave of the retained host finishes the pending wipe, fenced to the finished session',
    async (type, wiped) => {
      setup(type, hostLeft)
      for (const t of wiped) {
        tables[t] = [
          { id: `${t}-old`, game_id: 'ABCD', created_at: before },
          { id: `${t}-replay`, game_id: 'ABCD', created_at: after },
        ]
      }
      const res = await leave()
      expect(res.status).toBe(200)
      for (const t of wiped) expect(tables[t].map((r) => r.id)).toEqual([`${t}-replay`])
    }
  )

  it('never wipes while the game is live again (Play Again) or was finished for another reason', async () => {
    for (const extra of [{ status: 'active' }, { result_reason: 'admin_ended' }]) {
      setup('codewords', { ...hostLeft, ...extra })
      tables.codewords_messages = [{ id: 'm', game_id: 'ABCD', created_at: before }]
      await leave()
      expect(tables.codewords_messages).toHaveLength(1)
    }
  })
})

describe('DELETE /api/players: seat state is resolved, never guessed', () => {
  it('a transient seat read failure is retried and the handoff still happens', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      seatReadFailBudget = 2
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })

  it('a persistently failing seat read falls back to games.host_player_id: seat deleted means handoff', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      seatReadFailBudget = 99
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })

  it('a persistently failing seat read with a retained seat (host_player_id still the host) nominates nobody', async () => {
    setup('uno')
    keepSeat = true
    removal.uno.onCall = () => {
      seatReadFailBudget = 99
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].pending_host_player_id).toBeNull()
    expect(tables.games[0].host_player_id).toBe(HOST_PID)
    expect(tables.games[0].host_user_id).toBe('user-host')
  })

  it('when the seat state cannot be established at all, the leave surfaces a retryable 500 and writes nothing', async () => {
    setup('uno')
    hostRefReadFails = true
    removal.uno.onCall = () => {
      seatReadFailBudget = 99
    }
    const res = await leave()
    expect(res.status).toBe(500)
    const g = tables.games[0]
    expect(g.pending_host_player_id).toBeNull()
    expect(g.status).toBe('active')
    expect(g.host_user_id).toBe('user-host')
  })
})

describe('DELETE /api/players: the host-left finish is bound to the session the leave inspected', () => {
  it('a stalled leave never finishes (or cleans up) a session that was replayed under the same game id', async () => {
    setup('trivia')
    tables.players = tables.players.filter((p) => p.id === HOST_PID)
    tables.rounds = [{ id: 'r', game_id: 'ABCD', status: 'active', started_at: '2999-01-01T00:00:00.000Z' }]
    // The leave read session S1 / sessions_played 1 and found no successor; before its finish lands the game is
    // finished, replayed (Play Again bumps sessions_played, clears and then re-sets the session start) and live.
    afterSuccessorLookup = () =>
      Object.assign(tables.games[0], { status: 'active', session_started_at: 'S2', sessions_played: 2 })
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.status).toBe('active')
    expect(g.result_reason).toBeUndefined()
    expect(g.finished_at).toBeUndefined()
    expect(tables.rounds[0].status).toBe('active')
  })

  it('a replay that restored the same session_started_at is still told apart by sessions_played', async () => {
    setup('trivia')
    tables.players = tables.players.filter((p) => p.id === HOST_PID)
    afterSuccessorLookup = () => Object.assign(tables.games[0], { sessions_played: 2 })
    await leave()
    expect(tables.games[0].status).toBe('active')
    expect(tables.games[0].result_reason).toBeUndefined()
  })
})

describe('DELETE /api/players: roster ordering', () => {
  it('nominates the OLDEST eligible player even when storage order differs', async () => {
    setup('uno')
    // Storage order: host, newest, oldest.
    tables.players = [
      tables.players[0],
      {
        id: THIRD_PID,
        game_id: 'ABCD',
        name: 'Third',
        resume_token: 'YYYY8888',
        is_bot: false,
        spectator: false,
        joined_at: 9,
      },
      tables.players[1],
    ]
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })

  it('skips bots and spectators even when they are the oldest', async () => {
    setup('uno')
    tables.players = [
      tables.players[0],
      { id: 'bot', game_id: 'ABCD', name: 'Bot', resume_token: 'B', is_bot: true, spectator: false, joined_at: 0 },
      { id: 'spec', game_id: 'ABCD', name: 'Spec', resume_token: 'S', is_bot: false, spectator: true, joined_at: 0 },
      tables.players[1],
    ]
    await leave()
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })
})

describe('PATCH /api/players on a finished Codewords game', () => {
  it('is still rejected: only DELETE may reach the finished-game leave branch', async () => {
    setup('codewords', { status: 'finished' })
    const { PATCH } = await import('./route')
    const res = await PATCH(
      new NextRequest('https://x.test/api/players', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameCode: 'abcd', playerId: HOST_PID, playerName: 'Renamed', resumeToken: TOKEN }),
      })
    )
    expect(res.status).toBe(400)
    expect(tables.players.find((p) => p.id === HOST_PID)?.name).toBe('Host')
  })
})
