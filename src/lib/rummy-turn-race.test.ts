import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RummyCard, RummySuit } from '@/types'

vi.mock('server-only', () => ({}))

import {
  processRummyDiscard,
  processRummyDraw,
  processRummyGoOut,
  processRummyExpireTurn,
  finishExpiredRummyGame,
  removeRummyPlayer,
  rummyVersionKey,
} from './rummy'

/**
 * Concurrent discard / go-out requests from the same player used to each pass the turn checks and
 * each write the hand, because the hand was updated before the session row was claimed. These
 * tests run the real processors against a tiny in-memory Supabase stand-in that implements the
 * `.eq('updated_at', ...)` optimistic check the way Postgres does (the write only applies if the
 * row still matches).
 */

const c = (suit: RummySuit, rank: number): RummyCard => ({ id: `${suit}-${rank}`, suit, rank })

type Row = Record<string, unknown>

type Faults = {
  /** rpc('rummy_apply_transition') returns a transport error before touching anything. */
  rpcError?: string
  /** The hand write inside the transition fails (after the session CAS) and must roll it back. */
  handWriteFails?: boolean
  /** Update of the `games` row (markGameFinished) fails. */
  gamesUpdateError?: string
  /** Records the order in which the sessions/hands reads start and finish. */
  readLog?: string[]
  /** Runs right after the rummy_sessions row has been read (lets a test commit something after the load). */
  afterSessionRead?: (tables: Record<string, Row[]>) => void
  /** Make the game clock look expired (game_duration_seconds / session_started_at in the past). */
  clockExpired?: boolean
  /** Makes the nth direct `maybeSingle` read of rummy_sessions fail with a transport error. */
  failSessionMaybeSingleOn?: number
  /** Runs right after a transition commits (lets a test interleave another request). */
  afterRpc?: (tables: Record<string, Row[]>) => void
  /** Each direct rummy_sessions update consumes one entry and fails with it (before applying). */
  sessionUpdateErrors?: { code?: string; message: string }[]
  /** Each rummy_player_hands delete consumes one entry and fails with it. */
  handDeleteErrors?: { code?: string; message: string }[]
}

