import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimit: async () => null,
}))
vi.mock('@/lib/identity-server', () => ({ getProfileFromRequest: async () => null }))

const removal = vi.hoisted(() => ({
  reconcileTeams: [] as Array<string | null>,
  reconcileError: null as string | null,
  uno: { error: null as string | null, onCall: null as (() => void) | null },
  scrabble: { error: null as string | null, onCall: null as (() => void) | null },
}))
vi.mock('@/lib/uno', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/uno')>()),
  removeUnoPlayer: async (_s: unknown, _g: string, playerId: string) => removed(removal.uno, playerId),
}))
vi.mock('@/lib/scrabble', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/scrabble')>()),
  removeScrabblePlayer: async (_s: unknown, _g: string, playerId: string) => removed(removal.scrabble, playerId),
}))
vi.mock('@/lib/codewords', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/codewords')>()),
  // The real reconciler is a no-op without a team: it only fails when the route really captured the departing team.
  reconcileCodewordsTeamAfterRemoval: async (_s: unknown, _g: string, team: string | null) => {
    removal.reconcileTeams.push(team)
    return { error: team === null ? null : removal.reconcileError, outcome: { ended: false } }
  },
}))
// Word Rush's own per-player bookkeeping is not what these tests are about: the roster change the removal made (and
// whether it ENDED the game) is scripted, and the roster revert is recorded.
const wordRush = vi.hoisted(() => ({
  sync: {} as { rollback?: unknown; ownFinish?: boolean },
  syncCalls: 0,
  reverts: [] as unknown[],
  restore: 'restored' as string,
  /** Runs just before the sync reads the game (a start / replay lands in between). */
  beforeSync: null as (() => void) | null,
  games: (() => []) as () => unknown[],
  /** Runs just before the restore decides (another removal may delete the seat in between). */
  beforeRestore: null as (() => void) | null,
  results: [] as string[],
  /** Pinned answers (e.g. `failed`: the database cannot be reached) instead of the seat-decided ones. */
  forced: null as string | null,
}))
vi.mock('@/lib/word-rush-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/word-rush-server')>()),
  syncWordRushAfterPlayerRemoved: async () => {
    wordRush.syncCalls++
    wordRush.beforeSync?.()
    wordRush.beforeSync = null
    // Like the real function: the identity of the game session it was decided against is its OWN read.
    const g = wordRush.games()[0] as Record<string, unknown> | undefined
    return {
      ...(g
        ? { gameSession: { startedAt: g.session_started_at ?? null, sessionsPlayed: g.sessions_played ?? null } }
        : {}),
      ...wordRush.sync,
    }
  },
  revertWordRushRosterAfterFailedPlayerDelete: async (_s: unknown, _g: string, snapshot: unknown) => {
    wordRush.reverts.push(snapshot)
    wordRush.beforeRestore?.()
    wordRush.beforeRestore = null
    // The database is the arbiter: a player with no seat is never put back.
    const seated = tables.players.some((p) => p.id === (snapshot as { removed_player_id: string }).removed_player_id)
    const result = wordRush.forced ?? (seated ? wordRush.restore : 'no_seat')
    wordRush.results.push(result)
    return result
  },
}))
// The bookkeeping a host-left finish owes is resumed by claiming its durable marker (recoverFinishBookkeeping).
const bookkeeping = vi.hoisted(() => ({
  calls: [] as string[],
  state: 'none' as string,
  throws: false,
  /** Runs while the bookkeeping is in progress (the world moves on: a replay that ends again). */
  during: null as (() => void) | null,
}))
vi.mock('@/lib/game-finish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/game-finish')>()),
  recoverFinishBookkeeping: async (_s: unknown, gameId: string) => {
    bookkeeping.calls.push(gameId)
    bookkeeping.during?.()
    if (bookkeeping.throws) throw new Error('recovery threw')
    return { state: bookkeeping.state, ...(bookkeeping.state === 'error' ? { error: 'claim failed' } : {}) }
  },
}))

type Row = Record<string, unknown>
/**
 * A successful removal DELETES the seat row (and games.host_player_id is ON DELETE SET NULL); a retained seat
 * (`keepSeat`: a finisher's row) answers success but stays. `onCall` runs after the removal.
 */
