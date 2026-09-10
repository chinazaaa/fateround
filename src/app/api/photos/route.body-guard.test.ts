import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * DELETE /api/photos reads its body INSIDE a broad try/catch, so an empty or malformed body
 * was caught and answered 500 "Internal server error" — a server-fault status for a client
 * fault. It is now a 400, decided before `assertPlayer` and before any DB read.
 *
 * The shape guard is deliberately separate from the route's own `deleteSchema` so the existing
 * field-level 400 body ('Invalid request body') is preserved byte for byte; only the thrown
 * parse changes. The catch must keep answering 500 for every other error class.
 */

vi.mock('server-only', () => ({}))

const { fromSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(() => {
    throw new Error('Supabase must not be touched on the malformed-body path')
  }),
}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))

const { assertPlayer } = vi.hoisted(() => ({ assertPlayer: vi.fn() }))
vi.mock('@/lib/game-admin', () => ({ assertPlayer }))

type Delete = typeof import('./route').DELETE
let DELETE: Delete

beforeAll(async () => {
  DELETE = (await import('./route')).DELETE
}, 60_000)

beforeEach(() => {
  fromSpy.mockClear()
  assertPlayer.mockReset()
  assertPlayer.mockResolvedValue({ error: 'Unauthorized', status: 403 })
})

function remove(body: string) {
  return DELETE(
    new NextRequest('https://test.local/api/photos', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

describe('DELETE /api/photos — request body guard', () => {
  it.each([
    ['an empty body', ''],
    ['a malformed body', '{"gameId":'],
  ])('rejects %s with 400 "Invalid or empty request body" instead of the old 500', async (_label, body) => {
    const res = await remove(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
    expect(assertPlayer).not.toHaveBeenCalled()
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['a JSON string body', '"ABCD"'],
    ['a null body', 'null'],
  ])('rejects %s with 400 and never authorizes', async (_label, body) => {
    const res = await remove(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: expect.stringContaining('expected record') })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  it('preserves the pre-existing field-level 400 body for a well-formed but incomplete object', async () => {
    const res = await remove('{"gameId":"ABCD"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid request body' })
    expect(assertPlayer).not.toHaveBeenCalled()
  })

  it('keeps a bad body ahead of a bad token — a fully valid shape with a bad token still 403s', async () => {
    const res = await remove('{"gameId":"ABCD","participantId":"p1","resumeToken":"wrong-token"}')
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('leaves the catch handling every other throw as a 500', async () => {
    assertPlayer.mockRejectedValue(new Error('supabase exploded'))
    const res = await remove('{"gameId":"ABCD","participantId":"p1","resumeToken":"tok1"}')
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Internal server error' })
  })
})
