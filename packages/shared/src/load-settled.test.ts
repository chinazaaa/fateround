import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { awaitLoadSettled } from './load-settled'

const STALE = 12_000

describe('awaitLoadSettled', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => vi.useRealTimers())

  it('resolves with the chain outcome', async () => {
    let started: number | null = 0
    const p = awaitLoadSettled({ waitFor: Promise.resolve(true), runStartedAt: () => started, staleMs: STALE })
    await expect(p).resolves.toBe(true)
    started = null
  })

  it('resolves false when a rejected chain settles', async () => {
    const p = awaitLoadSettled({
      waitFor: Promise.reject(new Error('x')),
      runStartedAt: () => 0,
      staleMs: STALE,
    })
    await expect(p).resolves.toBe(false)
  })

  it('gives up with false once the running run is stale', async () => {
    const p = awaitLoadSettled({ waitFor: new Promise(() => {}), runStartedAt: () => 0, staleMs: STALE })
    await vi.advanceTimersByTimeAsync(STALE)
    await expect(p).resolves.toBe(false)
  })

  it('does not time out on the first run clock while a trailing run is inside its own window', async () => {
    let started: number | null = 0
    let settle!: (v: boolean) => void
    const chain = new Promise<boolean>((r) => (settle = r))
    const p = awaitLoadSettled({ waitFor: chain, runStartedAt: () => started, staleMs: STALE })
    // First run ends at t=10s and a trailing run starts: its window is 10s..22s.
    await vi.advanceTimersByTimeAsync(10_000)
    started = 10_000
    await vi.advanceTimersByTimeAsync(STALE - 10_000 + 1) // past the first run's deadline (t=12s)
    let resolved: boolean | undefined
    void p.then((v) => (resolved = v))
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).toBeUndefined()
    // The trailing run succeeds at t=20s, inside its own window.
    await vi.advanceTimersByTimeAsync(20_000 - 12_001)
    settle(true)
    await expect(p).resolves.toBe(true)
  })

  it('still gives up when the trailing run itself goes stale', async () => {
    let started: number | null = 0
    const p = awaitLoadSettled({ waitFor: new Promise(() => {}), runStartedAt: () => started, staleMs: STALE })
    await vi.advanceTimersByTimeAsync(10_000)
    started = 10_000
    await vi.advanceTimersByTimeAsync(STALE) // t=22s = trailing start + STALE
    await expect(p).resolves.toBe(false)
  })

  it('gives up immediately when no run is executing the chain any more', async () => {
    const p = awaitLoadSettled({ waitFor: new Promise(() => {}), runStartedAt: () => null, staleMs: STALE })
    await vi.advanceTimersByTimeAsync(0)
    await expect(p).resolves.toBe(false)
  })
})
