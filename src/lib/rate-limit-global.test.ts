import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enforceGlobalLimit, RATE_LIMITS } from '@/lib/rate-limit'

const rpc = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}))

const RULE = { bucket: 'test-global', max: 3, windowSeconds: 86_400 }

beforeEach(() => rpc.mockReset())

describe('enforceGlobalLimit', () => {
  it('allows a request under the cap', async () => {
    rpc.mockResolvedValue({ data: [{ attempt_count: 1, window_started_at: new Date().toISOString() }], error: null })
    expect(await enforceGlobalLimit(RULE)).toBeNull()
  })

  it('allows the request that lands exactly on the cap', async () => {
    rpc.mockResolvedValue({ data: [{ attempt_count: 3, window_started_at: new Date().toISOString() }], error: null })
    expect(await enforceGlobalLimit(RULE)).toBeNull()
  })

  it('rejects with 429 once over the cap', async () => {
    rpc.mockResolvedValue({ data: [{ attempt_count: 4, window_started_at: new Date().toISOString() }], error: null })
    const res = await enforceGlobalLimit(RULE)
    expect(res?.status).toBe(429)
    expect(res?.headers.get('Retry-After')).toBeTruthy()
  })

  // The counter is keyed to a constant, NOT the caller — that is what makes it a
  // ceiling on total spend rather than a per-caller allowance an attacker can
  // reset by changing IP.
  it('uses one constant key for every caller', async () => {
    rpc.mockResolvedValue({ data: [{ attempt_count: 1, window_started_at: new Date().toISOString() }], error: null })
    await enforceGlobalLimit(RULE)
    await enforceGlobalLimit(RULE)
    const keys = rpc.mock.calls.map((c) => (c[1] as { p_key: string }).p_key)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe('test-global:global')
  })

  // Deliberately the opposite of enforceRateLimit. A DB outage is exactly when
  // nobody is watching the spend dashboard, so the safe default is to stop
  // spending rather than to keep serving.
  it('fails CLOSED when the counter query errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'db down' } })
    expect((await enforceGlobalLimit(RULE))?.status).toBe(503)
  })

  // No row means the reservation didn't happen, so we can't prove we're under the
  // cap. Assuming zero usage there is exactly how a broken counter becomes an
  // unbounded bill.
  it('fails CLOSED when the counter row is missing', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect((await enforceGlobalLimit(RULE))?.status).toBe(503)
  })

  it('fails CLOSED when the counter row has no usable count', async () => {
    rpc.mockResolvedValue({ data: [{ window_started_at: new Date().toISOString() }], error: null })
    expect((await enforceGlobalLimit(RULE))?.status).toBe(503)
  })
})

describe('AI question spend caps', () => {
  it('has a global daily bucket distinct from the per-IP buckets', () => {
    const { aiQuestions, aiQuestionsDaily, aiQuestionsGlobalDaily } = RATE_LIMITS
    const buckets = [aiQuestions.bucket, aiQuestionsDaily.bucket, aiQuestionsGlobalDaily.bucket]
    expect(new Set(buckets).size).toBe(3)
    expect(aiQuestionsGlobalDaily.windowSeconds).toBe(86_400)
  })

  // A global cap below the per-IP daily cap would make the per-IP limit
  // unreachable and the whole app share one person's allowance.
  it('sets the global ceiling above a single caller’s daily allowance', () => {
    expect(RATE_LIMITS.aiQuestionsGlobalDaily.max).toBeGreaterThan(RATE_LIMITS.aiQuestionsDaily.max)
  })
})
