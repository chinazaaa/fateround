import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
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
// The bookkeeping owed to a finish committed by the database function: observed, then run for real.
const bookkeeping = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('@/lib/game-finish', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/game-finish')>()
  return {
    ...actual,
    runPostFinishBookkeeping: async (...args: Parameters<typeof actual.runPostFinishBookkeeping>) => {
      bookkeeping.calls.push(args.slice(1))
      return actual.runPostFinishBookkeeping(...args)
    },
  }
})

type Row = Record<string, unknown>
/**
 * A successful removal DELETES the seat row (and games.host_player_id is ON DELETE SET NULL); a retained seat
 * (`keepSeat`: a finisher's row) answers success but stays. `onCall` runs after the removal.
 */
function removed(r: { error: string | null; onCall: (() => void) | null }) {
  if (!r.error && !keepSeat) deletePlayers([HOST_PID])
  r.onCall?.()
  return { error: r.error }
}
/** Reading the roster fails (the pre-removal successor lookup). */
let failSuccessorLookup = false
/** A finished host's seat is retained by the removal helper, so host_player_id keeps naming them. */
let keepSeat = false
/** Deleting a players row fails (the forfeit cleanup cannot remove the seat). */
let failPlayerDelete = false
/** Runs right after a players delete committed (and its ON DELETE SET NULL ran): e.g. a claim lands. */
let afterPlayerDelete: (() => void) | null = null
/** Runs once, right after the first successor lookup (a stalled leave: the world moves on meanwhile). */
let afterSuccessorLookup: (() => void) | null = null
/** Every games update the route attempted: its patch and how many rows it matched. */
let gameUpdateLog: Array<{ patch: Row; matched: number }> = []
/** Every rounds update the route attempted. */
let roundUpdateLog: Row[] = []
/** The retained-seat linkage clear (a games update of host_user_id alone) fails. */
let failLinkageClear = false
let tables: Record<string, Row[]> = {}

/** Deleting players models ON DELETE SET NULL for the games columns that reference them. */
function deletePlayers(ids: unknown[]) {
  tables.players = tables.players.filter((p) => !ids.includes(p.id))
  for (const g of tables.games ?? []) {
    for (const col of ['host_player_id', 'pending_host_player_id']) if (ids.includes(g[col])) g[col] = null
  }
}

/** Tiny stateful Supabase stand-in: equality / is-null / neq filters, update, delete, order, limit. */
function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let patch: Row | null = null
  let deleting = false
  let excludesSomeone = false
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
      if (table === 'rounds') roundUpdateLog.push(patch)
      if (table === 'games' && failLinkageClear && Object.keys(patch).join() === 'host_user_id') {
        return { data: null, error: { message: 'clear failed' } }
      }
      const rows = match()
      for (const r of rows) Object.assign(r, patch)
      if (table === 'games') gameUpdateLog.push({ patch, matched: rows.length })
      return { data: rows.map((r) => ({ ...r })), error: null }
    }
    if (excludesSomeone && failSuccessorLookup) return { data: null, error: { message: 'boom' } }
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
    select: () => api,
    order: (col: string, opts?: { ascending?: boolean }) => ((orderBy = { col, asc: opts?.ascending !== false }), api),
    limit: (n: number) => ((limitTo = n), api),
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

type SettleArgs = {
  p_game_id: string
  p_outgoing_player_id: string
  p_outgoing_host_user_id: string | null
  p_session_started_at: string | null
  p_sessions_played: number | null
  p_track_bookkeeping: boolean
}
/** Number of upcoming settle_host_leave CALLS that fail (a transport error, not a decision). */
let settleFailBudget = 0
/** Every settle_host_leave call: its arguments and whether the leaver's seat row existed when it ran. */
let settleCalls: Array<{ args: SettleArgs; seatExisted: boolean }> = []
const FINISHED_AT = '2026-05-05T05:05:05.000Z'
/**
 * A model of public.settle_host_leave (supabase/migrations/20261203900000_settle_host_leave.sql; the SQL itself is
 * tested against a real database in supabase/tests/settle-host-leave.sql). The route's contract is what is tested
 * here: what it captures before the removal, when it calls, and what it does with each outcome.
 */
