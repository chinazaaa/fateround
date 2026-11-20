import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, PLAYER_ID, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * A removal commits before its reconciliation runs, so when reconciliation gives up ("try again")
 * the role is already gone. The host's repeat of the request must still be able to finish the
 * repair instead of stopping at "Player is not on a team".
 */

vi.mock('server-only', () => ({}))

const reconcileAll = vi.fn()

const supabase = makeSupabaseStub({
  games: () => ({ data: gameRow({ status: 'active', game_type: 'codewords' }), error: null }),
  players: () => ({ data: { id: PLAYER_ID }, error: null }),
  // The role row is already gone (the first request removed it).
  codewords_player_roles: () => ({ data: null, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/codewords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/codewords')>()
  return { ...actual, reconcileCodewordsAllTeams: (...args: unknown[]) => reconcileAll(...args) }
})

let DELETE: typeof import('./route').DELETE
beforeAll(async () => {
  DELETE = (await import('./route')).DELETE
}, 60_000)

beforeEach(() => reconcileAll.mockReset())

const del = () =>
  DELETE(
    jsonRequest('/api/codewords/host-role', { gameId: GAME_CODE, hostToken: HOST_TOKEN, playerId: PLAYER_ID }, 'DELETE')
  )

describe('DELETE /api/codewords/host-role — repeat after reconciliation gave up', () => {
  it('reconciles every team and reports the repair instead of "not on a team"', async () => {
    reconcileAll.mockResolvedValue({ error: null, outcome: { ended: false, promotedPlayerId: 'op-1' } })
    const res = await del()
    expect(reconcileAll).toHaveBeenCalledWith(expect.anything(), 'ABCD')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true, promotedPlayerId: 'op-1' })
  })

  it('still answers 400 when there was nothing to repair', async () => {
    reconcileAll.mockResolvedValue({ error: null, outcome: { ended: false } })
    const res = await del()
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Player is not on a team' })
  })

  it('surfaces a failed repair as a retryable 500', async () => {
    reconcileAll.mockResolvedValue({
      error: 'Team roles changed while reconciling — try again',
      outcome: { ended: false },
    })
    const res = await del()
    expect(res.status).toBe(500)
  })
})
