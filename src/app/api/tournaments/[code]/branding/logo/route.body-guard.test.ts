import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * DELETE /api/tournaments/[code]/branding/logo reads its body INSIDE a broad try/catch, so an
 * empty or malformed body was caught and answered 500 "Internal server error" — a server-fault
 * status for a client fault. It is now a 400, decided before `assertTournamentHostAny`.
 *
 * The route's own host-auth suite characterized that old 500; its single assertion moves to
 * this 400 in the same change. Everything else about the ladder is untouched, and the catch
 * must keep answering 500 for every other error class.
 */

vi.mock('server-only', () => ({}))

const { assertTournamentHostAny } = vi.hoisted(() => ({ assertTournamentHostAny: vi.fn() }))
vi.mock('@/lib/tournament-admin', () => ({ assertTournamentHostAny }))

const { fromSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(() => {
    throw new Error('Supabase must not be touched on the malformed-body path')
  }),
}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => null),
  RATE_LIMITS: { tournamentLogoUpload: { bucket: 'tournament-logo', max: 10, windowSeconds: 60 } },
}))

type Delete = typeof import('./route').DELETE
let DELETE: Delete

beforeAll(async () => {
  DELETE = (await import('./route')).DELETE
}, 60_000)

beforeEach(() => {
  fromSpy.mockClear()
  assertTournamentHostAny.mockReset()
  assertTournamentHostAny.mockResolvedValue({ error: 'Missing hostToken', status: 400 })
})

function remove(body: string) {
  return DELETE(
    new NextRequest('https://test.local/api/tournaments/abcd/branding/logo', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ code: 'abcd' }) }
  )
}

describe('DELETE /api/tournaments/[code]/branding/logo — request body guard', () => {
  it.each([
    ['an empty body', ''],
    ['a malformed body', '{"hostToken":'],
  ])('rejects %s with 400 "Invalid or empty request body" instead of the old 500', async (_label, body) => {
    const res = await remove(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
    expect(assertTournamentHostAny).not.toHaveBeenCalled()
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['a JSON string body', '"token"'],
    ['a null body', 'null'],
  ])('rejects %s with 400 and never authorizes', async (_label, body) => {
    const res = await remove(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: expect.stringContaining('expected record') })
    expect(assertTournamentHostAny).not.toHaveBeenCalled()
  })

  it('still returns the pre-existing "Missing hostToken" 400 for a well-formed empty object', async () => {
    const res = await remove('{}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing hostToken' })
    expect(assertTournamentHostAny).toHaveBeenCalledTimes(1)
  })

  it('leaves the catch handling every other throw as a 500', async () => {
    assertTournamentHostAny.mockRejectedValue(new Error('supabase exploded'))
    const res = await remove('{"hostToken":"tok"}')
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Internal server error' })
  })
})
