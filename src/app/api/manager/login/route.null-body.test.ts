import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/manager/login parses its body INSIDE the broad try/catch, and `req.json()` parses a
 * literal `null` body SUCCESSFULLY — so `.catch(() => ({}))` never fires and `body` is `null`.
 * The first property read (`body.code`) then threw a TypeError which the surrounding try
 * swallowed into the route's generic 500 "Login failed" — a server-fault status for a client fault.
 * A `?? {}` at the parse site makes `null` behave exactly like `{}` (401 "Invalid access code").
 *
 * The catch must keep doing its old job for every OTHER error class, so this suite also pins
 * that a throw from `verifyManagerCode` still surfaces as the 500 it always did.
 */

vi.mock('server-only', () => ({}))

const { createManagerSessionToken, managerCodeIsSet, verifyManagerCode } = vi.hoisted(() => ({
  createManagerSessionToken: vi.fn(async () => 'session-token'),
  managerCodeIsSet: vi.fn(async () => true),
  verifyManagerCode: vi.fn(async (_code: string) => false),
}))

// Faithful to src/lib/manager-session.ts: the cookie is named `manager_session` and the max age
// is 30 days expressed in whole seconds.
vi.mock('@/lib/manager-session', () => ({
  createManagerSessionToken,
  managerCodeIsSet,
  managerCookieName: () => 'manager_session',
  managerSessionMaxAgeSeconds: () => Math.floor((30 * 24 * 60 * 60 * 1000) / 1000),
  verifyManagerCode,
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  createManagerSessionToken.mockReset()
  createManagerSessionToken.mockResolvedValue('session-token')
  managerCodeIsSet.mockReset()
  // Gate: without a configured code the route answers 503 before the interesting path.
  managerCodeIsSet.mockResolvedValue(true)
  verifyManagerCode.mockReset()
  verifyManagerCode.mockResolvedValue(false)
})

afterAll(() => {
  consoleError.mockRestore()
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/manager/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

describe('POST /api/manager/login — null JSON body', () => {
  it('answers 200 for a valid body with a correct code', async () => {
    verifyManagerCode.mockResolvedValue(true)
    const res = await post('{"code":"correct-horse-battery"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(res.cookies.get('manager_session')?.value).toBe('session-token')
    expect(verifyManagerCode).toHaveBeenCalledWith('correct-horse-battery')
  })

  it.each([
    ['an empty object', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a number scalar', '5'],
    ['a string scalar', '"str"'],
    ['an array', '[]'],
    ['a valid body missing the code field', '{"other":1}'],
  ])('answers 401 "Invalid access code" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid access code' })
    expect(verifyManagerCode).toHaveBeenCalledWith('')
  })

  it('answers 401 for a null body, exactly like an empty object (was 500 "Login failed")', async () => {
    const res = await post('null')
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid access code' })
    // It no longer throws on `body.code`, so the gate and the code check both run.
    expect(managerCodeIsSet).toHaveBeenCalled()
    expect(verifyManagerCode).toHaveBeenCalledWith('')
  })

  it('leaves the catch handling every other throw as a 500', async () => {
    verifyManagerCode.mockRejectedValue(new Error('supabase exploded'))
    const res = await post('{"code":"anything"}')
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Login failed' })
    expect(verifyManagerCode).toHaveBeenCalledWith('anything')
  })
})
