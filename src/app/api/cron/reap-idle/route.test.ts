import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
const adminClient = {}
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => adminClient }))

const closeIdleActiveGames = vi.fn()
vi.mock('@/lib/idle-reaper', () => ({
  closeIdleActiveGames: (...a: unknown[]) => closeIdleActiveGames(...a),
  resolveIdleMinutes: () => 30,
}))

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

  it('no-ops when the IDLE_REAPER_DISABLED kill-switch is set', async () => {
    process.env.IDLE_REAPER_DISABLED = '1'
    const res = await post({ authorization: 'Bearer sekrit' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: 'disabled', closed: 0, failed: 0 })
    expect(closeIdleActiveGames).not.toHaveBeenCalled()
  })

  it('swallows a sweep failure instead of 500ing into a retry storm', async () => {
    closeIdleActiveGames.mockRejectedValue(new Error('supabase is having a day'))
    const res = await post({ authorization: 'Bearer sekrit' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, closed: 0, failed: 0 })
  })
})
