import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// `after()` only exists inside a request scope. Stand in for it with something
// that runs the callback immediately and hands us the promise, so a test can
// await the deferred work.
const deferred: Promise<unknown>[] = []
const after = vi.fn((fn: () => Promise<unknown>) => {
  deferred.push(fn())
})
vi.mock('next/server', () => ({ after: (fn: () => Promise<unknown>) => after(fn) }))

import {
  touchGameActivity,
  bumpGameActivity,
  resetGameActivityThrottle,
  ACTIVITY_THROTTLE_MINUTES,
} from './game-activity'

const rpc = vi.fn()
const supabase = { rpc } as unknown as SupabaseClient

/** Await whatever `after()` was handed. */
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
})

afterEach(() => {
  vi.useRealTimers()
})

describe('touchGameActivity', () => {
  it('bumps activity on a real move, with the throttle guard evaluated in-database', async () => {
    touchGameActivity(supabase, 'abcd')
    await settle()

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('touch_game_activity', {
      p_game_id: 'ABCD', // game codes are stored upper-case
      p_throttle_minutes: ACTIVITY_THROTTLE_MINUTES,
    })
  })

  it('does not write again while inside the throttle window', async () => {
    touchGameActivity(supabase, 'ABCD')
    await settle()
    expect(rpc).toHaveBeenCalledTimes(1)

    // Twenty more moves, a minute apart — well inside the 5-minute window.
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(10_000)
      touchGameActivity(supabase, 'ABCD')
    }
    await settle()

    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('writes again once the window has elapsed', async () => {
    touchGameActivity(supabase, 'ABCD')
    await settle()

    vi.advanceTimersByTime(ACTIVITY_THROTTLE_MINUTES * 60 * 1000)
    touchGameActivity(supabase, 'ABCD')
    await settle()

    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('throttles per game, not globally', async () => {
    touchGameActivity(supabase, 'ABCD')
    touchGameActivity(supabase, 'WXYZ')
    await settle()

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls.map((c) => c[1].p_game_id)).toEqual(['ABCD', 'WXYZ'])
  })

  it('is fire-and-forget: it returns void and never throws when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(touchGameActivity(supabase, 'ABCD')).toBeUndefined()
    await expect(settle()).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('survives the RPC rejecting outright', async () => {
    rpc.mockRejectedValue(new Error('network'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    touchGameActivity(supabase, 'ABCD')
    await expect(settle()).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('still bumps when there is no request scope for after() to defer into', async () => {
    after.mockImplementationOnce(() => {
      throw new Error('after() was called outside a request scope')
    })

    expect(() => touchGameActivity(supabase, 'ABCD')).not.toThrow()
    // The fallback runs the bump detached, so the RPC is issued right away.
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('bumpGameActivity', () => {
  it('resolves rather than rejecting when the RPC throws', async () => {
    rpc.mockRejectedValue(new Error('network'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(bumpGameActivity(supabase, 'ABCD')).resolves.toBeUndefined()
    consoleError.mockRestore()
  })
})
