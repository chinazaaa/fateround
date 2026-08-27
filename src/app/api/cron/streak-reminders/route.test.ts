import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({}) }))

const sendStreakReminders = vi.fn()
vi.mock('@/lib/streak-reminders', () => ({ sendStreakReminders: (...a: unknown[]) => sendStreakReminders(...a) }))

import { POST } from './route'

/**
 * The cron entrypoint's job is to be unreachable without the secret and unable to fail loudly.
 *
 * An open reminder endpoint is a free push-spam cannon aimed at every player with a streak,
 * so the auth guard matters more here than on a normal route — and an unset CRON_SECRET must
 * CLOSE the door, not open it, which is the failure mode a naive `if (header !== secret)`
 * check has when `secret` is undefined and the header is absent.
 */
const post = (headers: Record<string, string> = {}) =>
  POST(new NextRequest('https://fateround.test/api/cron/streak-reminders', { method: 'POST', headers }))

describe('POST /api/cron/streak-reminders', () => {
  const original = process.env.CRON_SECRET
  beforeEach(() => {
    sendStreakReminders.mockReset()
    sendStreakReminders.mockResolvedValue({ candidates: 3, sent: 2, skipped: 1 })
    process.env.CRON_SECRET = 'sekrit'
  })
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it('runs with the right bearer', async () => {
    const res = await post({ authorization: 'Bearer sekrit' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, candidates: 3, sent: 2, skipped: 1 })
    expect(sendStreakReminders).toHaveBeenCalledOnce()
  })

  it('rejects a missing or wrong bearer without sending anything', async () => {
    const cases: Record<string, string>[] = [{}, { authorization: 'Bearer nope' }, { authorization: 'sekrit' }]
    for (const headers of cases) {
      const res = await post(headers)
      expect(res.status).toBe(401)
    }
    expect(sendStreakReminders).not.toHaveBeenCalled()
  })

  it('closes rather than opens when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    const res = await post({ authorization: 'Bearer undefined' })
    expect(res.status).toBe(503)
    expect(sendStreakReminders).not.toHaveBeenCalled()
  })

  it('swallows a failure instead of 500ing into a retry storm', async () => {
    sendStreakReminders.mockRejectedValue(new Error('supabase is having a day'))
    const res = await post({ authorization: 'Bearer sekrit' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, sent: 0 })
  })
})
