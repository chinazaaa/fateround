import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * `quoteBodySchema` is a deliberate shape-only guard (`z.record(z.string(), z.any())`), so
 * `gameId` arrives as any JSON value. POST and DELETE both guard it with a bare truthiness
 * check and then call `gameId.toUpperCase()`, so a truthy non-string (`5`, `true`, `{}`)
 * throws an unhandled TypeError that surfaces as a 500 instead of a 400.
 *
 * This file pins the whole `gameId` matrix for both handlers. The `null`, absent and
 * empty-string rows must never move: the route treats all three as "absent" and answers
 * "Missing required fields", and a schema-level `z.string()` would turn `null` into an
 * "expected string, received null" 400 on a request the route handles today (see
 * CONTRIBUTING.md — #1163 / #1153).
 */

vi.mock('server-only', () => ({}))

const { fromSpy, assertHostGameSpy, assertPlayerSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(() => {
    throw new Error('Supabase must not be touched on the bad-gameId path')
  }),
  // Both auth helpers short-circuit with a distinctive 404 so a request that gets *past* the
  // gameId handling is distinguishable from one rejected by it, and the normalised game id
  // the route resolved is observable in the call args.
  assertHostGameSpy: vi.fn(async (_supabase: unknown, _gameId: string, _hostToken: unknown) => ({
    error: 'Auth reached',
    status: 404,
  })),
  assertPlayerSpy: vi.fn(async (_supabase: unknown, _gameId: string, _resumeToken: unknown) => ({
    error: 'Auth reached',
    status: 404,
  })),
}))

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))
vi.mock('@/lib/game-admin', () => ({
  assertHostGame: assertHostGameSpy,
  assertPlayer: assertPlayerSpy,
}))

type Post = typeof import('./route').POST
type Delete = typeof import('./route').DELETE
let POST: Post
let DELETE: Delete

beforeAll(async () => {
  ;({ POST, DELETE } = await import('./route'))
}, 60_000)

beforeEach(() => {
  fromSpy.mockClear()
  assertHostGameSpy.mockClear()
  assertPlayerSpy.mockClear()
})

function request(body: unknown, method: string) {
  return new NextRequest('https://test.local/api/wst-quotes', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// A complete, valid question payload, so POST reaches the gameId handling rather than being
// turned away earlier by parseSubmittedQuestion.
const validQuestion = { quoteText: 'Who said this?', options: ['Ada', 'Grace'], correctIndex: 0 }

/** Per-method: the extra fields needed for the request to be well-formed apart from gameId. */
const rest = {
  POST: { resumeToken: 'resume-tok', ...validQuestion },
  DELETE: { resumeToken: 'resume-tok', quoteId: 'quote-1' },
} as const

/** The same, minus the player resume token — used for the host path and the no-token gate. */
const restNoToken = {
  POST: { ...validQuestion },
  DELETE: { quoteId: 'quote-1' },
} as const

const NON_STRING: [string, unknown][] = [
  ['a number', 5],
  ['a boolean', true],
  ['an object', {}],
  ['an array', ['ABCD']],
]

describe.each([
  ['POST', () => POST],
  ['DELETE', () => DELETE],
] as const)('%s /api/wst-quotes — gameId type matrix', (method, handler) => {
  const extra = rest[method]
  const extraNoToken = restNoToken[method]

  // --- absent / null / empty string: behaviour that MUST NOT change ---------------------

  it.each([
    ['null', { gameId: null }],
    ['absent', {}],
    ['an empty string', { gameId: '' }],
  ])('treats %s gameId as absent: 400 "Missing required fields", no auth, no DB', async (_label, gameIdField) => {
    const res = await handler()(request({ ...gameIdField, ...extra }, method))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
    expect(assertHostGameSpy).not.toHaveBeenCalled()
    expect(assertPlayerSpy).not.toHaveBeenCalled()
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('rejects a well-formed empty object with 400 "Missing required fields"', async () => {
    const res = await handler()(request({}, method))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  // --- truthy non-string gameId: the bug, pinned as it behaves today --------------------

  it.each(NON_STRING)('throws an unhandled TypeError for %s gameId (surfaces as a 500)', async (_l, gameId) => {
    await expect(handler()(request({ gameId, ...extra }, method))).rejects.toThrow(TypeError)
    expect(assertHostGameSpy).not.toHaveBeenCalled()
    expect(assertPlayerSpy).not.toHaveBeenCalled()
  })

  // --- combined gates: a non-string gameId together with a second failing gate ----------

  it('still answers the token gate first when the token is missing too', async () => {
    const res = await handler()(request({ gameId: 5, ...extraNoToken }, method))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
    expect(assertHostGameSpy).not.toHaveBeenCalled()
    expect(assertPlayerSpy).not.toHaveBeenCalled()
  })

  // --- a valid string gameId still gets through, still uppercased -----------------------

  it('lets a valid string gameId through to auth, uppercased (player path)', async () => {
    const res = await handler()(request({ gameId: 'abcd', ...extra }, method))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Auth reached' })
    expect(assertPlayerSpy).toHaveBeenCalledTimes(1)
    expect(assertPlayerSpy).toHaveBeenCalledWith(expect.anything(), 'ABCD', 'resume-tok')
  })

  it('lets a valid string gameId through to auth, uppercased (host path)', async () => {
    const res = await handler()(request({ gameId: 'abcd', hostToken: 'host-tok', ...extraNoToken }, method))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Auth reached' })
    expect(assertHostGameSpy).toHaveBeenCalledTimes(1)
    expect(assertHostGameSpy).toHaveBeenCalledWith(expect.anything(), 'ABCD', 'host-tok')
  })
})

describe('POST /api/wst-quotes — gameId type vs question validation', () => {
  // The question payload is validated before gameId is normalised, and this PR does not move
  // that: a non-string gameId with an unusable question still answers the question error.
  it('still answers the question error for a non-string gameId with no quote', async () => {
    const res = await POST(request({ gameId: 5, resumeToken: 'resume-tok', options: ['Ada', 'Grace'] }, 'POST'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Enter a quote before submitting' })
  })
})

describe('DELETE /api/wst-quotes — gameId type vs quoteId validation', () => {
  // A whitespace-only quoteId clears the first guard, so the gameId normalisation is reached
  // before the quoteId gate — both failing at once must still produce one clean 400.
  it('throws for a non-string gameId with a whitespace-only quoteId', async () => {
    await expect(DELETE(request({ gameId: 5, resumeToken: 'resume-tok', quoteId: '   ' }, 'DELETE'))).rejects.toThrow(
      TypeError
    )
  })
})
