import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/mafia/[code]/revenge-target parses its body inside a try/catch but destructures
 * it OUTSIDE:
 *
 *   try { body = await req.json() } catch { return 400 'Invalid body' }
 *   const { resumeToken, targetPlayerId } = body
 *
 * `req.json()` parses a literal `null` body SUCCESSFULLY, so the `catch` never fires and
 * `body` is `null`. Destructuring `null` then throws a TypeError from OUTSIDE the try, so
 * the handler's returned promise REJECTS (an unhandled rejection → 500 in prod) instead of
 * answering a status. There is no gate before the parse: this route is reachable
 * unauthenticated.
 *
 * This suite pins the exact status/body for every body shape so the `?? {}` fix can only
 * move the `null` row.
 */

vi.mock('server-only', () => ({}))

const { assertPlayer, tables } = vi.hoisted(() => ({
  assertPlayer: vi.fn(),
  tables: {
    mafia_sessions: { data: null as unknown, error: null },
    mafia_player_states: { data: null as unknown, error: null },
  },
}))

// Faithful to the real call chains in the route:
//   admin.from('mafia_sessions').select('*').eq('game_id', id).maybeSingle() -> { data, error }
//   admin.from('mafia_player_states').select('*').eq('game_id', id)          -> { data, error }
//   admin.from('mafia_player_states').update({...}).eq('id', x)              -> { error }
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => tables[table as 'mafia_sessions'],
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(tables[table as 'mafia_player_states']).then(resolve, reject),
        }
        return chain
      },
      update: () => {
        const chain = {
          eq: () => chain,
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(resolve, reject),
        }
        return chain
      },
    }),
  }),
}))

// Real signature: (supabase, gameCode, resumeToken, opts?) =>
//   Promise<{ error, status, player, id }> — error/player are mutually exclusive.
vi.mock('@/lib/game-admin', () => ({ assertPlayer }))

type Post = typeof import('./route').POST
let POST: Post

const CUB = { id: 'state-1', player_id: 'p1', is_alive: true, role: 'wolf_cub', seat_number: 1 }
const TARGET = { id: 'state-2', player_id: 'p2', is_alive: true, role: 'villager', seat_number: 2 }

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  assertPlayer.mockReset()
  assertPlayer.mockResolvedValue({ error: null, status: 200, player: { id: 'p1' }, id: 'ABCD' })
  tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'night', day_number: 1 }, error: null }
  tables.mafia_player_states = { data: [CUB, TARGET], error: null }
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/mafia/ABCD/revenge-target', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ code: 'abcd' }) }
  )
}

describe('POST /api/mafia/[code]/revenge-target — null JSON body', () => {
  it('answers 400 "Invalid parameters" for a literal null body, exactly like {}', async () => {
    const res = await post('null')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object body', '{}'],
    ['a numeric scalar body', '5'],
    ['a string scalar body', '"str"'],
    ['an array body', '[]'],
    ['a valid body missing resumeToken', '{"targetPlayerId":"p2"}'],
    ['a valid body missing targetPlayerId', '{"resumeToken":"tok1"}'],
  ])('answers 400 "Invalid parameters" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  it.each([
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
  ])('answers 400 "Invalid body" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid body' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // Past every gate — auth, phase, role, target — to the terminal success response.
  it('answers 200 for a fully valid body from an alive Junior Mafia', async () => {
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(assertPlayer).toHaveBeenCalledWith(expect.anything(), 'ABCD', 'tok1')
  })

  // Gate precedence: the parameter shape check runs BEFORE auth, so a request that is both
  // malformed and unauthenticated must answer the parameter failure and never call assertPlayer.
  it('answers "Invalid parameters" before auth when the body is bad AND the token is wrong', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    const res = await post('{"targetPlayerId":"p2"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // Gate precedence: a bad token AND a forbidden phase in one request must still answer the
  // auth failure, so a swap cannot silently reorder auth behind game-state checks.
  it('answers the auth failure before the phase check when both are wrong', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'game_over' }, error: null }
    const res = await post('{"resumeToken":"bad","targetPlayerId":"p2"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('answers 400 "Cannot set revenge target in this phase" in game_over', async () => {
    tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'game_over' }, error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Cannot set revenge target in this phase' })
  })

  it('answers 403 when the caller is not an alive Junior Mafia', async () => {
    tables.mafia_player_states = { data: [{ ...CUB, role: 'villager' }, TARGET], error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      error: 'Only an alive Junior Mafia can set a revenge target',
    })
  })

  it('answers 400 when the target is not alive', async () => {
    tables.mafia_player_states = { data: [CUB, { ...TARGET, is_alive: false }], error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Target must be an alive player' })
  })
})
