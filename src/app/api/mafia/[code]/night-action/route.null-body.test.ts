import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/mafia/[code]/night-action parses its body inside a try/catch but destructures it
 * OUTSIDE:
 *
 *   try { body = await req.json() } catch { return 400 'Invalid body' }
 *   const { resumeToken, targetPlayerId, secondTargetPlayerId, potionType } = body
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
    mafiaSession: { data: null as unknown, error: null as unknown },
    playerStates: { data: null as unknown, error: null as unknown },
    stateUpdate: { data: null as unknown, error: null as unknown },
  },
}))

// Faithful to the real call chains in the route:
//   admin.from('mafia_sessions').select('*').eq('game_id', id).maybeSingle() -> { data, error }
//   admin.from('mafia_player_states').select('*').eq('game_id', id)          -> { data, error }
//   admin.from('mafia_player_states').update({...}).eq('id', x)              -> { error }
// (the role branches this suite does not exercise add .is()/.in()/.select()/insert() links
// to the same chain, so the builder below answers every one of them.)
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      let op: 'select' | 'update' | 'insert' = 'select'
      const result = () => {
        if (op !== 'select') return tables.stateUpdate
        if (table === 'mafia_sessions') return tables.mafiaSession
        if (table === 'mafia_player_states') return tables.playerStates
        return { data: [], error: null }
      }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        in: () => chain,
        update: () => {
          op = 'update'
          return chain
        },
        insert: () => {
          op = 'insert'
          return chain
        },
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      }
      return chain
    },
  }),
}))

// Real signature: (supabase, gameCode, resumeToken, opts?) =>
//   Promise<{ error, status, player, id }> — error/player are mutually exclusive.
vi.mock('@/lib/game-admin', () => ({ assertPlayer }))

type Post = typeof import('./route').POST
let POST: Post

// Seer takes the generic single-target path at the bottom of the handler — one
// representative success route past every gate. The role-specific branches
// (cupid/witch/trapper/…) are deliberately out of scope here.
const SEER = { id: 'state-1', player_id: 'p1', seat_number: 1, role: 'seer', is_alive: true }
const TARGET = { id: 'state-2', player_id: 'p2', seat_number: 2, role: 'villager', is_alive: true }

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  assertPlayer.mockReset()
  assertPlayer.mockResolvedValue({ error: null, status: 200, player: { id: 'p1' }, id: 'ABCD' })
  tables.mafiaSession = { data: { game_id: 'ABCD', phase: 'night', day_number: 2, seer_enabled: true }, error: null }
  tables.playerStates = { data: [SEER, TARGET], error: null }
  tables.stateUpdate = { data: [{ id: 'state-1' }], error: null }
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/mafia/ABCD/night-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ code: 'abcd' }) }
  )
}

describe('POST /api/mafia/[code]/night-action — null JSON body', () => {
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
    ['a valid body missing targetPlayerId', '{"resumeToken":"tok1"}'],
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
  it('answers 200 for a valid Seer submission that clears every gate', async () => {
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(assertPlayer).toHaveBeenCalledWith(expect.anything(), 'ABCD', 'tok1')
  })

  // Gate precedence: a bad token AND a bad phase in one request must still answer the
  // auth failure, so a swap cannot silently reorder auth behind game-state checks.
  it('answers the auth failure before the phase check when both are wrong', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    tables.mafiaSession = { data: { game_id: 'ABCD', phase: 'day', day_number: 2, seer_enabled: true }, error: null }
    const res = await post('{"resumeToken":"bad","targetPlayerId":"p2"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  // Gate precedence: phase is checked before the role's night-action eligibility.
  it('answers the phase failure before the role check when both are wrong', async () => {
    tables.mafiaSession = { data: { game_id: 'ABCD', phase: 'day', day_number: 2, seer_enabled: true }, error: null }
    tables.playerStates = { data: [{ ...SEER, role: 'villager' }, TARGET], error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'It is not night' })
  })

  it('answers 400 "It is not night" for a valid authorized request in the wrong phase', async () => {
    tables.mafiaSession = { data: { game_id: 'ABCD', phase: 'day', day_number: 2, seer_enabled: true }, error: null }
    const res = await post('{"resumeToken":"tok1","targetPlayerId":"p2"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'It is not night' })
  })
})