function removed(r: { error: string | null; onCall: (() => void) | null }, playerId: string) {
  removalCalls++
  if (!r.error && !keepSeat) deletePlayers([playerId])
  r.onCall?.()
  // The real engines report a seat they kept (a finisher's row) explicitly.
  return { error: r.error, ...(keepSeat && !r.error ? { retained: true } : {}) }
}
/** The pre-removal end_game_if_host_alone call fails (a transport error). */
let failEndCheck = false
/** A finished host's seat is retained by the removal helper, so host_player_id keeps naming them. */
let keepSeat = false
/** Deleting a players row fails (the forfeit cleanup cannot remove the seat). */
let failPlayerDelete = false
/** A players DELETE commits and then reports an error (its response was lost). */
let playerDeleteLosesResponse = false
/** Reading the players table fails (the read-back after an ambiguous delete cannot tell what happened). */
let failPlayersRead = false
/** The games read that captures the Word Rush session identity before the roster change fails. */
let failGamesSessionRead = false
/** Runs right after a players delete committed (and its ON DELETE SET NULL ran): e.g. a claim lands. */
let afterPlayerDelete: (() => void) | null = null
/** Runs once, right after the FIRST games read (the one that authorises the leave). */
let afterFirstGamesRead: (() => void) | null = null
/** Runs once, just BEFORE the seat delete (remove_player_if_game_open): a finish lands after the status was read. */
let beforeSeatDelete: (() => void) | null = null
/** Runs before EVERY seat delete attempt (a game that keeps changing under the leave). */
let beforeEverySeatDelete: (() => void) | null = null
/** Runs once, just BEFORE end_game_if_host_alone is evaluated (a stalled leave: the world moves on meanwhile). */
let beforeEndCheck: (() => void) | null = null
/** Every games update the route attempted: its patch and how many rows it matched. */
let gameUpdateLog: Array<{ patch: Row; matched: number }> = []
/** Every rounds update the route attempted. */
let roundUpdateLog: Row[] = []
/** The retained-seat linkage clear (a games update of host_user_id alone) fails. */
let failLinkageClear = false
/** How many times a per-game removal helper ran. */
let removalCalls = 0
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
  let selectedCols: string | undefined
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
        if (playerDeleteLosesResponse) return { data: null, error: { message: 'response lost' } }
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
    if (table === 'players' && failPlayersRead) return { data: null, error: { message: 'read failed' } }
    if (table === 'games' && failGamesSessionRead && selectedCols === 'session_started_at, sessions_played') {
      return { data: null, error: { message: 'read failed' } }
    }
    let out = match().map((r) => ({ ...r }))
    // The roster read relies on the database ordering and limiting it; model both.
    if (orderBy) {
      const { col, asc } = orderBy
      out = out.sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1))
    }
    if (limitTo !== null) out = out.slice(0, limitTo)
    if (table === 'games' && afterFirstGamesRead) {
      const hook = afterFirstGamesRead
      afterFirstGamesRead = null
      hook()
    }
    return { data: out, error: null }
  }
  const api: Record<string, unknown> = {
    select: (cols?: string) => ((selectedCols = cols), api),
    order: (col: string, opts?: { ascending?: boolean }) => ((orderBy = { col, asc: opts?.ascending !== false }), api),
    limit: (n: number) => ((limitTo = n), api),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), api),
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
/** Every end_game_if_host_alone answer. */
let endCalls: Array<{ status: string; finished_now?: boolean }> = []
/** Number of upcoming settle_host_leave CALLS that fail (a transport error, not a decision). */
let settleFailBudget = 0
/** Every settle_host_leave call: its arguments and whether the leaver's seat row existed when it ran. */
let settleCalls: Array<{ args: SettleArgs; seatExisted: boolean }> = []
/** Every settle_host_leave ATTEMPT, recorded at RPC entry (before any failure budget), so an unreachable call still counts. */
let settleAttempts: SettleArgs[] = []
/** The seat delete (remove_player_if_game_open) COMMITS but its response is lost. */
let deleteCommitsButErrors = false
/** Every remove_player_if_game_open call's arguments. */
let removeArgs: Array<Record<string, unknown>> = []
/** The participant name each ACCEPTED removal deleted together with the seat (joiners mode). */
let participantDeletes: Array<string | null> = []
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
  // Eligible like the SQL: in this game, not a bot, not a spectator.
  const nominee =
    g.pending_host_player_id &&
    players.some(
      (p) => p.id === g.pending_host_player_id && p.game_id === g.id && p.is_bot === false && p.spectator === false
    )
  const other = g.host_player_id && g.host_player_id !== out && players.some((p) => p.id === g.host_player_id)
  if (nominee || other) {
    clear()
    return { status: 'settled' }
  }
  const replayed = g.sessions_played !== a.p_sessions_played
  const successor = players
    .filter((p) => p.game_id === g.id && !p.is_bot && !p.spectator && p.id !== out)
    .sort((x, y) => (x.joined_at as number) - (y.joined_at as number) || String(x.id).localeCompare(String(y.id)))[0]
  if (successor) {
    Object.assign(g, {
      pending_host_player_id: successor.id,
      pending_host_nominated_at: 'NOW',
      host_user_id: g.host_user_id === a.p_outgoing_host_user_id && !changed ? null : g.host_user_id,
    })
    return { status: 'nominated', nominee: successor.id }
  }
  // A replay is another session: an older leave never finishes it.
  if (replayed) return { status: 'settled', session_changed: true }
  Object.assign(g, {
    status: 'finished',
    finished_at: FINISHED_AT,
    result_reason: 'host_ended',
    host_user_id: g.host_user_id === a.p_outgoing_host_user_id && !changed ? null : g.host_user_id,
    pending_host_player_id: null,
  })
  return { status: 'finished', finished_now: true, finished_at: FINISHED_AT, result_reason: 'host_ended' }
}

