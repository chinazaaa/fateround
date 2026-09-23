import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/mafia/[code]/chat parses its body inside a try/catch but destructures it OUTSIDE:
 *
 *   try { body = await req.json() } catch { return 400 'Invalid body' }
 *   const { resumeToken, message, scope = 'night' } = body
 *
 * `req.json()` parses a literal `null` body SUCCESSFULLY, so the `catch` never fires and
 * `body` is `null`. Destructuring `null` then throws a TypeError from OUTSIDE the try, so
 * the handler's returned promise REJECTS (an unhandled rejection → 500 in prod) instead of
 * answering a status. The `scope = 'night'` default does NOT save it: a default only fills
 * in for an `undefined` PROPERTY, it does not make `null` destructurable. There is no gate
 * before the parse: this route is reachable unauthenticated.
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
    insertError: null as unknown,
    inserted: [] as unknown[],
  },
}))

// Faithful to the real call chains in the route:
//   admin.from('mafia_sessions').select('*').eq('game_id', id).maybeSingle()             -> { data }
//   admin.from('mafia_player_states').select('*').eq('game_id',id).eq('player_id',p)
//        .maybeSingle()                                                                  -> { data }
//   admin.from('mafia_chat_messages').insert({...})                                      -> { error }
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => tables[table as 'mafia_sessions'],
          eq: () => ({
            maybeSingle: async () => tables[table as 'mafia_player_states'],
          }),
        }),
      }),
      insert: async (row: unknown) => {
        tables.inserted.push(row)
        return { error: tables.insertError }
      },
    }),
  }),
}))

// Real signature: (supabase, gameCode, resumeToken, opts?) =>
//   Promise<{ error, status, player, id }> — error/player are mutually exclusive.
vi.mock('@/lib/game-admin', () => ({ assertPlayer }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  assertPlayer.mockReset()
  assertPlayer.mockResolvedValue({ error: null, status: 200, player: { id: 'p1', name: 'Ann' }, id: 'ABCD' })
  tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'night' }, error: null }
  tables.mafia_player_states = {
    data: { game_id: 'ABCD', player_id: 'p1', is_alive: true, role: 'mafia' },
    error: null,
  }
  tables.insertError = null
  tables.inserted = []
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/mafia/ABCD/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ code: 'abcd' }) }
  )
}

describe('POST /api/mafia/[code]/chat — null JSON body', () => {
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
    ['a valid body missing resumeToken', '{"message":"hi"}'],
    ['a valid body missing message', '{"resumeToken":"tok1"}'],
    ['a body whose message is only whitespace', '{"resumeToken":"tok1","message":"   "}'],
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

  it('answers 400 for a message longer than 500 characters', async () => {
    const res = await post(JSON.stringify({ resumeToken: 'tok1', message: 'x'.repeat(501) }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Message too long (max 500 characters)' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  // Past every gate, into the terminal success response.
  it('answers 200 for a valid body that reaches the insert', async () => {
    const res = await post('{"resumeToken":"tok1","message":" hi "}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(assertPlayer).toHaveBeenCalledWith(expect.anything(), 'ABCD', 'tok1')
    // The omitted `scope` really does default to 'night', and the message is trimmed.
    expect(tables.inserted).toEqual([
      {
        game_id: 'ABCD',
        sender_player_id: 'p1',
        sender_name: 'Ann',
        message: 'hi',
        scope: 'night',
      },
    ])
  })

  it('answers 403 for a valid body whose default night scope hits a non-mafia role', async () => {
    tables.mafia_player_states = {
      data: { game_id: 'ABCD', player_id: 'p1', is_alive: true, role: 'villager' },
      error: null,
    }
    const res = await post('{"resumeToken":"tok1","message":"hi"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Only Mafia members can use the secret chat' })
  })

  it('answers 403 for day scope outside Discussion or Voting', async () => {
    const res = await post('{"resumeToken":"tok1","message":"hi","scope":"day"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      error: 'Day chat is only active during Discussion or Voting',
    })
  })

  // Gate precedence: a bad token AND a bad phase in one request must still answer the
  // auth failure, so a later refactor cannot silently reorder auth behind game state.
  it('answers the auth failure before the phase check when both are wrong', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    tables.mafia_sessions = { data: { game_id: 'ABCD', phase: 'night' }, error: null }
    const res = await post('{"resumeToken":"bad","message":"hi","scope":"day"}')
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Player not found' })
  })

  // Gate precedence: parameter validation precedes auth entirely.
  it('answers "Invalid parameters" before auth when both the body and the token are bad', async () => {
    assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403, player: null, id: 'ABCD' })
    const res = await post('{"resumeToken":"bad"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid parameters' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  it('answers 404 "Session not initialized" when the session row is missing', async () => {
    tables.mafia_sessions = { data: null, error: null }
    const res = await post('{"resumeToken":"tok1","message":"hi"}')
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Session not initialized' })
  })

  it('answers 500 when the insert fails', async () => {
    tables.insertError = { message: 'boom' }
    const res = await post('{"resumeToken":"tok1","message":"hi"}')
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Failed to send message' })
  })
})
