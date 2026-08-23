// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  ensureServerIdentity: vi.fn(),
  authHeaders: vi.fn(),
  session: null as { resumeToken: string | null } | null,
}))

vi.mock('@/lib/identity', () => ({
  ensureServerIdentity: h.ensureServerIdentity,
  authHeaders: h.authHeaders,
}))
vi.mock('@/lib/utils', () => ({ getPlayerSession: () => h.session }))

import { useProfileAttribution } from './useProfileAttribution'

const GAME = 'ABCD'

function setup(props: { gameCode?: string; status?: string | null; resumeToken?: string | null } = {}) {
  return renderHook(
    (p: { status?: string | null; resumeToken?: string | null }) =>
      useProfileAttribution({ gameCode: props.gameCode ?? GAME, status: p.status, resumeToken: p.resumeToken }),
    { initialProps: { status: props.status ?? null, resumeToken: props.resumeToken ?? null } }
  )
}

beforeEach(() => {
  h.session = null
  h.ensureServerIdentity.mockReset().mockResolvedValue('prof-1')
  h.authHeaders.mockReset().mockResolvedValue({ 'Content-Type': 'application/json', Authorization: 'Bearer t' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ attributed: true }) }))
  )
})

describe('useProfileAttribution', () => {
  it('attributes once the game is finished', async () => {
    const { result: _r } = setup({ status: 'finished', resumeToken: 'TOK123' })
    void _r

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/profile/attribute')
    const body = JSON.parse((init as { body: string }).body)
    expect(body.gameCode).toBe(GAME)
    expect(body.resumeToken).toBe('TOK123')
    // Phase 2 also carries the device id so `migrate_guest_grants` can fire
    // when this profile later signs up — its exact value is a per-browser
    // uuid, so we just assert it's present.
    expect(typeof body.deviceId).toBe('string')
  })

  it('does nothing while the game is still active', async () => {
    setup({ status: 'active', resumeToken: 'TOK123' })
    // Creating an identity mid-game would burn the per-IP anonymous sign-in budget for a
    // player who may never finish.
    expect(h.ensureServerIdentity).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not sign in when this device never held a seat', async () => {
    // A spectator or a watching host. There is no player row to attribute, and burning an
    // anonymous sign-in on them is exactly what the 30/hour per-IP limit punishes.
    h.session = null
    setup({ status: 'finished', resumeToken: null })
    expect(h.ensureServerIdentity).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falls back to the persisted session for the resume token', async () => {
    h.session = { resumeToken: 'FROMSESSION' }
    setup({ status: 'finished', resumeToken: null })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse((init as { body: string }).body).resumeToken).toBe('FROMSESSION')
  })

  it('only attributes once, however often the view re-renders', async () => {
    const { rerender } = setup({ status: 'finished', resumeToken: 'TOK123' })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    rerender({ status: 'finished', resumeToken: 'TOK123' })
    rerender({ status: 'finished', resumeToken: 'TOK123' })

    expect(h.ensureServerIdentity).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('runs the guest-earning path when no identity could be established', async () => {
    // Rate-limited or anonymous sign-in not enabled — the player still has a finished game,
    // and Phase 2 writes their pending guest coins keyed on the local device id.
    h.ensureServerIdentity.mockResolvedValue(null)
    setup({ status: 'finished', resumeToken: 'TOK123' })

    await waitFor(() => expect(h.ensureServerIdentity).toHaveBeenCalled())
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/profile/attribute')
    // No auth header — this is the guest path — but a device id must ride along.
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBeUndefined()
    const body = JSON.parse((init as { body: string }).body)
    expect(body.gameCode).toBe(GAME)
    expect(typeof body.deviceId).toBe('string')
  })

  it('swallows a failing request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )
    setup({ status: 'finished', resumeToken: 'TOK123' })
    // Must not reject — this runs on the finished screen of a game that already went fine.
    await waitFor(() => expect(fetch).toHaveBeenCalled())
  })
})