/** A model of public.end_game_if_host_alone (same migration; tested for real in supabase/tests/). */
function endModel(a: {
  p_game_id: string
  p_outgoing_player_id: string
  p_session_started_at: string | null
  p_sessions_played: number | null
}) {
  const g = tables.games.find((x) => x.id === a.p_game_id.toUpperCase())
  if (!g) return { status: 'game_missing' }
  if (g.status === 'finished') {
    return g.result_reason === 'host_ended'
      ? { status: 'finished', finished_now: false, finished_at: g.finished_at }
      : { status: 'continue', game_status: g.status }
  }
  const eligible = tables.players.some(
    (p) => p.game_id === g.id && !p.is_bot && !p.spectator && p.id !== a.p_outgoing_player_id
  )
  // A pending nominee blocks the end only while it is ELIGIBLE (same rule as settle_host_leave).
  const nomineeEligible = tables.players.some(
    (p) => p.id === g.pending_host_player_id && p.game_id === g.id && !p.is_bot && !p.spectator
  )
  if (
    (g.status !== 'waiting' && g.status !== 'active') ||
    g.sessions_played !== a.p_sessions_played ||
    ((g.session_started_at as string | null) ?? null) !== a.p_session_started_at ||
    g.host_player_id !== a.p_outgoing_player_id ||
    nomineeEligible ||
    eligible
  ) {
    return { status: 'continue', game_status: g.status }
  }
  Object.assign(g, {
    status: 'finished',
    finished_at: FINISHED_AT,
    result_reason: 'host_ended',
    pending_host_player_id: null,
  })
  return { status: 'finished', finished_now: true, finished_at: FINISHED_AT }
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
  if (name === 'remove_player_if_game_open') {
    const hook = beforeSeatDelete
    beforeSeatDelete = null
    hook?.()
    ;(beforeEverySeatDelete as (() => void) | null)?.()
    if (failPlayerDelete) return { data: null, error: { message: 'delete failed' } }
    const a = args as {
      p_game_id: string
      p_player_id: string
      p_own_finish?: boolean
      p_session_started_at?: string | null
      p_sessions_played?: number | null
      p_participant_name?: string
    }
    removeArgs.push(a)
    const g = tables.games.find((x) => x.id === a.p_game_id.toUpperCase())
    if (!g) return { data: { status: 'game_missing' }, error: null }
    // A finish this leave caused is deleted through only while the game is still the inspected session.
    const own =
      a.p_own_finish === true &&
      (g.result_reason ?? null) === null &&
      (g.finish_bookkeeping ?? null) === null &&
      g.sessions_played === (a.p_sessions_played ?? null) &&
      ((g.session_started_at as string | null) ?? null) === (a.p_session_started_at ?? null)
    if (
      g.status !== 'finished' &&
      (a as { p_check_session?: boolean }).p_check_session &&
      (g.sessions_played !== (a.p_sessions_played ?? null) ||
        ((g.session_started_at as string | null) ?? null) !== (a.p_session_started_at ?? null))
    ) {
      return { data: { status: 'session_changed' }, error: null }
    }
    const blocked = g.status === 'finished' && !own
    // The SQL decides first and applies only the writes it permits; a lost response replaces only the ANSWER.
    if (blocked) {
      return deleteCommitsButErrors
        ? { data: null, error: { message: 'response lost' } }
        : { data: { status: 'game_finished' }, error: null }
    }
    // Permitted: BOTH rows go (and the commit hook runs once), whether or not the answer then arrives.
    participantDeletes.push(a.p_participant_name ?? null)
    if (a.p_participant_name) {
      tables.participants = (tables.participants ?? []).filter(
        (r) => !(r.game_id === g.id && r.name === a.p_participant_name)
      )
    }
    deletePlayers([a.p_player_id])
    afterPlayerDelete?.()
    if (deleteCommitsButErrors) return { data: null, error: { message: 'response lost' } }
    return { data: { status: 'deleted' }, error: null }
  }
  if (name === 'end_game_if_host_alone') {
    if (failEndCheck) return { data: null, error: { message: 'rpc unreachable' } }
    const hook = beforeEndCheck
    beforeEndCheck = null
    hook?.()
    const answer = endModel(args as Parameters<typeof endModel>[0])
    endCalls.push(answer)
    return { data: answer, error: null }
  }
  if (name === 'settle_host_leave') {
    settleAttempts.push(args as SettleArgs)
    if (settleFailBudget > 0) {
      settleFailBudget--
      return { data: null, error: { message: 'rpc unreachable' } }
    }
    return { data: settleModel(args as SettleArgs), error: null }
  }
  if (name === 'finish_rounds_of_finished_session') {
    // Bound to the finished session in the database: only while the game is still finished with exactly this finished_at.
    const a = args as { p_game_id: string; p_finished_at: string }
    const game = tables.games.find((x) => x.id === a.p_game_id.toUpperCase())
    if (!game) return { data: { status: 'game_missing' }, error: null }
    if (game.status !== 'finished' || game.finished_at !== a.p_finished_at) {
      return { data: { status: 'not_current_session' }, error: null }
    }
    for (const r of tables.rounds ?? []) {
      // Every active round of the (locked, still finished with this finished_at) game: no clock comparison.
      if (r.game_id === game.id && r.status === 'active') {
        Object.assign(r, { status: 'finished', ended_at: a.p_finished_at })
        roundUpdateLog.push({ status: 'finished' })
      }
    }
    return {
      data: {
        status: 'finished_session',
        round_ids: (tables.rounds ?? [])
          .filter((r) => r.game_id === game.id && r.status === 'finished')
          .map((r) => r.id),
      },
      error: null,
    }
  }
  if (name !== 'wipe_finished_session_rows') return { data: true, error: null }
  const a = args as { p_game_id: string; p_finished_at: string; p_kind: string }
  wipeCalls.push(a)
  if (wipeFailBudget > 0) {
    wipeFailBudget--
    return { data: null, error: { message: 'wipe failed' } }
  }
  const game = tables.games.find((x) => x.id === a.p_game_id.toUpperCase())
  if (!game || game.status !== 'finished' || game.finished_at !== a.p_finished_at) {
    return { data: { status: 'not_current_session' }, error: null }
  }
  const doomed = a.p_kind === 'anonymous' ? ['anonymous_messages', 'anonymous_room_bans'] : ['codewords_messages']
  // Only THIS game's rows: another room's data is never touched.
  for (const table of doomed) tables[table] = (tables[table] ?? []).filter((r) => r.game_id !== game.id)
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
    // The departing player's team, captured by the route BEFORE the seat (and its role row) goes.
    codewords_player_roles: [{ game_id: 'ABCD', player_id: HOST_PID, team: 'red' }],
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
  failEndCheck = false
  endCalls = []
  keepSeat = false
  failPlayerDelete = false
  afterPlayerDelete = null
  beforeEndCheck = null
  beforeSeatDelete = null
  beforeEverySeatDelete = null
  afterFirstGamesRead = null
  removalCalls = 0
  gameUpdateLog = []
  roundUpdateLog = []
  failLinkageClear = false
  settleFailBudget = 0
  settleCalls = []
  wipeFailBudget = 0
  wipeCalls = []
  bookkeeping.calls = []
  bookkeeping.state = 'none'
  bookkeeping.throws = false
  bookkeeping.during = null
  settleAttempts = []
  deleteCommitsButErrors = false
  removeArgs = []
  participantDeletes = []
  playerDeleteLosesResponse = false
  failPlayersRead = false
  wordRush.sync = {}
  wordRush.syncCalls = 0
  wordRush.restore = 'restored'
  wordRush.beforeSync = null
  wordRush.games = () => tables.games
  wordRush.beforeRestore = null
  wordRush.results = []
  wordRush.forced = null
  wordRush.reverts = []
  failGamesSessionRead = false
  removal.reconcileError = null
  removal.reconcileTeams = []
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
      // Every host-left finish writes the durable marker (Play Again honours it for every game type).
      p_track_bookkeeping: true,
    })
  })

  it.each(['uno', 'word_rush', 'trivia'])(
    '%s: a leave with a successor succeeds with exactly one settle call, tracked',
    async (type) => {
      setup(type)
      const res = await leave()
      expect(res.status).toBe(200)
      expect(settleCalls).toHaveLength(1)
      expect(settleCalls[0].args.p_track_bookkeeping).toBe(true)
      expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
    }
  )

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
    // The removal is forwarded the REQUESTED player: Other's seat is gone, the host's remains.
    expect(tables.players.map((p) => p.id)).not.toContain(OTHER_PID)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(tables.games[0].host_player_id).toBe(HOST_PID)
  })

  it('a pre-removal end check that cannot be reached fails the leave instead of removing a host from a live game', async () => {
    hostOnly('uno')
    failEndCheck = true
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
    expect(bookkeeping.calls).toEqual(['ABCD'])
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
    // Both rounds close, whatever clock stamped them (a skewed app clock must not leave a live round open).
    expect(tables.rounds.map((r) => r.status)).toEqual(['finished', 'finished'])
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
    // Force the post-removal path: the session moves on (a start) before the pre-removal end check.
    beforeEndCheck = () => Object.assign(tables.games[0], { session_started_at: 'S2' })
    tables.rounds = [
      { id: 'old', game_id: 'ABCD', status: 'active', started_at: '2000-01-01T00:00:00.000Z' },
      { id: 'newer', game_id: 'ABCD', status: 'active', started_at: '2999-01-01T00:00:00.000Z' },
    ]
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.rounds.map((r) => r.status)).toEqual(['finished', 'finished'])
  })

  it('a cleanup for a DIFFERENT finished_at (an older finish of a replayed game) leaves every round alone', async () => {
    setup('trivia', { status: 'finished', result_reason: 'host_ended', finished_at: 'F2', sessions_played: 2 })
    tables.rounds = [{ id: 'r', game_id: 'ABCD', status: 'active', started_at: '2000-01-01T00:00:00.000Z' }]
    const res = await rpc('finish_rounds_of_finished_session', { p_game_id: 'ABCD', p_finished_at: 'F1' })
    expect((res.data as { status: string }).status).toBe('not_current_session')
    expect(tables.rounds[0].status).toBe('active')
  })
})

