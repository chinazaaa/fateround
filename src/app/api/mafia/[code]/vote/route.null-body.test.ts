import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/mafia/[code]/vote parses its body inside a try/catch but destructures it OUTSIDE:
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
    updateError: null as unknown,
  },
}))

// Faithful to the real call chains in the route:
//   admin.from('mafia_sessions').select('*').eq('game_id', id).maybeSingle() -> { data, error }
//   admin.from('mafia_player_states').select('*').eq('game_id', id)          -> { data, error }
//   admin.from('mafia_player_states').update({...}).eq('id', x)              -> { error }
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => tables[table as 'mafia_sessions'],
          then: (resolve: (v: unknown) => unknown) => resolve(tables[table as 'mafia_player_states']),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: tables.updateError }),
      }),
    }),
  }),
}))

// Real signature: (supabase, gameCode, resumeToken, opts?) =>
//   Promise<{ error, status, player, id }> — error/player are mutually exclusive.
vi.mock('@/lib/game-admin', () => ({ assertPlayer }))

type Post = typeof import('./route').POST
let POST: Post

const ALIVE_VOTER = { id: 'state-1', player_id: 'p1', is_alive: true, day_vote_target_player_id: null }
const ALIVE_TARGET = { id: 'state-2', player_id: 'p2', is_alive: true, day_vote_target_player_id: null }

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  assertPlayer.mockReset()
  assertPlayer.mockResolvedValue({ error: null, status: 200, player: { id: 'p1' }, id: 'ABCD' })
  tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'voting' }, error: null }
  tables.mafia_player_states = { data: [ALIVE_VOTER, ALIVE_TARGET], error: null }
  tables.updateError = null
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/mafia/ABCD/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ code: 'abcd' }) }
  )
}

describe('POST /api/mafia/[code]/vote — null JSON body', () => {
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
  ])('answers 400 "Invalid parameters" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  it.each([
    ['a malformed body', '{"resumeToken":'],
    ['an empty body', ''],
  ])('answers 400 "Invalid body" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid body' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // Past the gates, not into them.
  it('answers 200 for a valid body with a target', async () => {
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(assertPlayer).toHaveBeenCalledWith(expect.anything(), 'ABCD', 'tok1')
  })

  it('answers 200 for a valid body missing the optional targetPlayerId (abstain)', async () => {
    const res = await post('{"resumeToken":"tok1"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  // Gate precedence: a bad token AND a bad phase in one request must still answer the
  // auth failure, so a swap cannot silently reorder auth behind game-state checks.
  it('answers the auth failure before the phase check when both are wrong', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'night' }, error: null }
    const res = await post('{"resumeToken":"bad","targetPlayerId":"p2"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('answers 400 "Voting is not active" for a valid authorized request in the wrong phase', async () => {
    tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'night' }, error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Voting is not active' })
  })
})
