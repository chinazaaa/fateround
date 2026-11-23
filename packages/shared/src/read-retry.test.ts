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

  it('a retry that throws does not break later scheduling', async () => {
    const retry = vi.fn(() => {
      throw new Error('x')
    })
    const r = createReadRetry(retry, [100, 100, 100])
    r.schedule()
    await vi.advanceTimersByTimeAsync(100)
    expect(retry).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(retry).toHaveBeenCalledTimes(2)
  })

  it('a retry resolving false schedules the next attempt until the limit', async () => {
    const retry = vi.fn(async () => false)
    const r = createReadRetry(retry, [100, 200, 400])
    r.schedule()
    await vi.advanceTimersByTimeAsync(100)
    expect(retry).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(199)
    expect(retry).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(retry).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(400)
    expect(retry).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(100_000)
    expect(retry).toHaveBeenCalledTimes(3)
    expect(r.attempts()).toBe(3)
  })

  it('a rejecting or throwing retry also schedules the next attempt until the limit', async () => {
    for (const fail of [
      () => Promise.reject(new Error('x')),
      () => {
        throw new Error('x')
      },
    ]) {
      const retry = vi.fn(fail)
      const r = createReadRetry(retry, [100, 100, 100])
      r.schedule()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(retry).toHaveBeenCalledTimes(3)
    }
  })

  it('a retry resolving true ends the chain and leaves the budget to the read', async () => {
    const retry = vi.fn(async () => true)
    const r = createReadRetry(retry, [100, 100])
    r.schedule()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(r.attempts()).toBe(1)
  })

  it('a failed retry does not stack on a timer its own read armed', async () => {
    const holder: { r?: ReturnType<typeof createReadRetry> } = {}
    const retry = vi.fn(async () => {
      holder.r?.schedule() // the read's own failure path
      return false
    })
    const r = createReadRetry(retry, [100, 100, 100])
    holder.r = r
    r.schedule()
    await vi.advanceTimersByTimeAsync(100)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(r.attempts()).toBe(2)
  })

  it('drops the outcome of a retry that was superseded (reset/cancel/scope) while it ran', async () => {
    let resolve!: (v: boolean) => void
    const retry = vi.fn(() => new Promise<boolean>((res) => (resolve = res)))
    const r = createReadRetry(retry, [100, 100])
    r.schedule()
    await vi.advanceTimersByTimeAsync(100)
    r.reset() // a newer read succeeded meanwhile
    resolve(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(r.attempts()).toBe(0)
  })

  describe('cancelPending (a newer read takes over)', () => {
    it('clears a pending timer and keeps the budget, like cancel', () => {
      const retry = vi.fn()
      const r = createReadRetry(retry, [100, 200])
      r.schedule()
      r.cancelPending()
      vi.advanceTimersByTime(10_000)
      expect(retry).not.toHaveBeenCalled()
      expect(r.attempts()).toBe(1)
      expect(r.schedule()).toBe(true)
    })

    it('does not invalidate a retry that is already running: its failure still arms the next attempt', async () => {
      // The running retry's read is what takes over (cancelPending is called from inside it) and then stalls, so
      // the retry reports false at its deadline. With cancel() that outcome would be dropped and no error branch
      // would ever run; with cancelPending() the next attempt is armed.
      let resolve!: (v: boolean) => void
      const retry = vi.fn(() => new Promise<boolean>((res) => (resolve = res)))
      const r = createReadRetry(retry, [100, 100])
      r.schedule()
      await vi.advanceTimersByTimeAsync(100)
      expect(retry).toHaveBeenCalledTimes(1)
      r.cancelPending() // the replacement read starts
      resolve(false) // ...and stalls out at the deadline
      await vi.advanceTimersByTimeAsync(100)
      expect(retry).toHaveBeenCalledTimes(2) // the next attempt was armed and ran
    })

    it('the same takeover through cancel() loses the running retry (documents why cancelPending exists)', async () => {
      let resolve!: (v: boolean) => void
      const retry = vi.fn(() => new Promise<boolean>((res) => (resolve = res)))
      const r = createReadRetry(retry, [100, 100])
      r.schedule()
      await vi.advanceTimersByTimeAsync(100)
      r.cancel()
      resolve(false)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(retry).toHaveBeenCalledTimes(1)
    })

    it('the running retry is still superseded by a success (reset), a round change (scope) and unmount (cancel)', async () => {
      for (const supersede of [
        (r: ReturnType<typeof createReadRetry>) => r.reset(),
        (r: ReturnType<typeof createReadRetry>) => r.scope('next-round'),
        (r: ReturnType<typeof createReadRetry>) => r.cancel(),
      ]) {
        let resolve!: (v: boolean) => void
        const retry = vi.fn(() => new Promise<boolean>((res) => (resolve = res)))
        const r = createReadRetry(retry, [100, 100])
        r.scope('round')
        r.schedule()
        await vi.advanceTimersByTimeAsync(100)
        r.cancelPending()
        supersede(r)
        resolve(false)
        await vi.advanceTimersByTimeAsync(10_000)
        expect(retry).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe('scope', () => {
    it('resets the budget once when the key changes, not on the same key', async () => {
      const retry = vi.fn(async () => false)
      const r = createReadRetry(retry, [100, 100, 100])
      r.scope('A')
      r.schedule()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(retry).toHaveBeenCalledTimes(3)
      expect(r.schedule()).toBe(false)
      r.scope('A') // same round re-armed: budget stays used up
      expect(r.schedule()).toBe(false)
      r.scope('B')
      expect(r.attempts()).toBe(0)
      expect(r.schedule()).toBe(true)
      r.cancel()
      r.scope('B') // same key again does not refill
      expect(r.attempts()).toBe(1)
    })

    it('a round change cancels the pending timer of the old round', async () => {
      const retry = vi.fn(async () => true)
      const r = createReadRetry(retry, [100, 100])
      r.scope('A')
      r.schedule()
      r.scope('B')
      await vi.advanceTimersByTimeAsync(10_000)
      expect(retry).not.toHaveBeenCalled()
    })

    it('a null key (no round) is a scope too', () => {
      const r = createReadRetry(() => true, [100])
      r.scope('A')
      r.schedule()
      r.scope(null)
      expect(r.attempts()).toBe(0)
    })
  })
})
