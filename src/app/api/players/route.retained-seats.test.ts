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
let rpcImpl: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown } = () => ({
  data: null,
  error: null,
})
const client = { from: builder, rpc: async (name: string, args: Record<string, unknown>) => rpcImpl(name, args) }
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => client }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => client }))

const removeUnoPlayer = vi.fn()
const removeScrabblePlayer = vi.fn()
vi.mock('@/lib/uno', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/uno')>()),
  removeUnoPlayer: (...args: unknown[]) => removeUnoPlayer(...args),
}))
vi.mock('@/lib/scrabble', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/scrabble')>()),
  removeScrabblePlayer: (...args: unknown[]) => removeScrabblePlayer(...args),
}))

type Del = typeof import('./route').DELETE
let DELETE: Del

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const HOST = 'host-token-123456'
const remove = (playerId: string) =>
  DELETE(
    new NextRequest('https://x.test/api/players', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameCode: 'abcd', playerId, hostToken: HOST }),
    })
  )

const world = (gameType: string, status: string) => {
  tables = {
    games: [{ id: 'ABCD', status, game_type: gameType, host_token: HOST }],
    players: [
      { id: A, game_id: 'ABCD', name: 'Ann' },
      { id: B, game_id: 'ABCD', name: 'Bob' },
    ],
    push_subscriptions: [
      { id: 'ps-a', game_id: 'ABCD', player_id: A },
      { id: 'ps-b', game_id: 'ABCD', player_id: B },
    ],
    mobile_push_tokens: [
      { id: 'mt-a', game_id: 'ABCD', player_id: A },
      { id: 'mt-b', game_id: 'ABCD', player_id: B },
    ],
  }
}
const pushDeletes = () =>
  deletes.filter((d) => d.startsWith('push_subscriptions:') || d.startsWith('mobile_push_tokens:'))
const seatIds = () => tables.players.map((p) => p.id)

beforeEach(async () => {
  DELETE ??= (await import('./route')).DELETE
  deletes.length = 0
  for (const k of Object.keys(failNext)) delete failNext[k]
  rpcImpl = () => ({ data: null, error: null })
  removeUnoPlayer.mockReset()
  removeScrabblePlayer.mockReset()
}, 60_000) // the one-time import of the route pulls a large dependency graph

describe('DELETE /api/players: a retained seat unsubscribes exactly that player', () => {
  it('a finished Uno game with no pending departure: retained, the seat stays, both push deletes ran for that player only', async () => {
    world('uno', 'finished')
    rpcImpl = () => ({ data: { status: 'none' }, error: null })
    const res = await remove(A)
    expect(await res.json()).toEqual({ success: true, retained: true })
    expect(seatIds()).toEqual([A, B])
    expect(pushDeletes().sort()).toEqual(['mobile_push_tokens:mt-a', 'push_subscriptions:ps-a'])
  })

  it('the host completes a marked Uno departure of a finished round: the cleanup runs and the pending seat is removed', async () => {
    world('uno', 'finished')
    const calls: string[] = []
    rpcImpl = (name, args) => {
      calls.push(`${name}:${String(args.p_player_id)}`)
      tables.players = tables.players.filter((p) => p.id !== args.p_player_id)
      return { data: { status: 'completed' }, error: null }
    }
    const res = await remove(A)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(calls).toEqual([`complete_uno_departure:${A}`])
    expect(seatIds()).toEqual([B])
    expect(pushDeletes()).toEqual([])
  })

  it.each([
    ['uno', removeUnoPlayer],
    ['scrabble', removeScrabblePlayer],
  ])('%s: a removal that reports a retained seat keeps the row and unsubscribes that player', async (type, remover) => {
    world(type, 'active')
    remover.mockResolvedValue({ error: null, retained: true })
    const res = await remove(A)
    expect(await res.json()).toEqual({ success: true, retained: true })
    expect(seatIds()).toEqual([A, B])
    expect(pushDeletes().sort()).toEqual(['mobile_push_tokens:mt-a', 'push_subscriptions:ps-a'])
  })

  it.each([
    ['uno', removeUnoPlayer],
    ['scrabble', removeScrabblePlayer],
  ])('%s: an ordinary removal does not unsubscribe anything here', async (type, remover) => {
    world(type, 'active')
    remover.mockResolvedValue({ error: null })
    const res = await remove(A)
    expect(await res.json()).toEqual({ success: true })
    expect(pushDeletes()).toEqual([])
  })
})
