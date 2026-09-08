import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// `after()` needs a request scope; run the deferred activity bump inline instead.
const deferred: Promise<unknown>[] = []
vi.mock('next/server', () => ({
  after: (fn: () => Promise<unknown>) => {
    deferred.push(fn())
  },
}))

// `server-only` is a Next runtime guard, not an npm package — it isn't resolvable under Vitest.
vi.mock('server-only', () => ({}))

import { verifyMahjongPlayerAccess } from './mahjong-auth'
import { ACTIVITY_THROTTLE_MINUTES, resetGameActivityThrottle } from './game-activity'

/**
 * Mahjong is the one game family that does NOT authorize through `assertPlayer`, so it never
 * picked up the `games.last_activity_at` bump that lives there — a table an hour into a hand
 * looked idle to `closeIdleActiveGames`, which ENDS games. These tests pin the bump to this
 * chokepoint, and pin the read path to staying silent.
 */

const PLAYER_ROWS = [
  { id: 'p-alice', game_id: 'ABCD', resume_token: 'AAAA1111BBBB2222CCCC3333' },
  { id: 'p-carol', game_id: 'ZZZZ', resume_token: 'GGGG7777HHHH8888IIII9999' },
]

const rpc = vi.fn()

function mockSupabase(): SupabaseClient {
  return {
    rpc,
    from: () => {
      const filters: Record<string, unknown> = {}
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return chain
        },
        maybeSingle: async () => {
          const row = PLAYER_ROWS.find((pl) => pl.game_id === filters.game_id && pl.id === filters.id)
          return { data: row ?? null, error: null }
        },
      }
      return chain
    },
  } as unknown as SupabaseClient
}

/** Await the fire-and-forget work `after()` was handed. */
async function settle() {
  await Promise.all(deferred.splice(0))
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: true, error: null })
  deferred.length = 0
  resetGameActivityThrottle()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-22T10:00:00Z'))
  return () => vi.useRealTimers()
})

describe('verifyMahjongPlayerAccess', () => {
  it('authorizes a player whose resume token matches', async () => {
    expect(await verifyMahjongPlayerAccess(mockSupabase(), 'ABCD', 'p-alice', 'AAAA1111BBBB2222CCCC3333')).toBe(true)
  })

  it('rejects a wrong token, a missing player and a token from another game', async () => {
    const supabase = mockSupabase()
    expect(await verifyMahjongPlayerAccess(supabase, 'ABCD', 'p-alice', 'NOPE0000NOPE0000NOPE0000')).toBe(false)
    expect(await verifyMahjongPlayerAccess(supabase, 'ABCD', 'p-nobody', 'AAAA1111BBBB2222CCCC3333')).toBe(false)
    // The IDOR case: Carol's token is valid, but not in this game.
    expect(await verifyMahjongPlayerAccess(supabase, 'ABCD', 'p-carol', 'GGGG7777HHHH8888IIII9999')).toBe(false)
    expect(await verifyMahjongPlayerAccess(supabase, 'ABCD', null, 'AAAA1111BBBB2222CCCC3333')).toBe(false)
    expect(await verifyMahjongPlayerAccess(supabase, 'ABCD', 'p-alice', '  ')).toBe(false)
  })
})

describe('verifyMahjongPlayerAccess marks the game as alive', () => {
  it('bumps activity for an authorized write (discard, draw, claim, pass, riichi)', async () => {
    await verifyMahjongPlayerAccess(mockSupabase(), 'ABCD', 'p-alice', 'AAAA1111BBBB2222CCCC3333')
    await settle()

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('touch_game_activity', {
      p_game_id: 'ABCD',
      p_throttle_minutes: ACTIVITY_THROTTLE_MINUTES,
    })
  })

  it('does NOT bump on the read-only path — a polling tab must not pass for a live table', async () => {
    await verifyMahjongPlayerAccess(mockSupabase(), 'ABCD', 'p-alice', 'AAAA1111BBBB2222CCCC3333', {
      readOnly: true,
    })
    await settle()

    expect(rpc).not.toHaveBeenCalled()
  })

  it('does NOT bump when authorization fails', async () => {
    const supabase = mockSupabase()
    await verifyMahjongPlayerAccess(supabase, 'ABCD', 'p-alice', 'NOPE0000NOPE0000NOPE0000')
    await verifyMahjongPlayerAccess(supabase, 'ABCD', 'p-carol', 'GGGG7777HHHH8888IIII9999')
    await verifyMahjongPlayerAccess(supabase, 'ABCD', null, null)
    await settle()

    expect(rpc).not.toHaveBeenCalled()
  })

  it('respects the throttle: a hand played hard costs one write per window', async () => {
    const supabase = mockSupabase()
    for (let i = 0; i < 30; i++) {
      await verifyMahjongPlayerAccess(supabase, 'ABCD', 'p-alice', 'AAAA1111BBBB2222CCCC3333')
      vi.advanceTimersByTime(5_000)
    }
    await settle()
    expect(rpc).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(ACTIVITY_THROTTLE_MINUTES * 60 * 1000)
    await verifyMahjongPlayerAccess(supabase, 'ABCD', 'p-alice', 'AAAA1111BBBB2222CCCC3333')
    await settle()
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('still authorizes the move when the bump fails — liveness is not worth failing a turn over', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      verifyMahjongPlayerAccess(mockSupabase(), 'ABCD', 'p-alice', 'AAAA1111BBBB2222CCCC3333')
    ).resolves.toBe(true)
    await expect(settle()).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('survives the bump RPC rejecting outright', async () => {
    rpc.mockRejectedValue(new Error('network'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      verifyMahjongPlayerAccess(mockSupabase(), 'ABCD', 'p-alice', 'AAAA1111BBBB2222CCCC3333')
    ).resolves.toBe(true)
    await expect(settle()).resolves.toBeUndefined()

    consoleError.mockRestore()
  })
})