describe('DELETE /api/players: an older leave never finishes a REPLAYED session', () => {
  it('a replay between the leave read and the settlement: the new session is left alone (settled, not finished)', async () => {
    hostOnly('trivia')
    beforeEndCheck = () => Object.assign(tables.games[0], { sessions_played: 2 })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(endCalls.map((c) => c.status)).toEqual(['continue'])
    expect(settleCalls).toHaveLength(1)
    const g = tables.games[0]
    expect(g.status).toBe('active')
    expect(g.result_reason).toBeUndefined()
    // ...and its linkage is not this leave's to clear either.
    expect(g.host_user_id).toBe('user-host')
  })
})

describe('DELETE /api/players: the stale session is never finished by the leave', () => {
  it.each([['session_started_at changed (a start or replay)', { status: 'active', session_started_at: 'S2' }]])(
    'a pre-removal finish that misses is not forced; the game is decided against the CURRENT row after the removal: %s',
    async (_name, change) => {
      hostOnly('trivia')
      beforeEndCheck = () => Object.assign(tables.games[0], change)
      const res = await leave()
      expect(res.status).toBe(200)
      // The end check, bound to the inspected session, did not finish a game whose session moved on; the end came from
      // the settle step, decided against the current row.
      expect(endCalls.map((c) => c.status)).toEqual(['continue'])
      expect(settleCalls).toHaveLength(1)
      const g = tables.games[0]
      expect(g.status).toBe('finished')
      expect(g.result_reason).toBe('host_ended')
      // The linkage belongs to the session the leave inspected; a replayed session's is not this leave's to clear.
      expect(g.host_user_id).toBe('user-host')
    }
  )

  it('a waiting game that STARTED between the leave read and the finish (a bot beside the host) is ended, not left hostless', async () => {
    setup('trivia', { status: 'waiting', session_started_at: null })
    tables.players = [tables.players[0], player('bot', 'Bot', 2, { is_bot: true })]
    beforeEndCheck = () => Object.assign(tables.games[0], { status: 'active', session_started_at: 'S1' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(endCalls.map((c) => c.status)).toEqual(['continue'])
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
    let hookRan = false
    beforeEndCheck = () => {
      hookRan = true
      Object.assign(tables.games[0], { status: 'active', session_started_at: 'S2', sessions_played: 2, ...taken })
    }
    const res = await leave()
    expect(res.status).toBe(200)
    const g = tables.games[0]
    expect(g.status).toBe('active')
    expect(g.result_reason).toBeUndefined()
    expect(g.finished_at).toBeUndefined()
    // The world really moved on: the hook ran, the game is in the replayed session, and the replacement host / nominee
    // is still in place (nothing the stale leave did overwrote it).
    expect(hookRan).toBe(true)
    expect(g.session_started_at).toBe('S2')
    expect(g.sessions_played).toBe(2)
    for (const [key, value] of Object.entries(taken)) expect(g[key]).toBe(value)
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
    // The first request really tried (3 attempts, all unreachable).
    expect(settleAttempts).toHaveLength(3)
    const attempts = settleAttempts.length

    // What a second DELETE with the same resume token actually does: it cannot authenticate, so it neither settles
    // the handoff nor changes anything. Recovery is a manual host transfer, or the idle reaper ending the game.
    const second = await leave()
    expect(second.status).toBeGreaterThanOrEqual(400)
    expect(second.status).toBeLessThan(500)
    // ...and the second DELETE made NO attempt at all: it cannot authenticate.
    expect(settleAttempts).toHaveLength(attempts)
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
      // A second room with rows of its own (a different game id) that must survive.
      tables.games.push({
        id: 'OTHR',
        status: 'finished',
        game_type: type,
        result_reason: 'host_ended',
        finished_at: finishedAt,
      })
      for (const t of wiped)
        tables[t].push({ id: `${t}-other-room`, game_id: 'OTHR', created_at: '2025-12-31T23:59:00.000Z' })
      const res = await leave()
      expect(res.status).toBe(200)
      expect(wipeCalls).toEqual([{ p_game_id: 'ABCD', p_finished_at: finishedAt, p_kind: kind }])
      for (const t of wiped) expect(tables[t].map((r) => r.game_id)).toEqual(['OTHR'])
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

describe('DELETE /api/players: a host-left finish owes its bookkeeping, durably', () => {
  it.each(['uno', 'trivia', 'word_rush', 'codewords'])(
    '%s: the pre-removal end resumes the bookkeeping its marker owes (every game type)',
    async (type) => {
      hostOnly(type)
      const res = await leave()
      expect(res.status).toBe(200)
      expect(endCalls).toEqual([{ status: 'finished', finished_now: true, finished_at: FINISHED_AT }])
      expect(bookkeeping.calls).toEqual(['ABCD'])
    }
  )

  it('a repeat after a lost response (the game is already ended by this leave) resumes the same marker', async () => {
    hostOnly('uno', { status: 'finished', result_reason: 'host_ended', finished_at: FINISHED_AT })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(bookkeeping.calls).toEqual(['ABCD'])
  })

  it('the end check itself reports a repeat (already ended by this leave) as finished and resumes the marker', async () => {
    hostOnly('uno')
    // The first answer was lost: the game is finished by the time the check runs again.
    beforeEndCheck = () =>
      Object.assign(tables.games[0], { status: 'finished', result_reason: 'host_ended', finished_at: FINISHED_AT })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(endCalls).toEqual([{ status: 'finished', finished_now: false, finished_at: FINISHED_AT }])
    expect(bookkeeping.calls).toEqual(['ABCD'])
  })

  it('a finish by someone else (another reason) is never resumed by this leave', async () => {
    hostOnly('uno', { status: 'finished', result_reason: 'admin_ended', finished_at: 'THEIRS' })
    await leave()
    expect(bookkeeping.calls).toEqual([])
  })

  it('a post-removal finish committed by the settle step resumes its marker too, once', async () => {
    setup('uno')
    removal.uno.onCall = () => {
      tables.players = tables.players.filter((p) => p.id !== OTHER_PID)
    }
    await leave()
    expect(settleCalls).toHaveLength(1)
    expect(bookkeeping.calls).toEqual(['ABCD'])
  })

  it.each([
    ['an error state', { state: 'error', throws: false }, 'resuming post-finish bookkeeping failed'],
    ['a thrown error', { state: 'none', throws: true }, 'resuming post-finish bookkeeping threw'],
  ])(
    'a resume that fails (%s) is logged with its diagnostic and never fails the leave',
    async (_name, mode, diagnostic) => {
      hostOnly('uno')
      bookkeeping.state = mode.state
      bookkeeping.throws = mode.throws
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const res = await leave()
        expect(res.status).toBe(200)
        // Recovery really was attempted, and the failure reached the operator log with the expected diagnostic.
        expect(bookkeeping.calls).toEqual(['ABCD'])
        expect(log.mock.calls.some(([m]) => typeof m === 'string' && m.includes(diagnostic))).toBe(true)
      } finally {
        log.mockRestore()
      }
    }
  )
})

describe('DELETE /api/players: removal disposition is carried separately from the HTTP status', () => {
  it('a Codewords seat deleted and then a failed reconcile, with the settle step unreachable: reconcile error AND unresolved', async () => {
    setup('codewords')
    removal.reconcileError = 'cleanup failed'
    settleFailBudget = 99
    const res = await leave()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; handoff?: string }
    // The original status and the removal's own message are kept (as `removalError`); the retry advice is not.
    expect((body as { removalError?: string }).removalError).toBe('cleanup failed')
    expect(body.error).toMatch(/unknown/i)
    expect(body.error).not.toMatch(/try again|retry/i)
    expect(body.handoff).toBe('unresolved')
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
  })

  it('a Codewords delete whose outcome is UNKNOWN (an error, seat still present) is never reported as retryable', async () => {
    setup('codewords')
    failPlayerDelete = true
    settleFailBudget = 99
    const res = await leave()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; handoff?: string }
    // The delete may have committed behind the error: keep the original error AND report the handoff unresolved.
    expect(body.handoff).toBe('unresolved')
    expect(body.error).toBeTruthy()
    expect(body.error).not.toMatch(/try again|retry/i)
  })

  it('a Codewords delete that COMMITTED but lost its response: original error preserved and handoff unresolved', async () => {
    setup('codewords')
    deleteCommitsButErrors = true
    settleFailBudget = 99
    const res = await leave()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; handoff?: string }
    expect(body.handoff).toBe('unresolved')
    expect(body.error).toBeTruthy()
    // The seat is gone, so the old resume token cannot retry: the response must not advise it.
    expect(body.error).not.toMatch(/try again|retry/i)
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
  })

  it('a Codewords seat CONFIRMED retained (the game finished first) with an unreachable settle step is retryable', async () => {
    setup('codewords')
    beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    settleFailBudget = 99
    const res = await leave()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; handoff?: string }
    expect(body.handoff).toBeUndefined()
    expect(body.error).toMatch(/try again/i)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
  })

  it('a Codewords reconcile error with a reachable settle step still reports only the reconcile error', async () => {
    setup('codewords')
    removal.reconcileError = 'cleanup failed'
    const res = await leave()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; handoff?: string }
    expect(body.handoff).toBeUndefined()
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })
})

