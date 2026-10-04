import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
const adminClient = {}
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => adminClient }))

const closeIdleActiveGames = vi.fn()
// The kill-switch parser is deliberately NOT stubbed — its exact acceptance set is
// the thing under test here, so it has to be the real implementation.
vi.mock('@/lib/idle-reaper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/idle-reaper')>()
  return {
    closeIdleActiveGames: (...a: unknown[]) => closeIdleActiveGames(...a),
    resolveIdleMinutes: () => 30,
    isIdleReaperDisabled: actual.isIdleReaperDisabled,
  }
})

import { POST } from './route'

/**
 * This endpoint force-finishes live games, so the auth guard is the whole
 * ballgame: an open reaper is a griefing lever that ends anyone's game on
 * demand, and an unset CRON_SECRET must CLOSE the door, not open it (the
 * failure mode a naive `header !== secret` check has when both are absent).
 */
const post = (headers: Record<string, string> = {}) =>
  POST(new NextRequest('https://fateround.test/api/cron/reap-idle', { method: 'POST', headers }))

describe('POST /api/cron/reap-idle', () => {
  const originalSecret = process.env.CRON_SECRET
  const originalDisabled = process.env.IDLE_REAPER_DISABLED
  beforeEach(() => {
    closeIdleActiveGames.mockReset()
    closeIdleActiveGames.mockResolvedValue({ closed: 2, failed: 1, errors: ['abc: boom'] })
    process.env.CRON_SECRET = 'sekrit'
    delete process.env.IDLE_REAPER_DISABLED
  })
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalSecret
    if (originalDisabled === undefined) delete process.env.IDLE_REAPER_DISABLED
    else process.env.IDLE_REAPER_DISABLED = originalDisabled
  })

  it('sweeps with the right bearer and reports the batch result', async () => {
    const res = await post({ authorization: 'Bearer sekrit' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      threshold_minutes: 30,
      closed: 2,
      failed: 1,
      errors: ['abc: boom'],
    })
    expect(closeIdleActiveGames).toHaveBeenCalledExactlyOnceWith(adminClient, 30)
  })

  it('rejects a missing or wrong bearer without touching the database', async () => {
    const cases: Record<string, string>[] = [{}, { authorization: 'Bearer nope' }, { authorization: 'sekrit' }]
    for (const headers of cases) {
      const res = await post(headers)
      expect(res.status).toBe(401)
    }
    expect(closeIdleActiveGames).not.toHaveBeenCalled()
  })

  it('closes rather than opens when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    const res = await post({ authorization: 'Bearer undefined' })
    expect(res.status).toBe(503)
    expect(closeIdleActiveGames).not.toHaveBeenCalled()
  })

  it('no-ops for every plausible spelling of the IDLE_REAPER_DISABLED kill-switch', async () => {
    // Set by a human through SSM mid-incident. An exact `=== '1'` check silently
    // ignores true/yes/on and keeps ending games while ops believe it is stopped.
    for (const value of ['1', 'true', 'TRUE', 'yes', 'on', ' 1 ']) {
      process.env.IDLE_REAPER_DISABLED = value
      const res = await post({ authorization: 'Bearer sekrit' })
      expect(res.status, value).toBe(200)
      expect(await res.json()).toEqual({ ok: true, skipped: 'disabled', closed: 0, failed: 0 })
    }
    expect(closeIdleActiveGames).not.toHaveBeenCalled()
  })

  it('still sweeps when the kill-switch is explicitly off or empty', async () => {
    for (const value of ['', '0', 'false', 'FALSE']) {
      closeIdleActiveGames.mockClear()
      process.env.IDLE_REAPER_DISABLED = value
      const res = await post({ authorization: 'Bearer sekrit' })
      expect(res.status, value).toBe(200)
      expect(closeIdleActiveGames, value).toHaveBeenCalledTimes(1)
    }
  })

  it('checks auth BEFORE the kill-switch, so it is never an unauthenticated probe', async () => {
    // Reversing the order would let anyone learn whether the reaper is disabled
    // (200 skipped vs 401) without the cron secret.
    process.env.IDLE_REAPER_DISABLED = '1'
    const cases: Record<string, string>[] = [{}, { authorization: 'Bearer nope' }]
    for (const headers of cases) {
      const res = await post(headers)
      expect(res.status).toBe(401)
    }
    delete process.env.CRON_SECRET
    expect((await post({ authorization: 'Bearer nope' })).status).toBe(503)
    expect(closeIdleActiveGames).not.toHaveBeenCalled()
  })

  it('swallows a sweep failure instead of 500ing into a retry storm', async () => {
    closeIdleActiveGames.mockRejectedValue(new Error('supabase is having a day'))
    const res = await post({ authorization: 'Bearer sekrit' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, closed: 0, failed: 0 })
  })
})