function settleModel(a: SettleArgs) {
  const g = tables.games.find((x) => x.id === a.p_game_id.toUpperCase())
  if (!g) return { status: 'game_missing' }
  const out = a.p_outgoing_player_id
  const changed =
    g.sessions_played !== a.p_sessions_played ||
    ((g.session_started_at as string | null) ?? null) !== a.p_session_started_at
  const seatExisted = tables.players.some((p) => p.id === out)
  settleCalls.push({ args: a, seatExisted })
  if (seatExisted) return { status: 'seat_retained', game_status: g.status, session_changed: changed }
  const clear = () => {
    if (
      a.p_outgoing_host_user_id &&
      !changed &&
      g.host_user_id === a.p_outgoing_host_user_id &&
      (g.host_player_id == null || g.host_player_id === out)
    )
      g.host_user_id = null
  }
  if (g.status === 'finished') {
    clear()
    return { status: 'finished', finished_now: false, finished_at: g.finished_at, result_reason: g.result_reason }
  }
  if (g.status !== 'waiting' && g.status !== 'active') return { status: 'settled' }
  const players = tables.players
  const nominee =
    g.pending_host_player_id && players.some((p) => p.id === g.pending_host_player_id && p.game_id === g.id)
  const other = g.host_player_id && g.host_player_id !== out && players.some((p) => p.id === g.host_player_id)
  if (nominee || other) {
    clear()
    return { status: 'settled' }
  }
  const successor = players
    .filter((p) => p.game_id === g.id && !p.is_bot && !p.spectator && p.id !== out)
    .sort((x, y) => (x.joined_at as number) - (y.joined_at as number) || String(x.id).localeCompare(String(y.id)))[0]
  if (successor) {
    Object.assign(g, { pending_host_player_id: successor.id, pending_host_nominated_at: 'NOW', host_user_id: null })
    return { status: 'nominated', nominee: successor.id }
  }
  Object.assign(g, {
    status: 'finished',
    finished_at: FINISHED_AT,
    result_reason: 'host_ended',
    host_user_id: null,
    pending_host_player_id: null,
  })
  return { status: 'finished', finished_now: true, finished_at: FINISHED_AT, result_reason: 'host_ended' }
}

/** Number of upcoming session wipes (the database function) that fail. */
let wipeFailBudget = 0
/** Every wipe the route asked the database for. */
let wipeCalls: Array<{ p_game_id: string; p_finished_at: string; p_kind: string }> = []
/**
 * wipe_finished_session_rows: deletes the session's rows only while the game is still finished with exactly the
 * finished_at the caller names (no created_at comparison at all).
 */
async function rpc(name: string, args: Record<string, unknown>) {
  if (name === 'settle_host_leave') {
    if (settleFailBudget > 0) {
      settleFailBudget--
      return { data: null, error: { message: 'rpc unreachable' } }
    }
    return { data: settleModel(args as SettleArgs), error: null }
  }
  if (name !== 'wipe_finished_session_rows') return { data: true, error: null }
  const a = args as { p_game_id: string; p_finished_at: string; p_kind: string }
  wipeCalls.push(a)
  if (wipeFailBudget > 0) {
    wipeFailBudget--
    return { data: null, error: { message: 'wipe failed' } }
  }
  const game = tables.games[0]
  if (game.status !== 'finished' || game.finished_at !== a.p_finished_at) {
    return { data: { status: 'not_current_session' }, error: null }
  }
  const doomed = a.p_kind === 'anonymous' ? ['anonymous_messages', 'anonymous_room_bans'] : ['codewords_messages']
  for (const table of doomed) tables[table] = []
  return { data: { status: 'wiped' }, error: null }
}
const client = { from: builder, rpc }
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => client }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => client }))

type Del = typeof import('./route').DELETE
let DELETE: Del

const HOST_PID = '00000000-0000-4000-8000-00000000000a'
const OTHER_PID = '00000000-0000-4000-8000-00000000000b'
const THIRD_PID = '00000000-0000-4000-8000-00000000000c'
const TOKEN = 'ABCD1234'
const request = () =>
  new NextRequest('https://x.test/api/players', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gameCode: 'abcd', playerId: HOST_PID, resumeToken: TOKEN }),
  })
const leave = () => DELETE(request())

const player = (id: string, name: string, joined: number, extra: Row = {}): Row => ({
  id,
  game_id: 'ABCD',
  name,
  resume_token: id === HOST_PID ? TOKEN : 'ZZZZ9999',
  is_bot: false,
  spectator: false,
  joined_at: joined,
  ...extra,
})

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
    players: [player(HOST_PID, 'Host', 1), player(OTHER_PID, 'Other', 2)],
  }
}
const hostOnly = (type: string, extra: Row = {}) => {
  setup(type, extra)
  tables.players = tables.players.filter((p) => p.id === HOST_PID)
}