describe('DELETE /api/players: a finish that lands after the status was read never loses a seat', () => {
  it.each(['codewords', 'trivia'])(
    '%s: a non-host leave whose game finishes right before the delete keeps the seat and answers a retained leave',
    async (type) => {
      setup(type)
      tables.players.push(player(THIRD_PID, 'Third', 3, { resume_token: 'YYYY8888' }))
      beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
      const res = await DELETE(
        new NextRequest('https://x.test/api/players', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ gameCode: 'abcd', playerId: THIRD_PID, resumeToken: 'YYYY8888' }),
        })
      )
      expect(res.status).toBe(200)
      expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
      expect(tables.players.map((p) => p.id)).toContain(THIRD_PID)
    }
  )

  it('a Codewords HOST whose game finished (another reason) between the capture and the end check keeps the seat', async () => {
    setup('codewords')
    beforeEndCheck = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
    // The seat belongs to a result now: not deleted, no handoff written.
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(tables.games[0].pending_host_player_id).toBeNull()
    expect(endCalls).toEqual([{ status: 'continue', game_status: 'finished' }])
  })

  it('a Codewords host whose game finishes AFTER the end check but before the delete keeps the seat (the delete itself is conditional)', async () => {
    setup('codewords')
    beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(tables.games[0].pending_host_player_id).toBeNull()
  })

  it('a still-open game deletes the seat as before', async () => {
    setup('codewords')
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })
})

describe('DELETE /api/players: a finish that landed before the host capture is seen by every removal helper', () => {
  it('a game finished (another reason) between the session read and the host-capture read: the removal helper never runs', async () => {
    setup('uno')
    afterFirstGamesRead = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
    expect(removalCalls).toBe(0)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
  })

  it('a game finished (another reason) between the capture and the end check: the removal helper never runs', async () => {
    setup('uno')
    beforeEndCheck = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
    expect(removalCalls).toBe(0)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
  })
})

describe('DELETE /api/players: a known-retained seat is never reported as an unresolved handoff', () => {
  it('a retained finished-game leave whose settle step is unreachable answers a retryable error, and the repeat works', async () => {
    setup('uno', { status: 'finished', result_reason: 'admin_ended', finished_at: 'F' })
    settleFailBudget = 99
    const first = await leave()
    expect(first.status).toBe(500)
    const body = (await first.json()) as { error: string; handoff?: string }
    expect(body.handoff).toBeUndefined()
    expect(body.error).toMatch(/try again/i)
    // The seat is retained, so the resume token still works.
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    settleFailBudget = 0
    const retry = await leave()
    expect(retry.status).toBe(200)
  })

  it('a SEAT THAT WAS DELETED with an unreachable settle step is still reported as unresolved, never as retryable', async () => {
    setup('uno')
    settleFailBudget = 99
    const res = await leave()
    const body = (await res.json()) as { error: string; handoff?: string }
    expect(body.handoff).toBe('unresolved')
    expect(body.error).not.toMatch(/try again|retry/i)
  })
})

describe('DELETE /api/players: a pending nominee counts only while it is ELIGIBLE (same rule as the SQL)', () => {
  it('a spectator nominee with an eligible player remaining is replaced by the eligible player', async () => {
    setup('uno', { pending_host_player_id: THIRD_PID, pending_host_nominated_at: 'T' })
    tables.players.push(player(THIRD_PID, 'Third', 3, { spectator: true }))
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })

  it('a bot nominee is replaced the same way', async () => {
    setup('uno', { pending_host_player_id: THIRD_PID, pending_host_nominated_at: 'T' })
    tables.players.push(player(THIRD_PID, 'Third', 3, { is_bot: true }))
    await leave()
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })

  it('an eligible nominee is kept', async () => {
    setup('uno', { pending_host_player_id: THIRD_PID, pending_host_nominated_at: 'T' })
    tables.players.push(player(THIRD_PID, 'Third', 3))
    await leave()
    expect(tables.games[0].pending_host_player_id).toBe(THIRD_PID)
  })
})

