import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- mocks ---------------------------------------------------------------
const rpc = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ rpc }),
}))

let mockIp = '203.0.113.7'
vi.mock('@/lib/community-rate-limit', () => ({
  clientIp: () => mockIp,
}))

// hashKey needs a secret; set one before importing the module under test.
process.env.ADMIN_SESSION_SECRET = 'test-secret'

import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

const rule = { bucket: 'test', max: 3, windowSeconds: 300 }
const req = new Request('https://x.test/api', { method: 'POST' })

beforeEach(() => {
  rpc.mockReset()
  mockIp = '203.0.113.7'
})

describe('enforceRateLimit', () => {
  it('allows (null) while the count is at or below the cap', async () => {
    rpc.mockResolvedValue({ data: { attempt_count: 3, window_started_at: new Date().toISOString() }, error: null })
    expect(await enforceRateLimit(req, rule)).toBeNull()
  })

  it('returns a 429 with Retry-After once the count exceeds the cap', async () => {
    const windowStart = new Date(Date.now() - 60_000).toISOString() // 60s into a 300s window
    rpc.mockResolvedValue({ data: { attempt_count: 4, window_started_at: windowStart }, error: null })
    const res = await enforceRateLimit(req, rule)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(429)
    const retryAfter = Number(res!.headers.get('Retry-After'))
    // ~240s remaining in the window, always positive and bounded by the window.
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(rule.windowSeconds)
  })

  it('handles the RPC returning an array row shape', async () => {
    rpc.mockResolvedValue({ data: [{ attempt_count: 99, window_started_at: new Date().toISOString() }], error: null })
    const res = await enforceRateLimit(req, rule)
    expect(res?.status).toBe(429)
  })

  it('fails open (null) when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await enforceRateLimit(req, rule)).toBeNull()
  })

  it('fails open (null) when the RPC throws', async () => {
    rpc.mockRejectedValue(new Error('network'))
    expect(await enforceRateLimit(req, rule)).toBeNull()
  })

  it('skips limiting for headerless (unknown) IPs without touching the DB', async () => {
    mockIp = 'unknown'
    expect(await enforceRateLimit(req, rule)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('passes the configured window to the RPC', async () => {
    rpc.mockResolvedValue({ data: { attempt_count: 1, window_started_at: new Date().toISOString() }, error: null })
    await enforceRateLimit(req, RATE_LIMITS.gameCreate)
    expect(rpc).toHaveBeenCalledWith('api_rate_limit_touch', expect.objectContaining({ p_window_seconds: 300 }))
    const key = rpc.mock.calls[0]![1].p_key as string
    expect(key.startsWith('game-create:')).toBe(true)
  })

  it('exposes sane default limits', () => {
    expect(RATE_LIMITS.gameCreate.max).toBeGreaterThan(0)
    expect(RATE_LIMITS.join.max).toBeGreaterThanOrEqual(RATE_LIMITS.gameCreate.max)
  })
})
