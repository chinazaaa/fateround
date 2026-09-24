import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST and PATCH /api/admin/community/games both parse their JSON body OUTSIDE any
 * try/catch. A literal `null` body parses successfully, so `.catch(() => ({}))` never fires
 * and the first property read throws out of the handler — the promise REJECTS instead of
 * answering a status.
 *
 * PATCH also does `if ('game_type' in body)`, which would throw its own
 * "Cannot use 'in' operator" TypeError on null — but `body.id` on line 88 runs first. The
 * null test pins the exact message to prove that ordering.
 *
 * `@/lib/game-types` is left REAL so `communityGameTypeMeta` resolves genuine game types.
 * Both gates (admin auth, service-role key) are mocked open so every row exercises the parse.
 */

vi.mock('server-only', () => ({}))

const { assertAdminRequest, hasServiceRoleKey, getSupabaseAdmin, getGames, insert, update, eq } = vi.hoisted(() => ({
  assertAdminRequest: vi.fn(),
  hasServiceRoleKey: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getGames: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}))

vi.mock('@/lib/admin-api', () => ({ assertAdminRequest }))
vi.mock('@/lib/supabase-admin', () => ({ hasServiceRoleKey, getSupabaseAdmin }))
vi.mock('@/lib/community-data', () => ({ getGames }))

type Route = typeof import('./route')
let POST: Route['POST']
let PATCH: Route['PATCH']

beforeAll(async () => {
  const mod = await import('./route')
  POST = mod.POST
  PATCH = mod.PATCH
}, 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  assertAdminRequest.mockResolvedValue({ email: 'admin@example.com', exp: Date.now() + 60_000 })
  hasServiceRoleKey.mockReturnValue(true)
  getGames.mockResolvedValue([])
  // postgrest-js builders are thenable and resolve to { data, error }.
  insert.mockResolvedValue({ error: null })
  eq.mockResolvedValue({ error: null })
  update.mockReturnValue({ eq })
  getSupabaseAdmin.mockReturnValue({ from: vi.fn(() => ({ insert, update })) })
})

function request(method: 'POST' | 'PATCH', body: string) {
  return new NextRequest('https://test.local/api/admin/community/games', {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
}

const post = (body: string) => POST(request('POST', body))
const patch = (body: string) => PATCH(request('PATCH', body))

function expectGatesPassed(status: number, calls = 1) {
  expect(assertAdminRequest).toHaveBeenCalledTimes(calls)
  expect(hasServiceRoleKey).toHaveBeenCalledTimes(calls)
  expect(status).not.toBe(401)
  expect(status).not.toBe(503)
}

describe('POST /api/admin/community/games — JSON body matrix', () => {
  // Before the `?? {}` fix this REJECTED with
  // "TypeError: Cannot read properties of null (reading 'gameType')" — an unhandled
  // rejection rather than a status. It now behaves exactly like `{}`.
  it('answers 400 "Pick a game type" for a literal null body', async () => {
    const res = await post('null')
    expectGatesPassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Pick a game type' })
    expect(insert).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a number scalar', '5'],
    ['a string scalar', '"str"'],
    ['an array', '[]'],
    ['a valid body missing the gameType field', '{"other":1}'],
  ])('answers 400 "Pick a game type" for %s', async (_label, body) => {
    const res = await post(body)
    expectGatesPassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Pick a game type' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('answers 400 "Unknown game type" for an unrecognised gameType', async () => {
    const res = await post('{"gameType":"not_a_real_game"}')
    expectGatesPassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Unknown game type' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('answers 200 for a valid body', async () => {
    const res = await post('{"gameType":"smash_marry_kill"}')
    expectGatesPassed(res.status)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ games: [] })
    expect(insert).toHaveBeenCalledTimes(1)
  })
})

describe('PATCH /api/admin/community/games — JSON body matrix', () => {
  // Before the `?? {}` fix this REJECTED with
  // "TypeError: Cannot read properties of null (reading 'id')" — NOT "Cannot use 'in'
  // operator", which proved `body.id` runs before `'game_type' in body`. It now behaves
  // exactly like `{}`, and the `in` check is reached safely with an empty object.
  it('answers 400 "id is required" for a literal null body', async () => {
    const res = await patch('null')
    expectGatesPassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'id is required' })
    expect(update).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a number scalar', '5'],
    ['a string scalar', '"str"'],
    ['an array', '[]'],
    ['a valid body missing the id field', '{"name":"Renamed"}'],
  ])('answers 400 "id is required" for %s', async (_label, body) => {
    const res = await patch(body)
    expectGatesPassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'id is required' })
    expect(update).not.toHaveBeenCalled()
  })

  it('answers 400 "Nothing to update" for an id with no updatable fields', async () => {
    const res = await patch('{"id":"game-1"}')
    expectGatesPassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Nothing to update' })
    expect(update).not.toHaveBeenCalled()
  })

  it('answers 200 for a valid body', async () => {
    const res = await patch('{"id":"game-1","name":"Renamed"}')
    expectGatesPassed(res.status)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ games: [] })
    expect(update).toHaveBeenCalledWith({ name: 'Renamed' })
    expect(eq).toHaveBeenCalledWith('id', 'game-1')
  })
})