// The route module is large: load it once, outside any single test's timeout, even on a loaded CI runner.
beforeAll(async () => {
  DELETE = (await import('./route')).DELETE
}, 120_000)

beforeEach(() => {
  failSuccessorLookup = false
  keepSeat = false
  failPlayerDelete = false
  afterPlayerDelete = null
  afterSuccessorLookup = null
  gameUpdateLog = []
  roundUpdateLog = []
  failLinkageClear = false
  settleFailBudget = 0
  settleCalls = []
  wipeFailBudget = 0
  wipeCalls = []
  bookkeeping.calls = []
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

  it('a failed (conflicting) leave never nominates a successor (the seat still exists)', async () => {
    setup(gameType)
    fail()
    const res = await leave()
    expect(res.status).toBeGreaterThanOrEqual(400)
    const g = tables.games[0]
    expect(g.pending_host_player_id).toBeNull()
    expect(g.pending_host_nominated_at).toBeNull()
    expect(g.host_user_id).toBe('user-host')
    // The database function was asked and answered that the seat is retained: no handoff.
    expect(settleCalls.map((c) => c.seatExisted)).toEqual([true])
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

  it('the handoff is settled only after the removal ran, once the seat row is gone', async () => {
    setup(gameType)
    let seenDuringRemoval: unknown = 'unset'
    removal[gameType].onCall = () => {
      seenDuringRemoval = tables.games[0].pending_host_player_id
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(seenDuringRemoval).toBeNull()
    expect(settleCalls).toHaveLength(1)
    expect(settleCalls[0].seatExisted).toBe(false)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
    expect(tables.games[0].host_user_id).toBeNull()
  })

  it('a pending nominee is kept and only the outgoing linkage is cleared, after a successful leave', async () => {
    setup(gameType, { pending_host_player_id: OTHER_PID, pending_host_nominated_at: 'T' })
    let during: unknown = 'unset'
    removal[gameType].onCall = () => {
      during = tables.games[0].host_user_id
    }
    await leave()
    expect(during).toBe('user-host')
    expect(tables.games[0].host_user_id).toBeNull()
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
    expect(tables.games[0].pending_host_nominated_at).toBe('T')
  })
})

describe('DELETE /api/players: what the leave captures and hands to the database function', () => {
  it('passes the linkage and session captured BEFORE the removal, whatever the removal changes afterwards', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      Object.assign(tables.games[0], { sessions_played: 7, session_started_at: 'S9', host_user_id: 'user-other' })
    }
    await leave()
    expect(settleCalls).toHaveLength(1)
    expect(settleCalls[0].args).toEqual({
      p_game_id: 'ABCD',
      p_outgoing_player_id: HOST_PID,
      p_outgoing_host_user_id: 'user-host',
      p_session_started_at: 'S1',
      p_sessions_played: 1,
      p_track_bookkeeping: false,
    })
  })

  it('tracks bookkeeping for Word Rush only', async () => {
    setup('word_rush')
    tables.players = [tables.players[0]]
    await leave().catch(() => {})
    // Word Rush has its own removal path; whatever it answers, the flag is derived from the game type.
    for (const c of settleCalls) expect(c.args.p_track_bookkeeping).toBe(true)
  })

  it('a leave by a player who is not the host never settles a handoff', async () => {
    setup('uno')
    const res = await DELETE(
      new NextRequest('https://x.test/api/players', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameCode: 'abcd', playerId: OTHER_PID, resumeToken: 'ZZZZ9999' }),
      })
    )
    expect(res.status).toBe(200)
    expect(settleCalls).toEqual([])
  })

  it('a failed pre-removal roster lookup fails the leave instead of ending a game that still has players', async () => {
    setup('uno')
    failSuccessorLookup = true
    const res = await leave()
    expect(res.status).toBe(500)
    expect(tables.games[0].status).toBe('active')
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(settleCalls).toEqual([])
  })

  it('a roster whose oldest eligible player is last in storage (bots / spectators first) is not read as empty', async () => {
    setup('uno')
    tables.players = [
      tables.players[0],
      player('bot', 'Bot', 0, { is_bot: true }),
      player('spec', 'Spec', 0, { spectator: true }),
      player(THIRD_PID, 'Third', 9),
      tables.players[1],
    ]
    const res = await leave()
    expect(res.status).toBe(200)
    // Not ended up front: the host seat was removed, and the database function nominated the oldest eligible.
    expect(tables.games[0].status).toBe('active')
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
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

describe('DELETE /api/players: retained seats', () => {
  it('an active host whose seat is retained (already in finish_order) is not handed off: still the host', async () => {
    // removeUnoPlayer answers success for a finisher but keeps the row, so a 2xx is NOT proof the seat is gone.
    setup('uno')
    keepSeat = true
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
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

  it('does not undo a host who claimed the finished game meanwhile (the clear is bound to the retained seat)', async () => {
    setup('uno', { pending_host_player_id: OTHER_PID })
    keepSeat = true
    removal.uno.onCall = () => {
      Object.assign(tables.games[0], { status: 'finished', host_player_id: OTHER_PID, host_user_id: 'user-other' })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].host_user_id).toBe('user-other')
  })

  it('the retained-seat clear is bound to the session: a replayed game keeps its linkage', async () => {
    setup('uno')
    keepSeat = true
    removal.uno.onCall = () => {
      Object.assign(tables.games[0], { status: 'finished', sessions_played: 2 })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].host_user_id).toBe('user-host')
    expect(gameUpdateLog.filter((u) => 'host_user_id' in u.patch)).toEqual([
      { patch: { host_user_id: null }, matched: 0 },
    ])
  })

  it('a failed retained-seat clear answers a 500 (the seat still exists, so the same player can repeat the leave)', async () => {
    setup('uno')
    keepSeat = true
    failLinkageClear = true
    removal.uno.onCall = () => {
      tables.games[0].status = 'finished'
    }
    const res = await leave()
    expect(res.status).toBe(500)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(tables.games[0].host_user_id).toBe('user-host')
    failLinkageClear = false
    const retry = await leave()
    expect(retry.status).toBe(200)
    expect(tables.games[0].host_user_id).toBeNull()
  })

  it('a leave that FAILED never clears the retained seat linkage, even on a finished game', async () => {
    setup('uno')
    keepSeat = true
    removal.uno.error = 'Game changed, please try again.'
    removal.uno.onCall = () => {
      tables.games[0].status = 'finished'
    }
    const res = await leave()
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(tables.games[0].host_user_id).toBe('user-host')
    expect(gameUpdateLog.filter((u) => 'host_user_id' in u.patch)).toEqual([])
  })
})

describe('DELETE /api/players: no-successor end and its cleanup', () => {
  it('ends the game BEFORE the removal when nobody else is eligible: reason in the same update, seat retained', async () => {
    hostOnly('uno')
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.status).toBe('finished')
    expect(g.result_reason).toBe('host_ended')
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    // Retained seat of a finished game: routed away after the successful retained leave.
    expect(g.host_user_id).toBeNull()
  })

  it('when everyone else left before the handoff, the database function ends the game and its bookkeeping is owed', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      tables.players = tables.players.filter((p) => p.id !== OTHER_PID)
    }
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.status).toBe('finished')
    expect(g.result_reason).toBe('host_ended')
    expect(g.host_user_id).toBeNull()
    expect(bookkeeping.calls).toEqual([['ABCD', FINISHED_AT, false]])
  })

  it('does not owe bookkeeping (or relabel) for a game another caller finished first', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      Object.assign(tables.games[0], { status: 'finished', result_reason: null, finished_at: 'THEIRS' })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].result_reason).toBeNull()
    expect(tables.games[0].finished_at).toBe('THEIRS')
    expect(bookkeeping.calls).toEqual([])
  })

  it('a retried leave finishes the stuck round of the finished session and nothing else', async () => {
    setup('trivia', { status: 'finished', result_reason: 'host_ended', finished_at: '2026-01-01T00:00:00.000Z' })
    tables.rounds = [
      { id: 'old', game_id: 'ABCD', status: 'active', started_at: '2025-12-31T23:59:00.000Z' },
      { id: 'newer', game_id: 'ABCD', status: 'active', started_at: '2026-01-02T00:00:00.000Z' },
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

  it('a database-function finish cleans up the rounds of the session it ended, and nothing newer', async () => {
    setup('trivia')
    removal.uno.onCall = null
    tables.players = tables.players.filter((p) => p.id === HOST_PID)
    keepSeat = false
    // The leave sees a roster with nobody else but finishes through the pre-removal path; force the post-removal one.
    afterSuccessorLookup = () => Object.assign(tables.games[0], { sessions_played: 2 })
    tables.rounds = [
      { id: 'old', game_id: 'ABCD', status: 'active', started_at: '2000-01-01T00:00:00.000Z' },
      { id: 'newer', game_id: 'ABCD', status: 'active', started_at: '2999-01-01T00:00:00.000Z' },
    ]
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.rounds.find((r) => r.id === 'old')?.status).toBe('finished')
    expect(tables.rounds.find((r) => r.id === 'newer')?.status).toBe('active')
  })
})