describe('DELETE /api/players: an engine that KEEPS a finisher seat reports it, and a failed settlement is retryable', () => {
  it('an active host who is already in finish_order keeps the seat: unreachable settlement answers a retryable error, not "you left"', async () => {
    setup('uno')
    keepSeat = true
    settleFailBudget = 99
    const res = await leave()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; handoff?: string }
    expect(body.handoff).toBeUndefined()
    expect(body.error).toMatch(/try again/i)
    expect(body.error).not.toMatch(/you left|without a host/i)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
  })

  it('a seat the engine really deleted is still reported unresolved when the settlement is unreachable', async () => {
    setup('uno')
    settleFailBudget = 99
    const res = await leave()
    expect(((await res.json()) as { handoff?: string }).handoff).toBe('unresolved')
  })
})

describe('DELETE /api/players: a forfeit cleanup whose delete response was lost', () => {
  it('carries the uncertain deletion into the handoff response (the old token cannot retry)', async () => {
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
    playerDeleteLosesResponse = true
    settleFailBudget = 99
    const res = await leave()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; handoff?: string; removalError?: string }
    expect(body.handoff).toBe('unresolved')
    expect(body.error).not.toMatch(/try again|retry/i)
    expect(body.removalError).toBeTruthy()
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
  })
})

describe('DELETE /api/players: Word Rush — a finish THIS leave caused vs an independent finish', () => {
  const finishNow = () =>
    Object.assign(tables.games[0], { status: 'finished', result_reason: null, finished_at: 'WR-FINISH' })
  const rollback = {
    session_id: 'WRS',
    removed_player_id: HOST_PID,
    removed_index: 0,
    turn_index: 0,
    prompt_setter_player_id: null,
  }

  it('the last unanswered player leaving finishes the game: the seat is deleted, the roster is NOT reverted, nothing is retained', async () => {
    setup('word_rush')
    wordRush.sync = { rollback, ownFinish: true }
    // The removal's own finalization finishes the games row before the seat delete runs.
    beforeSeatDelete = finishNow
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBeUndefined()
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    expect(wordRush.reverts).toEqual([])
    // The deletion is bound to the session the removal inspected.
    expect(removeArgs[0]).toMatchObject({ p_own_finish: true, p_session_started_at: 'S1', p_sessions_played: 1 })
  })

  it('an INDEPENDENT finish that wins keeps the seat, reverts the roster and answers a retained leave', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(wordRush.reverts).toEqual([rollback])
    expect(removeArgs[0].p_own_finish).toBeUndefined()
  })

  it('a finish this leave caused is not honoured for a REPLACED session (replay in between): the seat is kept and the roster reverted', async () => {
    setup('word_rush')
    wordRush.sync = { rollback, ownFinish: true }
    beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', sessions_played: 2 })
    const res = await leave()
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(wordRush.reverts).toEqual([rollback])
  })

  it('a leave that did not finish the game never passes the own-finish flag', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    const res = await leave()
    expect(res.status).toBe(200)
    expect(removeArgs[0].p_own_finish).toBeUndefined()
    expect(wordRush.reverts).toEqual([])
  })
})

describe('DELETE /api/players: the Word Rush roster is restored only for a CONFIRMED rejected delete', () => {
  const rollback = {
    session_id: 'WRS',
    removed_player_id: HOST_PID,
    removed_index: 0,
    turn_index: 0,
    prompt_setter_player_id: null,
  }

  it('confirmed rejection (the seat is still there): the roster is restored', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    failPlayerDelete = true
    const res = await leave()
    expect(res.status).toBe(500)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(wordRush.reverts).toEqual([rollback])
    expect(((await res.json()) as { handoff?: string }).handoff).toBeUndefined()
  })

  it('ambiguous: the delete COMMITTED and only its response was lost -> the database says no_seat, the leave went through, the roster is NOT restored', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    deleteCommitsButErrors = true
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    expect(wordRush.results).toEqual(['no_seat'])
    // ...and the handoff is settled against the deleted seat as for any other leave.
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })

  it('ambiguous and the restore itself cannot be reached, nor the seat read: nothing is restored and the handoff is reported unresolved', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    deleteCommitsButErrors = true
    wordRush.forced = 'failed'
    beforeSeatDelete = () => {
      failPlayersRead = true
    }
    settleFailBudget = 99
    const res = await leave()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; handoff?: string }
    expect(body.handoff).toBe('unresolved')
    expect(body.error).not.toMatch(/try again|retry/i)
  })

  it('a lost response with the seat still there (the restore answers restored): a plain repeatable error', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    deleteCommitsButErrors = true
    const res = await leave()
    expect(res.status).toBe(500)
    expect(wordRush.results).toEqual(['restored'])
  })
})

