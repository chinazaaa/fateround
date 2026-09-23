import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/community/post-win parses its body OUTSIDE the try block (which only starts at
 * the rate-limit reservation):
 *
 *   const body = await req.json().catch(() => ({}))
 *   const playerName = typeof body.playerName === 'string' ? ... : ''
 *
 * `req.json()` parses a literal `null` body SUCCESSFULLY, so the `.catch` never fires and
 * `body` is `null`. Reading `body.playerName` throws a TypeError outside the try, so the
 * handler's returned promise REJECTS rather than falling into the catch's 500.
 *
 * Every test here must get past the `hasServiceRoleKey()` 503 gate at the top of the handler,
 * so the mock returns true and a dedicated test asserts the gate is really open.
 */

vi.mock('server-only', () => ({}))

const { hasServiceRoleKey, gameRow, seatedRows, postWinFromGame, reservePostWinSlot, clearPostWinAttempts } =
  vi.hoisted(() => ({
    hasServiceRoleKey: vi.fn(() => true),
    gameRow: { value: { game_type: 'whot' } as { game_type: string } | null },
    seatedRows: { value: [] as Array<{ is_bot: boolean }> },
    postWinFromGame: vi.fn(async () => 'recorded' as 'recorded' | 'already_posted' | 'not_on_leaderboard'),
    reservePostWinSlot: vi.fn(async () => ({ allowed: true, retryAfterSec: 0 })),
    clearPostWinAttempts: vi.fn(async () => undefined),
  }))

// Faithful to the two real call chains in the route:
//   from('games').select('game_type').eq('id', id).maybeSingle()   -> { data, error }
//   from('players').select('is_bot').eq(..).eq(..)                 -> awaited directly -> { data, error }
// so the `eq` builder is itself thenable, exactly like a PostgrestFilterBuilder.
vi.mock('@/lib/supabase-admin', () => {
  function builder(table: string) {
    const result = () =>
      table === 'games' ? { data: gameRow.value, error: null } : { data: seatedRows.value, error: null }
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => result(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    }
    return chain
  }
  return {
    hasServiceRoleKey,
    getSupabaseAdmin: () => ({ from: (table: string) => builder(table) }),
  }
})

// Real signatures: reservePostWinSlot(ip) => { allowed, retryAfterSec }; clearPostWinAttempts(ip) => void;
// clientIp(req) => string (kept as the real header-reading implementation shape).
vi.mock('@/lib/community-rate-limit', () => ({
  clientIp: (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  reservePostWinSlot,
  clearPostWinAttempts,
}))

// Real signature: postWinFromGame(args) => 'recorded' | 'already_posted' | 'not_on_leaderboard'
vi.mock('@/lib/community-data', () => ({
  postWinFromGame,
  getGameByType: vi.fn(async () => null),
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  hasServiceRoleKey.mockReset()
  hasServiceRoleKey.mockReturnValue(true)
  gameRow.value = { game_type: 'whot' }
  seatedRows.value = []
  postWinFromGame.mockReset()
  postWinFromGame.mockResolvedValue('recorded')
  reservePostWinSlot.mockReset()
  reservePostWinSlot.mockResolvedValue({ allowed: true, retryAfterSec: 0 })
  clearPostWinAttempts.mockReset()
  clearPostWinAttempts.mockResolvedValue(undefined)
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/community/post-win', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body,
    })
  )
}

const VALID = '{"playerName":"Ada","gameId":"ABCD","roundKey":"r1"}'

describe('POST /api/community/post-win — null JSON body', () => {
  it('has the service-role gate open, so the matrix below is not just 503s', async () => {
    expect(hasServiceRoleKey()).toBe(true)
    const res = await post(VALID)
    expect(res.status).not.toBe(503)
  })

  it('still answers 503 when the service role key is missing (gate is real)', async () => {
    hasServiceRoleKey.mockReturnValue(false)
    const res = await post(VALID)
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: 'Leaderboard is not configured.' })
  })

  it('answers 400 "Enter your name" for a literal null body, exactly like {}', async () => {
    const res = await post('null')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Enter your name' })
    expect(reservePostWinSlot).not.toHaveBeenCalled()
    expect(postWinFromGame).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object body', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a numeric scalar body', '5'],
    ['a string scalar body', '"str"'],
    ['an array body', '[]'],
    ['a valid body missing playerName', '{"gameId":"ABCD"}'],
  ])('answers 400 "Enter your name" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Enter your name' })
    expect(reservePostWinSlot).not.toHaveBeenCalled()
  })

  it('answers 400 "Missing game reference" for a valid body with a name but no game id', async () => {
    const res = await post('{"playerName":"Ada"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing game reference' })
    expect(reservePostWinSlot).not.toHaveBeenCalled()
  })

  it('answers 200 { success: true } for a fully valid body', async () => {
    const res = await post(VALID)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(postWinFromGame).toHaveBeenCalledTimes(1)
  })

  it('answers 404 when the game row does not exist', async () => {
    gameRow.value = null
    const res = await post(VALID)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found.' })
  })
})
