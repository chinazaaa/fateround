import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimit: async () => null,
}))
vi.mock('@/lib/identity-server', () => ({ getProfileFromRequest: async () => null }))

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
const failNext: Record<string, number> = {}
const deletes: string[] = []

/** Tiny stateful Supabase stand-in: equality filters, update, delete and one-shot delete failures. */
function builder(table: string) {
  const filters: [string, unknown][] = []
  let patch: Row | null = null
  let deleting = false
  const match = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
  const run = async () => {
    await Promise.resolve()
    if (deleting) {
      const key = `${table}:delete`
      if (failNext[key] > 0) {
        failNext[key]--
        return { data: null, error: { message: 'boom' } }
      }
      const doomed = match()
      for (const d of doomed) deletes.push(`${table}:${String(d.id ?? d.player_id)}`)
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
    eq: (k: string, v: unknown) => (filters.push([k, v]), api),
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

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const S = '00000000-0000-4000-8000-00000000000c'
const HOST = 'host-token-123456'
const remove = (playerId: string, hostToken = HOST) =>
  DELETE(
    new NextRequest('https://x.test/api/players', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameCode: 'abcd', playerId, hostToken }),
    })
  )

const seat = (id: string, name: string, extra: Row = {}) => ({ id, game_id: 'ABCD', name, ...extra })
const seatIds = () => tables.players.map((p) => p.id)
const chessGame = (status: string) => ({ id: 'ABCD', status, game_type: 'chess', host_token: HOST })
const chessSession = (statusMessage: string) => ({
  game_id: 'ABCD',
  status: 'finished',
  player_white_id: A,
  player_black_id: B,
  winner_player_id: B,
  status_message: statusMessage,
})

beforeEach(async () => {
  DELETE ??= (await import('./route')).DELETE
  deletes.length = 0
  for (const k of Object.keys(failNext)) delete failNext[k]
})

describe('DELETE /api/players: host removal on a finished game', () => {
  it('a host repeat removal completes a forfeit cleanup that stalled after the game finished (chess)', async () => {
    tables = {
      games: [chessGame('finished')],
      chess_sessions: [chessSession('Ann left — Bob wins!')],
      players: [seat(A, 'Ann'), seat(B, 'Bob')],
    }
    const res = await remove(A)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(seatIds()).toEqual([B])
  })

  it('answers retained and keeps the row for the winner of a finished game', async () => {
    tables = {
      games: [chessGame('finished')],
      chess_sessions: [chessSession('Checkmate — Bob wins!')],
      players: [seat(A, 'Ann'), seat(B, 'Bob')],
    }
    const res = await remove(B)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, retained: true })
    expect(seatIds()).toEqual([A, B])
  })

  it('answers retained for a spectator and for an ordinary finished Whot game', async () => {
    tables = {
      games: [{ id: 'ABCD', status: 'finished', game_type: 'whot', host_token: HOST }],
      whot_sessions: [{ game_id: 'ABCD', turn_order: [A, B], finish_order: [A] }],
      players: [seat(A, 'Ann'), seat(B, 'Bob'), seat(S, 'Spec', { spectator: true })],
    }
    for (const pid of [A, S]) {
      const res = await remove(pid)
      expect(await res.json()).toEqual({ success: true, retained: true })
    }
    expect(seatIds()).toEqual([A, B, S])
  })

  it('completes a stalled Whot leave via the host path', async () => {
    tables = {
      games: [{ id: 'ABCD', status: 'finished', game_type: 'whot', host_token: HOST }],
      whot_sessions: [{ game_id: 'ABCD', turn_order: [B], finish_order: [B] }],
      whot_player_hands: [],
      players: [seat(A, 'Ann'), seat(B, 'Bob')],
    }
    const res = await remove(A)
    expect(await res.json()).toEqual({ success: true })
    expect(seatIds()).toEqual([B])
  })

  it('still rejects a bad host token on a finished game', async () => {
    tables = {
      games: [chessGame('finished')],
      chess_sessions: [chessSession('Ann left — Bob wins!')],
      players: [seat(A, 'Ann'), seat(B, 'Bob')],
    }
    const res = await remove(A, 'wrong-token')
    expect(res.status).toBe(403)
    expect(seatIds()).toEqual([A, B])
  })

  it('keeps the 400 for finished games of other types', async () => {
    tables = {
      games: [{ id: 'ABCD', status: 'finished', game_type: 'trivia', host_token: HOST }],
      players: [seat(A, 'Ann')],
    }
    const res = await remove(A)
    expect(res.status).toBe(400)
    expect(seatIds()).toEqual([A])
  })
})