describe('DELETE /api/players: joiners mode removes the participant and the seat in ONE guarded database step', () => {
  it('passes the participant name to the same conditional removal, and deletes both', async () => {
    setup('trivia', { participant_mode: 'joiners' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(removeArgs[0]).toMatchObject({ p_participant_name: 'Host' })
    expect(participantDeletes).toEqual(['Host'])
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
  })

  it('a finish that lands before the delete keeps BOTH rows and answers a retained leave', async () => {
    setup('trivia', { participant_mode: 'joiners' })
    beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(participantDeletes).toEqual([])
  })

  it('other modes never pass a participant name', async () => {
    setup('trivia')
    await leave()
    expect(removeArgs[0]).not.toHaveProperty('p_participant_name')
  })
})

describe('DELETE /api/players: the lost response of a delete that the SQL guards refused', () => {
  const rollback = {
    session_id: 'WRS',
    removed_player_id: HOST_PID,
    removed_index: 0,
    turn_index: 0,
    prompt_setter_player_id: null,
  }

  it('a finish that wins and a lost response overlap: the seat is NOT deleted, so it is retained and the roster restored', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    deleteCommitsButErrors = true
    const res = await leave()
    // The answer was lost, but the read-back proves the seat survived: a plain repeatable error, roster restored.
    expect(res.status).toBe(500)
    expect(((await res.json()) as { handoff?: string }).handoff).toBeUndefined()
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(wordRush.reverts).toEqual([rollback])
  })
})

describe('DELETE /api/players: a failed Word Rush session read changes nothing', () => {
  it('stops BEFORE the roster is touched: nothing is synced, deleted or reverted, and the leave can be repeated', async () => {
    setup('word_rush')
    wordRush.sync = { rollback: { session_id: 'WRS' }, ownFinish: true }
    failGamesSessionRead = true
    const res = await leave()
    expect(res.status).toBe(500)
    expect(wordRush.syncCalls).toBe(0)
    expect(wordRush.reverts).toEqual([])
    expect(removeArgs).toEqual([])
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    // Nothing was removed, so no handoff is claimed to be unresolved.
    expect(((await res.json()) as { handoff?: string }).handoff).toBeUndefined()
  })
})

describe('DELETE /api/players: the own-finish flag never overrides an independent finish reason', () => {
  const rollback = {
    session_id: 'WRS',
    removed_player_id: HOST_PID,
    removed_index: 0,
    turn_index: 0,
    prompt_setter_player_id: null,
  }

  it('own-finish flag + a matching session + an independent finish reason: the seat is kept and the roster restored', async () => {
    setup('word_rush')
    wordRush.sync = { rollback, ownFinish: true }
    beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
    expect(removeArgs[0].p_own_finish).toBe(true)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(wordRush.reverts).toEqual([rollback])
  })
})

describe('DELETE /api/players: a joiners-mode delete whose response was lost still committed BOTH rows', () => {
  it('deletes the participant and the seat, then reports the error; the read-back sees the seat gone and the leave goes through', async () => {
    setup('trivia', { participant_mode: 'joiners' })
    deleteCommitsButErrors = true
    const res = await leave()
    expect(res.status).toBe(200)
    expect(participantDeletes).toEqual(['Host'])
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
  })
})

describe('DELETE /api/players: a failed Word Rush roster restore is not a completed leave', () => {
  const rollback = {
    session_id: 'WRS',
    removed_player_id: HOST_PID,
    removed_index: 0,
    turn_index: 0,
    prompt_setter_player_id: null,
  }
  const finishFirst = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })

  it('the seat is kept but the roster could not be put back: 500, never the 200 retained answer', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    beforeSeatDelete = finishFirst
    wordRush.restore = 'failed'
    const res = await leave()
    expect(res.status).toBe(500)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
  })

  it.each(['restored', 'not_current_session'])('a %s restore is a completed retained leave', async (outcome) => {
    setup('word_rush')
    wordRush.sync = { rollback }
    beforeSeatDelete = finishFirst
    wordRush.restore = outcome
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
  })
})

describe('DELETE /api/players: a replaced Word Rush session is decided by the seat itself', () => {
  const rollback = {
    session_id: 'WRS',
    removed_player_id: HOST_PID,
    removed_index: 0,
    turn_index: 0,
    prompt_setter_player_id: null,
  }
  const finishFirst = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })

  it('not_current_session + the seat still there: a retained leave', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    beforeSeatDelete = finishFirst
    wordRush.forced = 'not_current_session'
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
  })

  it('not_current_session + the seat gone (a second leave deleted it): NOT retained, unresolved when settlement is down', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    beforeSeatDelete = finishFirst
    wordRush.forced = 'not_current_session'
    wordRush.beforeRestore = () => deletePlayers([HOST_PID])
    settleFailBudget = 99
    const body = (await (await leave()).json()) as { retained?: boolean; handoff?: string; error?: string }
    expect(body.retained).toBeUndefined()
    expect(body.handoff).toBe('unresolved')
    expect(body.error).not.toMatch(/try again|retry/i)
  })

  it('not_current_session + the seat unreadable: neither retained nor gone', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    beforeSeatDelete = finishFirst
    wordRush.forced = 'not_current_session'
    wordRush.beforeRestore = () => {
      failPlayersRead = true
    }
    const res = await leave()
    expect(res.status).toBe(500)
    expect(((await res.json()) as { retained?: boolean }).retained).toBeUndefined()
  })
})

describe('DELETE /api/players: a restore that finds no seat is not a retained leave', () => {
  const rollback = {
    session_id: 'WRS',
    removed_player_id: HOST_PID,
    removed_index: 0,
    turn_index: 0,
    prompt_setter_player_id: null,
  }

  it('the guarded delete refused (a finish won) but another removal deleted the seat before the restore: the seat is gone, not retained', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    wordRush.beforeRestore = () => deletePlayers([HOST_PID])
    settleFailBudget = 99
    const res = await leave()
    expect(wordRush.results).toEqual(['no_seat'])
    const body = (await res.json()) as { retained?: boolean; handoff?: string; error?: string }
    expect(body.retained).toBeUndefined()
    // The old resume token cannot retry: an unreachable settle step is unresolved, never "try again".
    expect(body.handoff).toBe('unresolved')
    expect(body.error).not.toMatch(/try again|retry/i)
  })
})

describe('DELETE /api/players: an own finish is refused while its bookkeeping is still owed', () => {
  const rollback = {
    session_id: 'WRS',
    removed_player_id: HOST_PID,
    removed_index: 0,
    turn_index: 0,
    prompt_setter_player_id: null,
  }

  it('the leaver keeps the seat (and the rows that cascade off it) until the finish bookkeeping marker is cleared', async () => {
    setup('word_rush')
    wordRush.sync = { rollback, ownFinish: true }
    beforeSeatDelete = () =>
      Object.assign(tables.games[0], {
        status: 'finished',
        result_reason: null,
        finished_at: 'WR-FINISH',
        finish_bookkeeping: { finished_at: 'WR-FINISH', attempts: 0 },
      })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBe(true)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(wordRush.reverts).toEqual([rollback])
  })

  it('once the bookkeeping has completed (marker cleared) the own-finish delete goes through', async () => {
    setup('word_rush')
    wordRush.sync = { rollback, ownFinish: true }
    beforeSeatDelete = () =>
      Object.assign(tables.games[0], {
        status: 'finished',
        result_reason: null,
        finished_at: 'WR-FINISH',
        finish_bookkeeping: null,
      })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    expect(wordRush.reverts).toEqual([])
  })
})

describe('DELETE /api/players: a per-game helper whose delete response was lost', () => {
  it('the seat is gone (the delete committed) and the settle step is unreachable: unresolved, no retry advice', async () => {
    setup('uno')
    removal.uno.error = 'Something went wrong. Please try again.'
    removal.uno.onCall = () => deletePlayers([HOST_PID])
    settleFailBudget = 99
    const res = await leave()
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; handoff?: string; removalError?: string }
    expect(body.handoff).toBe('unresolved')
    expect(body.error).not.toMatch(/try again|retry/i)
    expect(body.removalError).toBeTruthy()
  })

  it('the seat is still there (the delete was rejected): the removal error stands alone and the leave is repeatable', async () => {
    setup('uno')
    removal.uno.error = 'Game changed, please try again.'
    settleFailBudget = 99
    const res = await leave()
    const body = (await res.json()) as { error: string; handoff?: string }
    expect(body.handoff).toBeUndefined()
    expect(body.error).toContain('Game changed')
  })

  it('the seat cannot be read back: reported unresolved rather than claimed retryable', async () => {
    setup('uno')
    removal.uno.error = 'Game changed, please try again.'
    removal.uno.onCall = () => {
      failPlayersRead = true
    }
    settleFailBudget = 99
    const res = await leave()
    expect(((await res.json()) as { handoff?: string }).handoff).toBe('unresolved')
  })
})