function makeDb(hand: RummyCard[], faults: Faults = {}) {
  const tables: Record<string, Row[]> = {
    rummy_sessions: [
      {
        id: 's1',
        game_id: 'ABCD',
        turn_order: ['p1', 'p2'],
        current_turn_index: 0,
        phase: 'playing',
        draw_pile: [c('clubs', 9)],
        discard_pile: [c('spades', 2)],
        top_discard: c('spades', 2),
        turn_step: 'discard',
        reshuffle_count: 0,
        status_message: null,
        winner_player_id: null,
        winning_melds: null,
        turn_deadline_at: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    rummy_player_hands: [
      { id: 'h1', game_id: 'ABCD', player_id: 'p1', player_order: 0, cards: hand },
      { id: 'h2', game_id: 'ABCD', player_id: 'p2', player_order: 1, cards: [c('clubs', 1)] },
    ],
    players: [
      { id: 'p1', game_id: 'ABCD', name: 'Ana' },
      { id: 'p2', game_id: 'ABCD', name: 'Ben' },
    ],
    games: [
      {
        id: 'ABCD',
        status: 'active',
        timer_seconds: 0,
        game_duration_seconds: faults.clockExpired ? 60 : 0,
        session_started_at: faults.clockExpired ? '2020-01-01T00:00:00.000Z' : null,
      },
    ],
  }
  let tick = 0
  let maybeSingleReads = 0
  const gamesWrites = { count: 0 }

  const builder = (table: string) => {
    const filters: [string, unknown][] = []
    let patch: Row | null = null
    let deleting = false
    const match = () =>
      tables[table].filter((r) =>
        filters.every(([k, v]) => (k === 'id' && table === 'games' ? r.id === v : r[k] === v))
      )
    const run = async () => {
      const logName = !patch && (table === 'rummy_sessions' || table === 'rummy_player_hands') ? table : null
      if (logName) faults.readLog?.push(`${logName}:start`)
      // The session read is the slow one, so a parallel Promise.all would start the hands read
      // (and even finish it) before the session read ends; only sequential reads keep the order.
      if (faults.readLog && logName === 'rummy_sessions') await new Promise((r) => setTimeout(r, 0))
      else await Promise.resolve()
      if (logName) faults.readLog?.push(`${logName}:end`)
      if (deleting) {
        if (table === 'rummy_player_hands' && faults.handDeleteErrors?.length) {
          return { data: null, error: faults.handDeleteErrors.shift() }
        }
        const doomed = match()
        tables[table] = tables[table].filter((r) => !doomed.includes(r))
        return { data: null, error: null }
      }
      if (patch) {
        if (table === 'rummy_sessions' && faults.sessionUpdateErrors?.length) {
          return { data: null, error: faults.sessionUpdateErrors.shift() }
        }
        if (table === 'games' && faults.gamesUpdateError) {
          return { data: null, error: { message: faults.gamesUpdateError } }
        }
        const rows = match()
        if (table === 'games' && rows.length > 0) gamesWrites.count++
        const stamp =
          typeof patch.updated_at === 'string' ? `2026-01-01T00:00:${String(++tick).padStart(2, '0')}.000Z` : null
        for (const r of rows) {
          Object.assign(r, patch)
          if (stamp) r.updated_at = stamp
        }
        return { data: rows.map((r) => ({ ...r })), error: null }
      }
      const out = match().map((r) => ({ ...r }))
      if (table === 'rummy_sessions') faults.afterSessionRead?.(tables)
      return { data: out, error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      order: () => api,
      eq: (k: string, v: unknown) => {
        filters.push([k, v])
        return api
      },
      update: (p: Row) => {
        patch = p
        return api
      },
      delete: () => {
        deleting = true
        return api
      },
      maybeSingle: async () => {
        const res = await run()
        if (table === 'rummy_sessions') {
          maybeSingleReads += 1
          if (faults.failSessionMaybeSingleOn === maybeSingleReads) {
            return { data: null, error: { message: 'connection reset' } }
          }
        }
        return { data: (res.data as Row[])[0] ?? null, error: null }
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => run().then(resolve, reject),
    }
    return api
  }

  // In-memory rummy_apply_transition: same semantics as the Postgres function. The session
  // compare-and-swap and every hand write apply atomically; any failure restores a snapshot.
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    await Promise.resolve()
    if (fn === 'rummy_finish_game_for_session') {
      // Same semantics as the Postgres function: flips games only while it is active and the
      // observed session is still the game's (finished) session.
      if (faults.gamesUpdateError) return { data: null, error: { message: faults.gamesUpdateError } }
      const game = tables.games.find((g) => g.id === args.p_game_id)
      const sess = tables.rummy_sessions.find((r) => r.game_id === args.p_game_id && r.id === args.p_session_id)
      if (!game || game.status !== 'active' || !sess || sess.phase !== 'finished') return { data: false, error: null }
      game.status = 'finished'
      gamesWrites.count++
      return { data: true, error: null }
    }
    if (fn !== 'rummy_apply_transition') return { data: null, error: { message: `unknown rpc ${fn}` } }
    if (faults.rpcError) return { data: null, error: { message: faults.rpcError } }
    const session = tables.rummy_sessions.find((r) => r.game_id === args.p_game_id)
    if (!session || session.updated_at !== args.p_expected_updated_at) {
      return { data: { status: 'conflict' }, error: null }
    }
    const snapshot = structuredClone(tables)
    Object.assign(session, args.p_session_patch as Row)
    session.updated_at = `2026-01-01T00:00:${String(++tick).padStart(2, '0')}.000Z`
    for (const w of args.p_hand_writes as { id: string; patch: Row }[]) {
      const row = tables.rummy_player_hands.find((h) => h.id === w.id && h.game_id === args.p_game_id)
      if (!row || faults.handWriteFails) {
        for (const k of Object.keys(tables)) tables[k] = snapshot[k]
        return { data: null, error: { message: 'rummy_apply_transition: hand not found' } }
      }
      Object.assign(row, w.patch)
    }
    faults.afterRpc?.(tables)
    return { data: { status: 'ok', updated_at: session.updated_at }, error: null }
  }

  return { client: { from: builder, rpc } as unknown as SupabaseClient, tables, gamesWrites }
}

const handOf = (tables: Record<string, Row[]>, id: string) =>
  (tables.rummy_player_hands.find((h) => h.player_id === id)?.cards as RummyCard[]) ?? []

describe('Rummy concurrent turn actions', () => {
  it('lets exactly one of several simultaneous discards through', async () => {
    const hand = [c('hearts', 5), c('hearts', 6), c('diamonds', 6), c('hearts', 1), c('clubs', 12)]
    const { client, tables } = makeDb(hand)

    const results = await Promise.all(
      ['hearts-5', 'diamonds-6', 'hearts-1'].map((id) => processRummyDiscard(client, 'ABCD', 'p1', id))
    )

    expect(results.filter((r) => !r.error)).toHaveLength(1)
    expect(results.filter((r) => r.error)).toHaveLength(2)
    // One card left the hand, and it is the one on top of the discard pile: nothing vanishes.
    const left = handOf(tables, 'p1')
    expect(left).toHaveLength(hand.length - 1)
    const session = tables.rummy_sessions[0]
    const top = session.top_discard as RummyCard
    expect(left.map((x) => x.id)).not.toContain(top.id)
    expect((session.discard_pile as RummyCard[]).map((x) => x.id)).toContain(top.id)
    expect(session.current_turn_index).toBe(1)
  })

  it('still discards normally when nothing races', async () => {
    const { client, tables } = makeDb([c('hearts', 5), c('hearts', 6)])
    expect(await processRummyDiscard(client, 'ABCD', 'p1', 'hearts-5')).toEqual({})
    expect(handOf(tables, 'p1').map((x) => x.id)).toEqual(['hearts-6'])
    expect(tables.rummy_sessions[0].turn_step).toBe('draw')
  })

  it('does not let a go-out and a discard both land on the same turn', async () => {
    const hand = [c('hearts', 5), c('spades', 5), c('clubs', 5), c('diamonds', 9)]
    const { client, tables } = makeDb(hand)

    const [out, discard] = await Promise.all([
      processRummyGoOut(client, 'ABCD', 'p1', [['hearts-5', 'spades-5', 'clubs-5']], 'diamonds-9'),
      processRummyDiscard(client, 'ABCD', 'p1', 'diamonds-9'),
    ])

    expect([out, discard].filter((r) => !r.error)).toHaveLength(1)
    const session = tables.rummy_sessions[0]
    // Either the player went out (phase finished, hand empty) or discarded (turn passed, hand kept).
    if (session.phase === 'finished') {
      expect(handOf(tables, 'p1')).toHaveLength(0)
    } else {
      expect(session.current_turn_index).toBe(1)
      expect(handOf(tables, 'p1')).toHaveLength(hand.length - 1)
    }
  })

  it('returns the rpc error and leaves session and hand untouched', async () => {
    const hand = [c('hearts', 5), c('hearts', 6)]
    const { client, tables } = makeDb(hand, { rpcError: 'boom' })
    const before = structuredClone(tables)
    const res = await processRummyDiscard(client, 'ABCD', 'p1', 'hearts-5')
    expect(res.error).toBeTruthy()
    expect(tables.rummy_sessions).toEqual(before.rummy_sessions)
    expect(tables.rummy_player_hands).toEqual(before.rummy_player_hands)
  })

  it('rolls the discard back when the hand write fails, and a retry succeeds', async () => {
    const faults: Faults = { handWriteFails: true }
    const { client, tables } = makeDb([c('hearts', 5), c('hearts', 6)], faults)
    const before = structuredClone(tables)
    expect((await processRummyDiscard(client, 'ABCD', 'p1', 'hearts-5')).error).toBeTruthy()
    expect(tables.rummy_sessions).toEqual(before.rummy_sessions)
    expect(tables.rummy_player_hands).toEqual(before.rummy_player_hands)

    faults.handWriteFails = false
    expect(await processRummyDiscard(client, 'ABCD', 'p1', 'hearts-5')).toEqual({})
    expect(handOf(tables, 'p1').map((x) => x.id)).toEqual(['hearts-6'])
    expect(tables.rummy_sessions[0].current_turn_index).toBe(1)
  })

  it('keeps the session unfinished when the go-out hand write fails, and a retry succeeds', async () => {
    const hand = [c('hearts', 5), c('spades', 5), c('clubs', 5), c('diamonds', 9)]
    const faults: Faults = { handWriteFails: true }
    const { client, tables } = makeDb(hand, faults)
    const meld = [['hearts-5', 'spades-5', 'clubs-5']]

    expect((await processRummyGoOut(client, 'ABCD', 'p1', meld, 'diamonds-9')).error).toBeTruthy()
    expect(tables.rummy_sessions[0].phase).toBe('playing')
    expect(handOf(tables, 'p1')).toHaveLength(hand.length)
    expect(tables.games[0].status).toBe('active')

    faults.handWriteFails = false
    expect(await processRummyGoOut(client, 'ABCD', 'p1', meld, 'diamonds-9')).toEqual({})
    expect(tables.rummy_sessions[0].phase).toBe('finished')
    expect(handOf(tables, 'p1')).toHaveLength(0)
    expect(tables.games[0].status).toBe('finished')
  })

  it('recovers when markGameFinished fails after a committed go-out', async () => {
    const hand = [c('hearts', 5), c('spades', 5), c('clubs', 5), c('diamonds', 9)]
    const faults: Faults = { gamesUpdateError: 'games down' }
    const { client, tables } = makeDb(hand, faults)
    const meld = [['hearts-5', 'spades-5', 'clubs-5']]

    const first = await processRummyGoOut(client, 'ABCD', 'p1', meld, 'diamonds-9')
    expect(first.error).toBeTruthy()
    // The transition itself committed...
    expect(tables.rummy_sessions[0].phase).toBe('finished')
    expect(handOf(tables, 'p1')).toHaveLength(0)
    expect(tables.games[0].status).toBe('active')

    // ...and while the games write keeps failing, a retry keeps reporting it instead of "finished".
    const stillFailing = await processRummyGoOut(client, 'ABCD', 'p1', meld, 'diamonds-9')
    expect(stillFailing.error).toBeTruthy()
    expect(stillFailing.error).not.toBe('Game is finished')

    // Once it recovers, the retry finalizes the game.
    faults.gamesUpdateError = undefined
    expect((await processRummyDiscard(client, 'ABCD', 'p1', 'diamonds-9')).error).toBe('Game is finished')
    expect(tables.games[0].status).toBe('finished')
  })

  it('answers a replay of a committed go-out with success once finalization recovers', async () => {
    const hand = [c('hearts', 5), c('spades', 5), c('clubs', 5), c('diamonds', 9)]
    const faults: Faults = { gamesUpdateError: 'games down' }
    const { client, tables } = makeDb(hand, faults)
    const meld = [['hearts-5', 'spades-5', 'clubs-5']]

    expect((await processRummyGoOut(client, 'ABCD', 'p1', meld, 'diamonds-9')).error).toBeTruthy()
    expect(tables.games[0].status).toBe('active')

    faults.gamesUpdateError = undefined
    // The same go-out, replayed: finalizes the game and reports success instead of "Game is finished".
    expect(await processRummyGoOut(client, 'ABCD', 'p1', meld, 'diamonds-9')).toEqual({})
    expect(tables.games[0].status).toBe('finished')
  })

  it('still rejects a go-out from a different player on a finished round', async () => {
    const { client, tables } = makeDb([c('hearts', 5)])
    Object.assign(tables.rummy_sessions[0], { phase: 'finished', winner_player_id: 'p2' })
    const res = await processRummyGoOut(client, 'ABCD', 'p1', [['hearts-5']], null)
    expect(res.error).toBe('Game is finished')
  })

  it('does not auto-discard when the turn got a fresh deadline after the expiry check', async () => {
    const hand = [c('hearts', 5), c('spades', 5)]
    let reads = 0
    const faults: Faults = {
      afterSessionRead: (t) => {
        reads += 1
        // Reads: 1 = expiry check, 2 = hand reload, 3 = the discard's own load. Another player
        // leaving between the checks gives the same player a new deadline and a new version.
        if (reads === 2) {
          Object.assign(t.rummy_sessions[0], {
            turn_deadline_at: '2999-01-01T00:00:00.000Z',
            updated_at: 'committed-v1',
          })
        }
      },
    }
    const { client, tables } = makeDb(hand, faults)
    tables.rummy_sessions[0].turn_deadline_at = '2020-01-01T00:00:00.000Z'

    const res = await processRummyExpireTurn(client, 'ABCD')
    expect(res).toEqual({ skipped: true })
    expect(handOf(tables, 'p1')).toHaveLength(2)
    expect(tables.rummy_sessions[0].current_turn_index).toBe(0)
  })
  it('does not finalize twice when a retry already finished the game before the original go-out does', async () => {
    const hand = [c('hearts', 5), c('spades', 5), c('clubs', 5), c('diamonds', 9)]
    const faults: Faults = {
      // A retry reaches the finished-session guard and finalizes the game right after the commit.
      afterRpc: (t) => {
        t.games[0].status = 'finished'
      },
    }
    const { client, tables, gamesWrites } = makeDb(hand, faults)
    const meld = [['hearts-5', 'spades-5', 'clubs-5']]

    expect(await processRummyGoOut(client, 'ABCD', 'p1', meld, 'diamonds-9')).toEqual({})
    expect(tables.games[0].status).toBe('finished')
    // The original go-out's finalization is guarded by status = 'active', so it must not write
    // (or award room points) a second time.
    expect(gamesWrites.count).toBe(0)
  })
  it('does not let a stale finalizer finish a newer round started under the same game id', async () => {
    const hand = [c('hearts', 5), c('spades', 5)]
    const faults: Faults = {
      // Round A's finished session has been read; Play Again and a new round (new session id)
      // replace it before the retry's finalization write runs.
      afterSessionRead: (t) => {
        faults.afterSessionRead = undefined
        t.rummy_sessions[0] = { ...t.rummy_sessions[0], id: 's2', phase: 'playing', winner_player_id: null }
      },
    }
    const { client, tables, gamesWrites } = makeDb(hand, faults)
    Object.assign(tables.rummy_sessions[0], { phase: 'finished', winner_player_id: 'p1' })

    const res = await processRummyDiscard(client, 'ABCD', 'p1', 'hearts-5')
    expect(res.error).toBe('Game is finished')
    expect(tables.games[0].status).toBe('active')
    expect(gamesWrites.count).toBe(0)
  })
  it('reads the session before the hands (never in parallel) so a hand is never older than its session version', async () => {
    const hand = [c('hearts', 5), c('spades', 5)]
    const readLog: string[] = []
    const { client } = makeDb(hand, { readLog })
    await processRummyDiscard(client, 'ABCD', 'p1', 'hearts-5')
    const firstRead = readLog.slice(0, 4)
    expect(firstRead).toEqual([
      'rummy_sessions:start',
      'rummy_sessions:end',
      'rummy_player_hands:start',
      'rummy_player_hands:end',
    ])
  })
  it('does not let a clock-expiry finish overwrite a go-out that committed after it loaded the session', async () => {
    const hand = [c('hearts', 5), c('spades', 5)]
    const faults: Faults = {
      clockExpired: true,
      // A go-out wins the session right after the expiry request has read it.
      afterSessionRead: (t) => {
        faults.afterSessionRead = undefined
        Object.assign(t.rummy_sessions[0], { phase: 'finished', winner_player_id: 'p2', updated_at: 'committed-v1' })
      },
    }
    const { client, tables, gamesWrites } = makeDb(hand, faults)

    const res = await processRummyExpireTurn(client, 'ABCD')
    expect(res.error).toBeTruthy()
    // The go-out's committed winner is untouched and the stale snapshot did not run finalization.
    expect(tables.rummy_sessions[0].winner_player_id).toBe('p2')
    expect(gamesWrites.count).toBe(0)
  })

  it('retries a failed game finalization from the turn-expiry path when the session is already finished', async () => {
    const hand = [c('hearts', 5), c('spades', 5)]
    const { client, tables } = makeDb(hand)
    Object.assign(tables.rummy_sessions[0], { phase: 'finished', winner_player_id: 'p1' })
    expect(tables.games[0].status).toBe('active')

    const res = await processRummyExpireTurn(client, 'ABCD')
    expect(res).toEqual({ skipped: true })
    expect(tables.games[0].status).toBe('finished')
  })
  it('does not replace a committed go-out winner when the expiry route loads the already-finished session', async () => {
    // p1 went out (empty hand, winner) but the games finalization failed, so the game is still active.
    const { client, tables } = makeDb([], { clockExpired: true })
    tables.rummy_player_hands[1].cards = [c('hearts', 5), c('spades', 5), c('clubs', 5)]
    Object.assign(tables.rummy_sessions[0], {
      phase: 'finished',
      winner_player_id: 'p1',
      status_message: 'Ana went out',
    })

    const ok = await finishExpiredRummyGame(client, {
      id: 'ABCD',
      status: 'active',
      session_started_at: '2020-01-01T00:00:00.000Z',
      game_duration_seconds: 60,
    } as never)

    expect(ok).toBe(true)
    // p2 holds the closest-to-going-out hand, but the committed winner is untouched...
    expect(tables.rummy_sessions[0].winner_player_id).toBe('p1')
    expect(tables.rummy_sessions[0].status_message).toBe('Ana went out')
    // ...and only the games finalization was retried.
    expect(tables.games[0].status).toBe('finished')
  })
  it('retries a leave against the fresh session when a turn action commits after it was read', async () => {
    const hand = [c('hearts', 5), c('spades', 5)]
    const faults: Faults = {
      // A discard advances the turn right after removeRummyPlayer has read the session.
      afterSessionRead: (t) => {
        faults.afterSessionRead = undefined
        Object.assign(t.rummy_sessions[0], { current_turn_index: 1, updated_at: 'committed-v1' })
      },
    }
    const { client, tables } = makeDb(hand, faults)
    tables.players.push({ id: 'p3', game_id: 'ABCD', name: 'Cy' })
    tables.rummy_sessions[0].turn_order = ['p1', 'p2', 'p3']
    tables.rummy_player_hands.push({ id: 'h3', game_id: 'ABCD', player_id: 'p3', player_order: 2, cards: [] })

    const res = await removeRummyPlayer(client, 'ABCD', 'p3', 'Cy')

    // The committed discard is not undone (the turn stays with p2) and the leave goes through.
    expect(res.error).toBeNull()
    expect(tables.rummy_sessions[0].current_turn_index).toBe(1)
    expect(tables.rummy_sessions[0].turn_order).toEqual(['p1', 'p2'])
    expect(tables.rummy_player_hands.some((h) => h.player_id === 'p3')).toBe(false)
    expect(tables.players.some((p) => p.id === 'p3')).toBe(false)
  })

  it('does not remove a leaving player (or restore the old turn index) while turn actions keep racing it', async () => {
    const hand = [c('hearts', 5), c('spades', 5)]
    let n = 0
    const faults: Faults = {
      // Every read of the session is immediately followed by another committed turn action.
      afterSessionRead: (t) => {
        n += 1
        Object.assign(t.rummy_sessions[0], { current_turn_index: 1, updated_at: `committed-v${n}` })
      },
    }
    const { client, tables } = makeDb(hand, faults)
    tables.players.push({ id: 'p3', game_id: 'ABCD', name: 'Cy' })
    tables.rummy_sessions[0].turn_order = ['p1', 'p2', 'p3']
    tables.rummy_player_hands.push({ id: 'h3', game_id: 'ABCD', player_id: 'p3', player_order: 2, cards: [] })

    const res = await removeRummyPlayer(client, 'ABCD', 'p3', 'Cy')

    expect(res.error).toBeTruthy()
    // Exhausted retries are a retryable conflict (the route answers 409), not an internal failure.
    expect(res.conflict).toBe(true)
    expect(n).toBe(3)
    expect(tables.rummy_sessions[0].current_turn_index).toBe(1)
    expect(tables.rummy_sessions[0].turn_order).toEqual(['p1', 'p2', 'p3'])
    expect(tables.rummy_player_hands.some((h) => h.player_id === 'p3')).toBe(true)
    expect(tables.players.some((p) => p.id === 'p3')).toBe(true)
  })

  const threeSeats = (faults: Faults = {}) => {
    const db = makeDb([c('hearts', 5), c('spades', 5)], faults)
    db.tables.players.push({ id: 'p3', game_id: 'ABCD', name: 'Cy' })
    db.tables.rummy_sessions[0].turn_order = ['p1', 'p2', 'p3']
    db.tables.rummy_player_hands.push({ id: 'h3', game_id: 'ABCD', player_id: 'p3', player_order: 2, cards: [] })
    return db
  }

  it('gives the next player a fresh draw step when the current player leaves after drawing', async () => {
    const { client, tables } = threeSeats()
    expect(tables.rummy_sessions[0].turn_step).toBe('discard') // p1 already drew

    const res = await removeRummyPlayer(client, 'ABCD', 'p1', 'Ana')

    expect(res.error).toBeNull()
    expect(tables.rummy_sessions[0].turn_order).toEqual(['p2', 'p3'])
    expect(tables.rummy_sessions[0].current_turn_index).toBe(0)
    expect(tables.rummy_sessions[0].turn_step).toBe('draw')
    // The successor must draw, and cannot skip the draw by discarding straight away.
    expect(await processRummyDiscard(client, 'ABCD', 'p2', 'clubs-1')).toEqual({
      error: 'You must draw before discarding',
    })
    expect((await processRummyDraw(client, 'ABCD', 'p2', 'pile')).error).toBeUndefined()
  })

  it("keeps the current player's step when someone else leaves", async () => {
    const { client, tables } = threeSeats()
    expect((await removeRummyPlayer(client, 'ABCD', 'p3', 'Cy')).error).toBeNull()
    expect(tables.rummy_sessions[0].current_turn_index).toBe(0)
    expect(tables.rummy_sessions[0].turn_step).toBe('discard')
  })

  it('retries a deadlock on the leave claim and never leaks the database text', async () => {
    const { client, tables } = threeSeats({
      sessionUpdateErrors: [{ code: '40P01', message: 'deadlock detected' }],
    })
    const res = await removeRummyPlayer(client, 'ABCD', 'p3', 'Cy')
    expect(res.error).toBeNull()
    expect(tables.players.some((p) => p.id === 'p3')).toBe(false)
  })

  it('answers a deadlock that outlasts the retries as a retryable conflict, and a repeat leave completes it', async () => {
    const deadlock = { code: '40P01', message: 'deadlock detected' }
    const { client, tables } = threeSeats({ sessionUpdateErrors: [deadlock, deadlock, deadlock] })

    const res = await removeRummyPlayer(client, 'ABCD', 'p3', 'Cy')
    expect(res.conflict).toBe(true)
    expect(res.error).not.toMatch(/deadlock/i)
    expect(tables.players.some((p) => p.id === 'p3')).toBe(true) // still seated, nothing half-removed

    const again = await removeRummyPlayer(client, 'ABCD', 'p3', 'Cy')
    expect(again.error).toBeNull()
    expect(tables.players.some((p) => p.id === 'p3')).toBe(false)
    expect(tables.rummy_player_hands.some((h) => h.player_id === 'p3')).toBe(false)
  })

  it('does not leak raw database text for a non-retryable failure and does not call it a conflict', async () => {
    const { client } = threeSeats({ sessionUpdateErrors: [{ message: 'relation "rummy_sessions" is locked' }] })
    const res = await removeRummyPlayer(client, 'ABCD', 'p3', 'Cy')
    expect(res.error).toBeTruthy()
    expect(res.error).not.toContain('rummy_sessions')
    expect(res.conflict).toBeUndefined()
  })

  it('completes a leave whose hand delete deadlocked after the turn claim on the next attempt', async () => {
    const { client, tables } = threeSeats({ handDeleteErrors: [{ code: '40P01', message: 'deadlock detected' }] })
    const res = await removeRummyPlayer(client, 'ABCD', 'p3', 'Cy')
    expect(res.error).toBeNull()
    expect(tables.rummy_sessions[0].turn_order).toEqual(['p1', 'p2'])
    expect(tables.rummy_player_hands.some((h) => h.player_id === 'p3')).toBe(false)
    expect(tables.players.some((p) => p.id === 'p3')).toBe(false)
  })

  it('removes a leaving player normally when nothing raced', async () => {
    const { client, tables } = makeDb([c('hearts', 5)])
    tables.players.push({ id: 'p3', game_id: 'ABCD', name: 'Cy' })
    tables.rummy_sessions[0].turn_order = ['p1', 'p2', 'p3']
    tables.rummy_player_hands.push({ id: 'h3', game_id: 'ABCD', player_id: 'p3', player_order: 2, cards: [] })

    const res = await removeRummyPlayer(client, 'ABCD', 'p3', 'Cy')

    expect(res.error).toBeNull()
    expect(tables.rummy_sessions[0].turn_order).toEqual(['p1', 'p2'])
    expect(tables.rummy_player_hands.some((h) => h.player_id === 'p3')).toBe(false)
    expect(tables.players.some((p) => p.id === 'p3')).toBe(false)
  })

  it('does not delete the leaver or their hand when the retry read of the session fails', async () => {
    const hand = [c('hearts', 5), c('spades', 5)]
    const faults: Faults = {
      failSessionMaybeSingleOn: 2,
      // A turn action commits right after the first read, forcing the version conflict and a retry.
      afterSessionRead: (t) => {
        faults.afterSessionRead = undefined
        Object.assign(t.rummy_sessions[0], { current_turn_index: 1, updated_at: 'committed-v1' })
      },
    }
    const { client, tables } = makeDb(hand, faults)
    tables.players.push({ id: 'p3', game_id: 'ABCD', name: 'Cy' })
    tables.rummy_sessions[0].turn_order = ['p1', 'p2', 'p3']
    tables.rummy_player_hands.push({ id: 'h3', game_id: 'ABCD', player_id: 'p3', player_order: 2, cards: [] })

    const res = await removeRummyPlayer(client, 'ABCD', 'p3', 'Cy')

    expect(res.error).toBeTruthy()
    expect(tables.rummy_sessions[0].turn_order).toEqual(['p1', 'p2', 'p3'])
    expect(tables.rummy_player_hands.some((h) => h.player_id === 'p3')).toBe(true)
    expect(tables.players.some((p) => p.id === 'p3')).toBe(true)
  })

  it('does not delete the leaver when the very first read of the session fails', async () => {
    const { client, tables } = makeDb([c('hearts', 5)], { failSessionMaybeSingleOn: 1 })
    const res = await removeRummyPlayer(client, 'ABCD', 'p2', 'Ben')
    expect(res.error).toBeTruthy()
    expect(tables.rummy_player_hands.some((h) => h.player_id === 'p2')).toBe(true)
    expect(tables.players.some((p) => p.id === 'p2')).toBe(true)
  })

  it('does not draw or discard when the deadline was renewed between the expiry read and the draw', async () => {
    const hand = [c('hearts', 5), c('spades', 5)]
    const faults: Faults = {
      afterSessionRead: (t) => {
        faults.afterSessionRead = undefined
        // Read 1 is the expiry check; the turn then gets a fresh deadline and version (a leave).
        Object.assign(t.rummy_sessions[0], {
          turn_deadline_at: '2999-01-01T00:00:00.000Z',
          updated_at: 'committed-v1',
        })
      },
    }
    const { client, tables } = makeDb(hand, faults)
    Object.assign(tables.rummy_sessions[0], { turn_step: 'draw', turn_deadline_at: '2020-01-01T00:00:00.000Z' })

    const res = await processRummyExpireTurn(client, 'ABCD')

    expect(res).toEqual({ skipped: true })
    expect(handOf(tables, 'p1')).toHaveLength(2)
    expect((tables.rummy_sessions[0].draw_pile as RummyCard[]).map((x) => x.id)).toEqual(['clubs-9'])
    expect(tables.rummy_sessions[0].turn_step).toBe('draw')
    expect(tables.rummy_sessions[0].current_turn_index).toBe(0)
  })

  it('rejects a discard bound to a version that differs only in microseconds', async () => {
    const { client, tables } = makeDb([c('hearts', 5), c('hearts', 6)])
    tables.rummy_sessions[0].updated_at = '2026-01-01T00:00:00.000200+00:00'
    const stale = await processRummyDiscard(client, 'ABCD', 'p1', 'hearts-5', '2026-01-01T00:00:00.000100+00:00')
    expect(stale.error).toMatch(/already updated this turn/)
    expect(handOf(tables, 'p1')).toHaveLength(2)
  })
})

describe('rummyVersionKey', () => {
  it('tells apart versions inside the same millisecond', () => {
    expect(rummyVersionKey('2026-01-01T00:00:00.000100+00:00')).not.toBe(
      rummyVersionKey('2026-01-01T00:00:00.000200+00:00')
    )
  })

  it('treats formatting differences of one instant as equal', () => {
    const a = rummyVersionKey('2026-01-01T00:00:00.5+00:00')
    expect(rummyVersionKey('2026-01-01T00:00:00.500000Z')).toBe(a)
    expect(rummyVersionKey('2026-01-01 00:00:00.500000+00')).toBe(a)
    expect(rummyVersionKey('2026-01-01T01:00:00.500000+01:00')).toBe(a)
  })

  it('falls back to the raw text for non-timestamps', () => {
    expect(rummyVersionKey('committed-v1')).toBe('committed-v1')
  })
})
