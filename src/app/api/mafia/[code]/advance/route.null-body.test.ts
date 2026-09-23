import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/mafia/[code]/advance parses its body inside a try/catch but destructures it
 * OUTSIDE:
 *
 *   try { body = await req.json() } catch { return 400 'Invalid body' }
 *   const { hostToken, nextPhase, isAuto } = body
 *
 * `req.json()` parses a literal `null` body SUCCESSFULLY, so the `catch` never fires and
 * `body` is `null`. Destructuring `null` then throws a TypeError from OUTSIDE the try, so
 * the handler's returned promise REJECTS (an unhandled rejection → 500 in prod) instead of
 * answering a status. There is no gate before the parse: this route is reachable
 * unauthenticated (host authorization happens after, by comparing `hostToken`).
 *
 * This suite pins the exact status/body for every body shape so the `?? {}` fix can only
 * move the `null` row.
 */

vi.mock('server-only', () => ({}))

const { runMafiaAdvance, tables } = vi.hoisted(() => ({
  runMafiaAdvance: vi.fn(),
  tables: {
    games: { data: null as unknown, error: null },
    mafia_sessions: { data: null as unknown, error: null },
  },
}))

// Faithful to the real call chains in the route:
//   admin.from('games').select('host_token').eq('id', id).maybeSingle()                    -> { data }
//   admin.from('mafia_sessions').select('phase_deadline, phase').eq('game_id',id)
//        .maybeSingle()                                                                    -> { data }
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => tables[table as 'games'],
        }),
      }),
    }),
  }),
}))

// Real signature: (gameId: string, opts?: { nextPhase?: MafiaPhase; expectedPhase?: MafiaPhase })
//   => Promise<{ ok: true } | { ok: false; error: string; status: number }>
vi.mock('@/lib/mafia-advance', () => ({ runMafiaAdvance }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  runMafiaAdvance.mockReset()
  runMafiaAdvance.mockResolvedValue({ ok: true })
  tables.games = { data: { host_token: 'host-tok' }, error: null }
  tables.mafia_sessions = { data: { phase: 'night', phase_deadline: null }, error: null }
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/mafia/ABCD/advance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ code: 'abcd' }) }
  )
}

const UNAUTHORIZED = { error: 'Unauthorized or phase not expired yet' }

describe('POST /api/mafia/[code]/advance — null JSON body', () => {
  it('answers 403 for a literal null body, exactly like {}', async () => {
    const res = await post('null')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
    expect(runMafiaAdvance).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object body', '{}'],
    ['a numeric scalar body', '5'],
    ['a string scalar body', '"str"'],
    ['an array body', '[]'],
    ['a valid body missing hostToken', '{"nextPhase":"day"}'],
    ['a body with a non-matching hostToken', '{"hostToken":"nope"}'],
    ['a body with isAuto but no deadline', '{"isAuto":true}'],
  ])('answers 403 for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
    expect(runMafiaAdvance).not.toHaveBeenCalled()
  })

  it.each([
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
  ])('answers 400 "Invalid body" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid body' })
    expect(runMafiaAdvance).not.toHaveBeenCalled()
  })

  // Past every gate, into the terminal success response.
  it('answers 200 for a valid host body and calls runMafiaAdvance', async () => {
    const res = await post('{"hostToken":"host-tok","nextPhase":"day"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(runMafiaAdvance).toHaveBeenCalledWith('ABCD', { nextPhase: 'day', expectedPhase: undefined })
  })

  it('answers 200 for a host body with no nextPhase (natural advance)', async () => {
    const res = await post('{"hostToken":"host-tok"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(runMafiaAdvance).toHaveBeenCalledWith('ABCD', { nextPhase: undefined, expectedPhase: undefined })
  })

  it('authorizes an isAuto body once the phase deadline has passed, pinning the phase', async () => {
    tables.mafia_sessions = {
      data: { phase: 'night', phase_deadline: new Date(Date.now() - 5000).toISOString() },
      error: null,
    }
    const res = await post('{"isAuto":true}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(runMafiaAdvance).toHaveBeenCalledWith('ABCD', { nextPhase: undefined, expectedPhase: 'night' })
  })

  it('propagates a runMafiaAdvance failure verbatim', async () => {
    runMafiaAdvance.mockResolvedValue({ ok: false, error: 'Phase already advanced', status: 409 })
    const res = await post('{"hostToken":"host-tok"}')
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'Phase already advanced' })
  })

  // Gate precedence: a missing session AND a wrong token in one request must answer the
  // 404, so a later refactor cannot silently hoist auth above the existence check.
  it('answers 404 before 403 when the session is missing AND the token is wrong', async () => {
    tables.mafia_sessions = { data: null, error: null }
    const res = await post('{"hostToken":"nope"}')
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game or session not initialized' })
    expect(runMafiaAdvance).not.toHaveBeenCalled()
  })

  // Gate precedence: a wrong token AND a runMafiaAdvance that would fail must answer the
  // 403 — authorization stays in front of the advance.
  it('answers 403 before running the advance when the token is wrong', async () => {
    runMafiaAdvance.mockResolvedValue({ ok: false, error: 'Phase already advanced', status: 409 })
    const res = await post('{"hostToken":"nope","nextPhase":"day"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual(UNAUTHORIZED)
    expect(runMafiaAdvance).not.toHaveBeenCalled()
  })

  it('answers 404 when the game row is missing', async () => {
    tables.games = { data: null, error: null }
    const res = await post('{"hostToken":"host-tok"}')
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game or session not initialized' })
  })
})