describe('DELETE /api/players: the host-left cleanup is bound to the finish THIS leave observed', () => {
  const replayedAndEndedAgain = () =>
    Object.assign(tables.games[0], { sessions_played: 2, finished_at: 'F2', result_reason: 'host_ended' })

  it('baseline: the leave finishes its own session and wipes it, bound to its finished_at', async () => {
    hostOnly('codewords')
    const res = await leave()
    expect(res.status).toBe(200)
    expect(wipeCalls).toEqual([{ p_game_id: 'ABCD', p_finished_at: FINISHED_AT, p_kind: 'codewords' }])
  })

  it('a finish observed from the settlement (F1) is not swapped for a later finish (F2) of a replayed session', async () => {
    setup('codewords')
    tables.players = tables.players.filter((p) => p.id === HOST_PID)
    // Force the post-removal settlement to commit the finish, then let the game replay and end again during bookkeeping.
    beforeEndCheck = () => Object.assign(tables.games[0], { session_started_at: 'S2' })
    bookkeeping.during = replayedAndEndedAgain
    const res = await leave()
    expect(res.status).toBe(200)
    expect(bookkeeping.calls).toEqual(['ABCD'])
    expect(wipeCalls).toEqual([])
  })
})

describe('DELETE /api/players: a pending nominee who stopped being eligible does not keep the host alive', () => {
  it('the host leaving with only a spectator nominee left ends the game BEFORE the seat is removed', async () => {
    setup('uno', { pending_host_player_id: THIRD_PID, pending_host_nominated_at: 'T' })
    tables.players = [player(HOST_PID, 'Host', 1), player(THIRD_PID, 'Third', 3, { spectator: true })]
    const res = await leave()
    expect(res.status).toBe(200)
    expect(endCalls).toEqual([{ status: 'finished', finished_now: true, finished_at: FINISHED_AT }])
    // The finished game keeps the host's seat (and their results).
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(tables.games[0].result_reason).toBe('host_ended')
    expect(removalCalls).toBe(0)
  })

  it('an ELIGIBLE nominee keeps the handoff path: the end check answers continue and the seat is removed', async () => {
    setup('uno', { pending_host_player_id: OTHER_PID, pending_host_nominated_at: 'T' })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(endCalls).toEqual([{ status: 'continue', game_status: 'active' }])
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    expect(tables.games[0].pending_host_player_id).toBe(OTHER_PID)
  })
})

describe('DELETE /api/players: the Codewords team is captured before the seat goes', () => {
  it("passes the departing player's seeded team to the reconciliation after the seat is deleted", async () => {
    setup('codewords')
    await leave()
    expect(removal.reconcileTeams).toEqual(['red'])
  })
})

describe('DELETE /api/players: joiners mode keeps or removes the participant row WITH the seat', () => {
  const participants = () => [
    { id: 'p-host', game_id: 'ABCD', name: 'Host' },
    { id: 'p-other', game_id: 'ABCD', name: 'Other' },
  ]

  it('a successful removal deletes the seat and ITS participant row, nothing else', async () => {
    setup('trivia', { participant_mode: 'joiners' })
    tables.participants = participants()
    await leave()
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    expect(tables.participants.map((r) => r.id)).toEqual(['p-other'])
  })

  it('a finish that wins keeps BOTH rows (no direct participant delete happens before the guarded step)', async () => {
    setup('trivia', { participant_mode: 'joiners' })
    tables.participants = participants()
    beforeSeatDelete = () => Object.assign(tables.games[0], { status: 'finished', result_reason: 'admin_ended' })
    await leave()
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
    expect(tables.participants.map((r) => r.id)).toEqual(['p-host', 'p-other'])
  })
})

describe('DELETE /api/players: a Codewords room reopened between the two status reads takes the removal path', () => {
  it('the newer (waiting) status selects the removal: the seat is deleted, not answered as a retained leave', async () => {
    setup('codewords', { status: 'finished', result_reason: 'admin_ended' })
    // Play Again reopens the room right after the first read authorised the leave.
    afterFirstGamesRead = () => Object.assign(tables.games[0], { status: 'waiting', result_reason: null })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { retained?: boolean }).retained).toBeUndefined()
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
  })
})

describe('DELETE /api/players: the Word Rush seat delete is bound to the session the roster was reconciled against', () => {
  const rollback = {
    session_id: 'WRS',
    removed_player_id: HOST_PID,
    removed_index: 0,
    turn_index: 0,
    prompt_setter_player_id: null,
  }

  it('a start that lands BEFORE the sync reads the game pairs the finish with the started session, and the seat goes', async () => {
    setup('word_rush', { session_started_at: null, status: 'waiting' })
    wordRush.sync = { rollback, ownFinish: true }
    // The route read the waiting lobby; Start commits before the reconciliation reads the game.
    wordRush.beforeSync = () => Object.assign(tables.games[0], { status: 'active', session_started_at: 'S2' })
    beforeSeatDelete = () =>
      Object.assign(tables.games[0], { status: 'finished', result_reason: null, finish_bookkeeping: null })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(removeArgs[0]).toMatchObject({ p_own_finish: true, p_session_started_at: 'S2', p_check_session: true })
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
    expect(wordRush.reverts).toEqual([])
  })

  it('a replay between the reconciliation and the delete: nothing is deleted, the CURRENT session is reconciled, then the seat goes', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    beforeSeatDelete = () => Object.assign(tables.games[0], { sessions_played: 2 })
    const res = await leave()
    expect(res.status).toBe(200)
    expect(wordRush.syncCalls).toBe(2)
    expect(removeArgs).toHaveLength(2)
    expect(removeArgs[1]).toMatchObject({ p_sessions_played: 2, p_check_session: true })
    expect(tables.players.map((p) => p.id)).not.toContain(HOST_PID)
  })

  it('a game that keeps changing is never deleted from: a repeatable error after the bounded retries', async () => {
    setup('word_rush')
    wordRush.sync = { rollback }
    let n = 2
    beforeEverySeatDelete = () => Object.assign(tables.games[0], { sessions_played: n++ })
    const res = await leave()
    expect(res.status).toBe(500)
    expect(removeArgs).toHaveLength(3)
    expect(tables.players.map((p) => p.id)).toContain(HOST_PID)
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
