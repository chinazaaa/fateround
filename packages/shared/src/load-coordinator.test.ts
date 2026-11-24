import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLoadCoordinator } from './load-coordinator'

const STALE = 1000

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('createLoadCoordinator', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesces overlapping loads into one trailing re-run', async () => {
    const gate = deferred<boolean>()
    const run = vi.fn<(gen: number) => Promise<boolean>>().mockReturnValueOnce(gate.promise).mockResolvedValue(true)
    const c = createLoadCoordinator({ run, staleMs: STALE })
    const first = c.load()
    void c.load()
    void c.load()
    expect(run).toHaveBeenCalledTimes(1)
    gate.resolve(true)
    await first
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('replacing a stuck run drops the re-run the abandoned chain had queued', async () => {
    // The abandoned run's queued request is answered by the replacement's own fresh read; keeping it made the
    // replacement read twice.
    const stuck = new Promise<boolean>(() => {})
    const run = vi.fn<(gen: number) => Promise<boolean>>().mockReturnValueOnce(stuck).mockResolvedValue(true)
    const c = createLoadCoordinator({ run, staleMs: STALE })
    const abandoned = c.load()
    void c.load() // queues a re-run on the stuck chain
    vi.advanceTimersByTime(STALE + 1)
    const replacement = c.load()
    await expect(abandoned).resolves.toBe(false)
    await expect(replacement).resolves.toBe(true)
    expect(run).toHaveBeenCalledTimes(2) // first (stuck) + ONE replacement read, no extra queued one
  })

  it('invalidate() supersedes the running chain: a load for another room starts its own run', async () => {
    const stuck = new Promise<boolean>(() => {})
    const gens: number[] = []
    const run = vi.fn(async (gen: number) => {
      gens.push(gen)
      return gens.length === 1 ? stuck : true
    })
    const c = createLoadCoordinator({ run, staleMs: STALE })
    const oldRoom = c.load()
    expect(c.isCurrent(gens[0]!)).toBe(true)
    c.invalidate() // room change
    expect(c.isCurrent(gens[0]!)).toBe(false)
    await expect(oldRoom).resolves.toBe(false)
    await expect(c.load()).resolves.toBe(true) // NOT folded into the old room's run
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('without invalidate a second-room load would only flag the old run (documents the bug)', async () => {
    const stuck = new Promise<boolean>(() => {})
    const run = vi.fn<(gen: number) => Promise<boolean>>().mockReturnValueOnce(stuck)
    const c = createLoadCoordinator({ run, staleMs: STALE })
    void c.load()
    await c.load()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('invalidate() clears a queued re-run', async () => {
    const gate = deferred<boolean>()
    const run = vi.fn<(gen: number) => Promise<boolean>>().mockReturnValueOnce(gate.promise).mockResolvedValue(true)
    const c = createLoadCoordinator({ run, staleMs: STALE })
    void c.load()
    void c.load() // queued
    c.invalidate()
    gate.resolve(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('close() refuses loads until open()', async () => {
    const run = vi.fn(async () => true)
    const c = createLoadCoordinator({ run, staleMs: STALE })
    c.close()
    await expect(c.load()).resolves.toBe(false)
    expect(run).not.toHaveBeenCalled()
    c.open()
    await expect(c.load()).resolves.toBe(true)
  })

  it('a rejecting run still performs the queued re-run and reports the latest outcome', async () => {
    const gate = deferred<boolean>()
    const run = vi
      .fn<(gen: number) => Promise<boolean>>()
      .mockImplementationOnce(() => gate.promise.then(() => Promise.reject(new Error('boom'))))
      .mockResolvedValue(true)
    const c = createLoadCoordinator({ run, staleMs: STALE })
    const settled = c.loadSettled()
    void c.loadSettled() // queues the re-run
    gate.resolve(true)
    await expect(settled).resolves.toBe(true)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('loadSettled joined to a run resolves with the queued re-run outcome', async () => {
    const gate = deferred<boolean>()
    const run = vi.fn<(gen: number) => Promise<boolean>>().mockReturnValueOnce(gate.promise).mockResolvedValue(false)
    const c = createLoadCoordinator({ run, staleMs: STALE })
    void c.load()
    const settled = c.loadSettled()
    gate.resolve(true)
    await expect(settled).resolves.toBe(false)
  })

  it('loadSettled gives up with false once the run is stale', async () => {
    const run = vi.fn(() => new Promise<boolean>(() => {}))
    const c = createLoadCoordinator({ run, staleMs: STALE })
    const settled = c.loadSettled()
    await vi.advanceTimersByTimeAsync(STALE + 1)
    await expect(settled).resolves.toBe(false)
  })

  it('setRun installs the latest closure for the next run', async () => {
    const first = vi.fn(async () => true)
    const second = vi.fn(async () => true)
    const c = createLoadCoordinator({ run: first, staleMs: STALE })
    c.setRun(second)
    await c.load()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
