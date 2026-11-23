import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReadRetry } from './read-retry'

describe('createReadRetry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('retries with backoff then stops at the limit', () => {
    const retry = vi.fn()
    const r = createReadRetry(retry, [100, 200, 400])
    expect(r.schedule()).toBe(true)
    vi.advanceTimersByTime(99)
    expect(retry).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(r.schedule()).toBe(true)
    vi.advanceTimersByTime(199)
    expect(retry).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(retry).toHaveBeenCalledTimes(2)
    expect(r.schedule()).toBe(true)
    vi.advanceTimersByTime(400)
    expect(retry).toHaveBeenCalledTimes(3)
    expect(r.schedule()).toBe(false)
    vi.advanceTimersByTime(100_000)
    expect(retry).toHaveBeenCalledTimes(3)
  })

  it('does not stack timers when scheduled twice', () => {
    const retry = vi.fn()
    const r = createReadRetry(retry, [100, 200])
    r.schedule()
    r.schedule()
    vi.advanceTimersByTime(10_000)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(r.attempts()).toBe(1)
  })

  it('cancel (unmount / newer read) drops a pending retry and keeps the budget', () => {
    const retry = vi.fn()
    const r = createReadRetry(retry, [100, 200])
    r.schedule()
    r.cancel()
    vi.advanceTimersByTime(10_000)
    expect(retry).not.toHaveBeenCalled()
    expect(r.attempts()).toBe(1)
    expect(r.schedule()).toBe(true)
    vi.advanceTimersByTime(200)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('reset (success / new round) cancels and restores the full budget', () => {
    const retry = vi.fn()
    const r = createReadRetry(retry, [100])
    expect(r.schedule()).toBe(true)
    vi.advanceTimersByTime(100)
    expect(r.schedule()).toBe(false)
    r.reset()
    expect(r.schedule()).toBe(true)
    r.reset()
    vi.advanceTimersByTime(10_000)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('a retry that throws does not break later scheduling', () => {
    const retry = vi.fn(() => {
      throw new Error('x')
    })
    const r = createReadRetry(retry, [100, 100])
    r.schedule()
    vi.advanceTimersByTime(100)
    expect(r.schedule()).toBe(true)
    vi.advanceTimersByTime(100)
    expect(retry).toHaveBeenCalledTimes(2)
  })
})
