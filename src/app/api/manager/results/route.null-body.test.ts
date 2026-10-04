import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/manager/results parses its JSON body OUTSIDE the try block (which only starts
 * after the property reads). A literal `null` body parses successfully, so
 * `.catch(() => ({}))` never fires and `body.gameId` throws out of the handler — the
 * promise REJECTS instead of answering a status.
 *
 * The manager auth gate is mocked open so every row exercises the parse, not a 401.
 * `@/lib/community-dates` is left REAL so date validation is genuine.
 */

vi.mock('server-only', () => ({}))

const { assertManagerRequest, addResult, deleteResult, getDayWinners } = vi.hoisted(() => ({
  assertManagerRequest: vi.fn(),
  addResult: vi.fn(),
  deleteResult: vi.fn(),
  getDayWinners: vi.fn(),
}))

vi.mock('@/lib/manager-api', () => ({ assertManagerRequest }))
vi.mock('@/lib/community-data', () => ({ addResult, deleteResult, getDayWinners }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  // Faithful shape: verifyManagerSessionToken resolves { role: 'manager', v, exp } or null.
  assertManagerRequest.mockResolvedValue({ role: 'manager', v: 'abcdef0123456789', exp: Date.now() + 60_000 })
  addResult.mockResolvedValue(undefined)
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/manager/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

function expectGatePassed(status: number) {
  expect(assertManagerRequest).toHaveBeenCalledTimes(1)
  expect(status).not.toBe(401)
}

describe('POST /api/manager/results — JSON body matrix', () => {
  // Before the `?? {}` fix this REJECTED with
  // "TypeError: Cannot read properties of null (reading 'gameId')" — an unhandled
  // rejection rather than a status. It now behaves exactly like `{}`.
  it('answers 400 "gameId is required" for a literal null body', async () => {
    const res = await post('null')
    expectGatePassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'gameId is required' })
    expect(addResult).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a number scalar', '5'],
    ['a string scalar', '"str"'],
    ['an array', '[]'],
    ['a valid body missing the gameId field', '{"date":"2026-01-02","playerName":"Ada"}'],
  ])('answers 400 "gameId is required" for %s', async (_label, body) => {
    const res = await post(body)
    expectGatePassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'gameId is required' })
    expect(addResult).not.toHaveBeenCalled()
  })

  it('answers 400 for a body with a gameId but no valid date', async () => {
    const res = await post('{"gameId":"game-1"}')
    expectGatePassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'A valid date is required' })
    expect(addResult).not.toHaveBeenCalled()
  })

  it('answers 400 for a body missing the winner name', async () => {
    const res = await post('{"gameId":"game-1","date":"2026-01-02"}')
    expectGatePassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Winner name is required' })
    expect(addResult).not.toHaveBeenCalled()
  })

  it('answers 200 for a valid body', async () => {
    const res = await post('{"gameId":"game-1","date":"2026-01-02","playerName":"Ada"}')
    expectGatePassed(res.status)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(addResult).toHaveBeenCalledWith('game-1', '2026-01-02', 'Ada')
  })
})
