import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/mafia/[code]/skip-phase parses its body inside a try/catch but READS a property
 * off it OUTSIDE (it does not destructure, unlike its sibling routes):
 *
 *   try { body = await req.json() } catch { return 400 'Invalid body' }
 *   if (typeof body.resumeToken !== 'string') ...
 *
 * `req.json()` parses a literal `null` body SUCCESSFULLY, so the `catch` never fires and
 * `body` is `null`. Reading `body.resumeToken` then throws a TypeError from OUTSIDE the try
 * ("Cannot read properties of null (reading 'resumeToken')" — a different message from the
 * destructuring routes, same root cause), so the handler's returned promise REJECTS (an
 * unhandled rejection → 500 in prod) instead of answering a status. There is no gate before
 * the parse: this route is reachable unauthenticated.
 *
 * This suite pins the exact status/body for every body shape so the `?? {}` fix can only
 * move the `null` row.
 */

vi.mock('server-only', () => ({}))

const { assertPlayer, runMafiaAdvance, inserts, rpc, tables } = vi.hoisted(() => ({
  assertPlayer: vi.fn(),
  runMafiaAdvance: vi.fn(),
  inserts: vi.fn(),
  rpc: vi.fn(),
  tables: {
    mafia_sessions: { data: null as unknown, error: null },
    mafia_player_states: { data: null as unknown, error: null },
  },
}))

// Faithful to the real call chains in the route:
//   admin.from('mafia_sessions').select('*').eq('game_id', id).maybeSingle()          -> { data, error }
//   admin.from('mafia_player_states').select('*').eq('game_id', id)                   -> { data, error }
//   admin.rpc('mafia_append_skip_request', {...})                                     -> { data, error }
//   admin.from('mafia_sessions').select('phase, skip_requested_player_ids')...maybeSingle()
//   admin.from('mafia_chat_messages').insert({...})                                   -> { error }
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    rpc,
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
      insert: async (row: unknown) => {
        inserts(table, row)
        return { error: null }
      },
    }),
  }),
}))

// Real signature: (supabase, gameCode, resumeToken, opts?) =>
//   Promise<{ error, status, player, id }> — error/player are mutually exclusive.
vi.mock('@/lib/game-admin', () => ({ assertPlayer }))

// Real signature: (gameId, opts?) => Promise<{ ok: true } | { ok: false; error; status }>
vi.mock('@/lib/mafia-advance', () => ({ runMafiaAdvance }))

type Post = typeof import('./route').POST
let POST: Post

// 4 alive → skipRequired = floor(4/2) + 1 = 3
const STATES = [
  { id: 'state-1', player_id: 'p1', is_alive: true, role: 'villager' },
  { id: 'state-2', player_id: 'p2', is_alive: true, role: 'mafia' },
  { id: 'state-3', player_id: 'p3', is_alive: true, role: 'villager' },
  { id: 'state-4', player_id: 'p4', is_alive: true, role: 'villager' },
]

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  assertPlayer.mockReset()
  assertPlayer.mockResolvedValue({ error: null, status: 200, player: { id: 'p1' }, id: 'ABCD' })
  runMafiaAdvance.mockReset()
  runMafiaAdvance.mockResolvedValue({ ok: true })
  inserts.mockReset()
  rpc.mockReset()
  rpc.mockResolvedValue({ data: ['p1'], error: null })
  tables.mafia_sessions = {
    data: { game_id: 'ABCD', phase: 'day', skip_requested_player_ids: ['p1'] },
    error: null,
  }
  tables.mafia_player_states = { data: STATES, error: null }
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/mafia/ABCD/skip-phase', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ code: 'abcd' }) }
  )
}

describe('POST /api/mafia/[code]/skip-phase — null JSON body', () => {
  it('answers 400 "Invalid parameters" for a literal null body, exactly like {}', async () => {
    const res = await post('null')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object body', '{}'],
    ['an array body', '[]'],
    ['a valid body missing resumeToken', '{"targetPlayerId":"p2"}'],
  ])('answers 400 "Invalid parameters" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // Scalars do not throw here: property access on a number/string primitive is legal
  // (it boxes), so `5 .resumeToken` is just undefined — only `null` blows up.
  it.each([
    ['a numeric scalar body', '5'],
    ['a string scalar body', '"str"'],
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

  // Past every gate — auth, phase, alive — to the terminal success response. 1 of the 3
  // required skips, so the phase does NOT advance.
  it('answers 200 with the skip count for a fully valid body', async () => {
    const res = await post('{"resumeToken":"tok1"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, skipRequestCount: 1 })
    expect(assertPlayer).toHaveBeenCalledWith(expect.anything(), 'ABCD', 'tok1')
    expect(rpc).toHaveBeenCalledWith('mafia_append_skip_request', {
      p_game_id: 'ABCD',
      p_phase: 'day',
      p_player_id: 'p1',
    })
    expect(inserts).toHaveBeenCalledWith('mafia_chat_messages', expect.objectContaining({ scope: 'day' }))
    expect(runMafiaAdvance).not.toHaveBeenCalled()
  })

  it('advances the phase once the majority threshold is reached', async () => {
    rpc.mockResolvedValue({ data: ['p1', 'p2', 'p3'], error: null })
    const res = await post('{"resumeToken":"tok1"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, skipRequestCount: 3 })
    expect(runMafiaAdvance).toHaveBeenCalledWith('ABCD')
  })

  it('answers 200 with the stored count when the append is a no-op', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const res = await post('{"resumeToken":"tok1"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, skipRequestCount: 1 })
    expect(inserts).not.toHaveBeenCalled()
  })

  // Gate precedence: the parameter shape check runs BEFORE auth.
  it('answers "Invalid parameters" before auth when the body is bad AND the token is wrong', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    const res = await post('{}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // Gate precedence: a bad token AND a non-skippable phase in one request must still answer
  // the auth failure.
  it('answers the auth failure before the phase check when both are wrong', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'night' }, error: null }
    const res = await post('{"resumeToken":"bad"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 400 "Cannot skip ahead right now" outside day/voting', async () => {
    tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'night' }, error: null }
    const res = await post('{"resumeToken":"tok1"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Cannot skip ahead right now' })
  })

  it('answers 400 when the caller is dead', async () => {
    tables.mafia_player_states = { data: [{ ...STATES[0], is_alive: false }, ...STATES.slice(1)], error: null }
    const res = await post('{"resumeToken":"tok1"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Only living players can vote to skip' })
  })
})