describe('DELETE /api/players: the stale session is never finished by the leave', () => {
  const finishAttempts = () => gameUpdateLog.filter((u) => u.patch.status === 'finished')

  it.each([
    ['session_started_at changed (a start or replay)', { status: 'active', session_started_at: 'S2' }],
    ['only sessions_played changed (a replay back to the same start)', { sessions_played: 2 }],
  ])(
    'a pre-removal finish that misses is not forced; the game is decided against the CURRENT row after the removal: %s',
    async (_name, change) => {
      hostOnly('trivia')
      afterSuccessorLookup = () => Object.assign(tables.games[0], change)
      const res = await leave()
      expect(res.status).toBe(200)
      // The stale (inspected-session) finish matched nothing; the end came from the settle step on the current row.
      expect(finishAttempts().map((u) => u.matched)).toEqual([0])
      expect(settleCalls).toHaveLength(1)
      const g = tables.games[0]
      expect(g.status).toBe('finished')
      expect(g.result_reason).toBe('host_ended')
      expect(g.host_user_id).toBeNull()
    }
  )

  it('a waiting game that STARTED between the leave read and the finish (a bot beside the host) is ended, not left hostless', async () => {
    setup('trivia', { status: 'waiting', session_started_at: null })
    tables.players = [tables.players[0], player('bot', 'Bot', 2, { is_bot: true })]
    afterSuccessorLookup = () => Object.assign(tables.games[0], { status: 'active', session_started_at: 'S1' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(finishAttempts().map((u) => u.matched)).toEqual([0])
    expect(tables.games[0].status).toBe('finished')
    expect(tables.games[0].result_reason).toBe('host_ended')
  })

  it.each([
    ['another existing player took over as host', { host_player_id: OTHER_PID }],
    ['an existing player was nominated', { pending_host_player_id: OTHER_PID }],
  ])('a replayed session where %s is left alone: nothing finished, nothing cleaned up', async (_name, taken) => {
    setup('trivia')
    // OTHER is a real roster row, so the taken-over state is the one the database would hold.
    tables.players = [tables.players[0], tables.players[1]]
    tables.rounds = [{ id: 'r', game_id: 'ABCD', status: 'active', started_at: '2999-01-01T00:00:00.000Z' }]
    afterSuccessorLookup = () =>
      Object.assign(tables.games[0], { status: 'active', session_started_at: 'S2', sessions_played: 2, ...taken })
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.status).toBe('active')
    expect(g.result_reason).toBeUndefined()
    expect(g.finished_at).toBeUndefined()
    expect(tables.players.map((p) => p.id)).toContain(OTHER_PID)
    // No cleanup of any kind was attempted for a session the leave never finished.
    expect(roundUpdateLog).toEqual([])
    expect(tables.rounds[0].status).toBe('active')
  })
})

describe('DELETE /api/players: an unreachable settle step is an UNRESOLVED handoff, not a retryable one', () => {
  it('retries the CALL itself (the function is idempotent) and still hands off', async () => {
    setup('uno')
    settleFailBudget = 2
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })

  it('says so honestly when it cannot be reached, and a second DELETE cannot recover it (the seat is gone)', async () => {
    setup('uno')
    settleFailBudget = 99
    const first = await leave()
    expect(first.status).toBe(500)
    const body = (await first.json()) as { error: string; handoff?: string }
    expect(body.handoff).toBe('unresolved')
    expect(body.error).not.toMatch(/try again|retry/i)
    // The leave itself committed; nobody was nominated and the game is live without a host.
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    const g = tables.games[0]
    expect(g.pending_host_player_id).toBeNull()
    expect(g.host_player_id).toBeNull()
    expect(g.status).toBe('active')
    const attempts = settleCalls.length

    // What a second DELETE with the same resume token actually does: it cannot authenticate, so it neither settles
    // the handoff nor changes anything. Recovery is a manual host transfer, or the idle reaper ending the game.
    const second = await leave()
    expect(second.status).toBeGreaterThanOrEqual(400)
    expect(second.status).toBeLessThan(500)
    expect(settleCalls).toHaveLength(attempts)
    expect(tables.games[0].pending_host_player_id).toBeNull()
  })

  it('does not replace a failed removal response with the handoff message', async () => {
    setup('uno')
    removal.uno.error = 'Game changed, please try again.'
    settleFailBudget = 99
    const res = await leave()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; handoff?: string }
    expect(body.handoff).toBeUndefined()
    expect(body.error).toContain('Game changed')
  })
})

describe('DELETE /api/players: retained host leave (forfeit games)', () => {
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

  it('a retried forfeit cleanup removes the seat and clears the departed host linkage (both host fields null)', async () => {
    chessFinished()
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    // ON DELETE SET NULL cleared the seat reference; the settle step cleared the user linkage.
    expect(tables.games[0].host_player_id).toBeNull()
    expect(tables.games[0].host_user_id).toBeNull()
  })

  it('a failed forfeit-cleanup seat delete clears nothing (the seat exists) and the repeat can still resolve it', async () => {
    chessFinished()
    failPlayerDelete = true
    const res = await leave()
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(tables.games[0].host_user_id).toBe('user-host')
    expect(tables.games[0].host_player_id).toBe(HOST_PID)
    expect(gameUpdateLog.filter((u) => 'host_user_id' in u.patch)).toEqual([])
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
    'does not undo a replacement host who took over %s after the leave captured the linkage, before the settle step',
    async (_name, rawClaim) => {
      const claim = rawClaim as { host_player_id?: string; host_user_id?: string }
      chessFinished()
      afterPlayerDelete = () => Object.assign(tables.games[0], claim)
      const res = await leave()
      expect(res.status).toBe(200)
      expect(settleCalls[0].args.p_outgoing_host_user_id).toBe('user-host')
      expect(tables.games[0].host_player_id).toBe(claim.host_player_id ?? null)
      expect(tables.games[0].host_user_id).toBe(claim.host_user_id ?? 'user-host')
    }
  )

  const finishedAt = '2026-01-01T00:00:00.000Z'
  const hostLeft = { status: 'finished', result_reason: 'host_ended', finished_at: finishedAt }

  it.each([
    ['anonymous_messages', ['anonymous_messages', 'anonymous_room_bans'], 'anonymous'],
    ['secret_message', ['anonymous_messages', 'anonymous_room_bans'], 'anonymous'],
    ['codewords', ['codewords_messages'], 'codewords'],
  ])(
    '%s: a later leave of the retained host finishes the pending wipe, decided in the database for the finished session',
    async (type, wiped, kind) => {
      setup(type, hostLeft)
      for (const t of wiped) {
        // A row stamped AFTER the finished_at (clock skew) must not survive the wipe either.
        tables[t] = [
          { id: `${t}-old`, game_id: 'ABCD', created_at: '2025-12-31T23:59:00.000Z' },
          { id: `${t}-late`, game_id: 'ABCD', created_at: '2026-01-02T00:00:00.000Z' },
        ]
      }
      const res = await leave()
      expect(res.status).toBe(200)
      expect(wipeCalls).toEqual([{ p_game_id: 'ABCD', p_finished_at: finishedAt, p_kind: kind }])
      for (const t of wiped) expect(tables[t]).toEqual([])
    }
  )

  it('a failing session wipe fails the leave (repeatable: the seat is retained), and the next leave finishes it', async () => {
    setup('anonymous_messages', hostLeft)
    tables.anonymous_messages = [{ id: 'a', game_id: 'ABCD', created_at: '2025-12-31T23:59:00.000Z' }]
    wipeFailBudget = 1
    const first = await leave()
    expect(first.status).toBe(500)
    expect(tables.anonymous_messages).toHaveLength(1)
    const retry = await leave()
    expect(retry.status).toBe(200)
    expect(tables.anonymous_messages).toEqual([])
  })

  it('never wipes while the game is live again (Play Again) or was finished for another reason', async () => {
    for (const extra of [{ status: 'active' }, { result_reason: 'admin_ended' }]) {
      setup('codewords', { ...hostLeft, ...extra })
      tables.codewords_messages = [{ id: 'm', game_id: 'ABCD', created_at: '2025-12-31T23:59:00.000Z' }]
      await leave()
      expect(tables.codewords_messages).toHaveLength(1)
    }
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
