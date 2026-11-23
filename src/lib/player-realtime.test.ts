import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyPlayerChange,
  createLatestResultApplier,
  createNewestCallTracker,
  createRosterReadGuard,
  createSerialLoader,
} from './player-realtime'

type P = { id: string; name: string; spectator: boolean }
const a: P = { id: 'a', name: 'A', spectator: false }
const v: P = { id: 'v', name: 'V', spectator: true }

describe('applyPlayerChange', () => {
  it('INSERT adds a row once', () => {
    expect(applyPlayerChange([a], { eventType: 'INSERT', new: v })).toEqual([a, v])
    expect(applyPlayerChange([a, v], { eventType: 'INSERT', new: v })).toEqual([a, v])
  })

  it('UPDATE merges the changed row, so a viewer readying up becomes a participant', () => {
    const next = applyPlayerChange([a, v], { eventType: 'UPDATE', new: { ...v, spectator: false } })
    expect(next).toEqual([a, { ...v, spectator: false }])
    expect(next.filter((p) => !p.spectator)).toHaveLength(2)
  })

  it('UPDATE keeps fields the partial payload omits', () => {
    const next = applyPlayerChange([a, v], { eventType: 'UPDATE', new: { id: 'v', spectator: false } as P })
    expect(next[1]).toEqual({ id: 'v', name: 'V', spectator: false })
  })

  it('UPDATE for an unseen row adds it', () => {
    expect(applyPlayerChange([a], { eventType: 'UPDATE', new: v })).toEqual([a, v])
  })

  it('DELETE removes by id', () => {
    expect(applyPlayerChange([a, v], { eventType: 'DELETE', old: { id: 'a' } })).toEqual([v])
  })
})

describe('createRosterReadGuard', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
  }

  it('returns a read that no event overtook', async () => {
    const guard = createRosterReadGuard()
    await expect(guard.read(async () => 'snap')).resolves.toBe('snap')
  })

  it('rejects a read that started before an event and fetches a fresh snapshot', async () => {
    const guard = createRosterReadGuard()
    const first = deferred<string>()
    let calls = 0
    const result = guard.read(() => {
      calls += 1
      return calls === 1 ? first.promise : Promise.resolve('fresh')
    })
    guard.noteEvent() // UPDATE applied while the first read was in flight
    first.resolve('stale')
    await expect(result).resolves.toBe('fresh')
    expect(calls).toBe(2)
  })

  it('does not discard a read when the event landed before it started', async () => {
    const guard = createRosterReadGuard()
    guard.noteEvent()
    let calls = 0
    await expect(
      guard.read(async () => {
        calls += 1
        return 'snap'
      })
    ).resolves.toBe('snap')
    expect(calls).toBe(1)
  })

  it('passes a failed read (null) through without retrying', async () => {
    const guard = createRosterReadGuard()
    let calls = 0
    await expect(
      guard.read(async () => {
        calls += 1
        return null
      })
    ).resolves.toBeNull()
    expect(calls).toBe(1)
  })

  it('gives up with null after maxAttempts consecutive overtaken reads', async () => {
    const guard = createRosterReadGuard(2)
    let calls = 0
    const result = await guard.read(async () => {
      calls += 1
      guard.noteEvent()
      return 'stale'
    })
    expect(result).toBeNull()
    expect(calls).toBe(2)
  })
})

describe('shared copy parity', () => {
  it('keeps packages/shared/src/player-realtime.ts identical to the web copy (minus the header comment)', () => {
    const body = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').split('\n').slice(2).join('\n')
    expect(body('packages/shared/src/player-realtime.ts')).toBe(body('src/lib/player-realtime.ts'))
  })
})

describe('createSerialLoader', () => {
  afterEach(() => vi.useRealTimers())

  it('runs one load for the request and resolves true', async () => {
    const load = vi.fn(async () => true)
    const loader = createSerialLoader(load)
    await expect(loader.request()).resolves.toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('never runs two loads at once and shares the in-flight result with plain requests', async () => {
    let resolve!: (v: boolean) => void
    let active = 0
    let maxActive = 0
    const load = vi.fn(() => {
      active += 1
      maxActive = Math.max(maxActive, active)
      return new Promise<boolean>((r) => {
        resolve = (v) => {
          active -= 1
          r(v)
        }
      })
    })
    const loader = createSerialLoader(load)
    const first = loader.request()
    const second = loader.request() // e.g. the poll's immediate tick while the initial load runs
    resolve(true)
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
    expect(maxActive).toBe(1)
  })

  it('a fresh request during a load triggers exactly one follow-up read that starts after it', async () => {
    const resolvers: Array<(v: boolean) => void> = []
    const load = vi.fn(() => new Promise<boolean>((r) => resolvers.push(r)))
    const loader = createSerialLoader(load)
    const a = loader.request()
    const b = loader.request({ fresh: true })
    const c = loader.request({ fresh: true })
    expect(load).toHaveBeenCalledTimes(1)
    resolvers[0](true)
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    resolvers[1](true)
    await expect(Promise.all([a, b, c])).resolves.toEqual([true, true, true])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('a failed shared load is not reported as success to a coalesced requester (no stranded skeleton)', async () => {
    vi.useFakeTimers()
    const load = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValue(true)
    const loader = createSerialLoader(load)
    const initial = loader.request() // retry owner
    const poll = loader.request({ retry: false }) // coalesced, must see the real outcome
    await expect(initial).resolves.toBe(false)
    await expect(poll).resolves.toBe(false)
    await vi.advanceTimersByTimeAsync(1000) // the retry still happens
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('retries a failed load with backoff until it succeeds, then stops', async () => {
    vi.useFakeTimers()
    const load = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    createSerialLoader(load).request()
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('does not retry when the requester opted out (the poll backs off itself)', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => false)
    await createSerialLoader(load).request({ retry: false })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('treats a thrown load like a failure and stays bounded', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async (): Promise<boolean> => {
      throw new Error('boom')
    })
    createSerialLoader(load, { maxRetries: 3 }).request()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(load).toHaveBeenCalledTimes(4)
  })

  it('a new request cancels the pending retry and loads immediately', async () => {
    vi.useFakeTimers()
    const load = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValue(true)
    const loader = createSerialLoader(load)
    void loader.request()
    await vi.advanceTimersByTimeAsync(0)
    await loader.request({ fresh: true })
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('stop() cancels a pending retry (unmount during retry)', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => false)
    const loader = createSerialLoader(load)
    void loader.request()
    await vi.advanceTimersByTimeAsync(0)
    loader.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
    await expect(loader.request()).resolves.toBe(false)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('start() re-arms a stopped loader (StrictMode cleanup then remount)', async () => {
    const load = vi.fn(async () => true)
    const loader = createSerialLoader(load)
    loader.stop()
    loader.start()
    await expect(loader.request()).resolves.toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('stop() while a load is in flight prevents a follow-up or retry', async () => {
    vi.useFakeTimers()
    let resolve!: (v: boolean) => void
    const load = vi.fn(() => new Promise<boolean>((r) => (resolve = r)))
    const loader = createSerialLoader(load)
    void loader.request()
    void loader.request({ fresh: true })
    loader.stop()
    resolve(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('createSerialLoader state machine', () => {
  afterEach(() => vi.useRealTimers())

  /** A load whose attempts the test resolves by hand, in order. */
  function manualLoad() {
    const pending: Array<(v: boolean) => void> = []
    const load = vi.fn(() => new Promise<boolean>((r) => pending.push(r)))
    return { load, finish: (n: number, ok: boolean) => pending[n](ok), calls: () => load.mock.calls.length }
  }

  // Each request resolves with the outcome of the attempt that served it.
  it.each([
    { active: true, followup: true },
    { active: true, followup: false },
    { active: false, followup: true },
    { active: false, followup: false },
  ])('ordinary request gets $active and queued fresh request gets $followup', async ({ active, followup }) => {
    const m = manualLoad()
    const loader = createSerialLoader(m.load)
    const ordinary = loader.request({ retry: false })
    const fresh = loader.request({ fresh: true, retry: false })
    m.finish(0, active)
    await vi.waitFor(() => expect(m.calls()).toBe(2))
    m.finish(1, followup)
    await expect(ordinary).resolves.toBe(active)
    await expect(fresh).resolves.toBe(followup)
  })

  it('a queued fresh request starts a new retry budget after the budget was exhausted', async () => {
    vi.useFakeTimers()
    const m = manualLoad()
    const loader = createSerialLoader(m.load, { maxRetries: 1 })
    void loader.request() // attempt 0
    m.finish(0, false)
    await vi.advanceTimersByTimeAsync(1000) // the one allowed retry starts: attempt 1 (last of the budget)
    expect(m.calls()).toBe(2)
    const fresh = loader.request({ fresh: true }) // arrives during the last retry
    m.finish(1, false) // exhausts the old budget
    await vi.waitFor(() => expect(m.calls()).toBe(3)) // follow-up runs
    m.finish(2, false) // follow-up fails: it must schedule a retry of its own
    await expect(fresh).resolves.toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(m.calls()).toBe(4)
  })

  it('a poll that replaces a pending retry inherits recovery: if it fails, retries continue within the bound', async () => {
    vi.useFakeTimers()
    const m = manualLoad()
    const loader = createSerialLoader(m.load, { maxRetries: 2 })
    void loader.request() // owner of recovery
    m.finish(0, false) // retry #1 scheduled
    await vi.advanceTimersByTimeAsync(0)
    const poll = loader.request({ retry: false }) // visibility poll replaces the timer
    expect(m.calls()).toBe(2)
    m.finish(1, false) // the poll fails while realtime is healthy: recovery must NOT end
    await expect(poll).resolves.toBe(false)
    await vi.advanceTimersByTimeAsync(2000) // retry #2 (budget carried, not reset)
    expect(m.calls()).toBe(3)
    m.finish(2, false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(m.calls()).toBe(3) // bound: initial + 2 retries in total, poll included
  })

  it('a poll that replaces a pending retry and succeeds ends recovery', async () => {
    vi.useFakeTimers()
    const m = manualLoad()
    const loader = createSerialLoader(m.load)
    void loader.request()
    m.finish(0, false)
    await vi.advanceTimersByTimeAsync(0)
    const poll = loader.request({ retry: false })
    m.finish(1, true)
    await expect(poll).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(m.calls()).toBe(2)
  })

  it('a poll with no recovery pending still does not retry', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => false)
    await createSerialLoader(load).request({ retry: false })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('timer-started retries still stop at the bound', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => false)
    void createSerialLoader(load, { maxRetries: 2 }).request()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('stop() settles old waiters false; a request after start() queues behind the running callback', async () => {
    const m = manualLoad()
    const loader = createSerialLoader(m.load)
    const old = loader.request()
    loader.stop()
    await expect(old).resolves.toBe(false)
    loader.start()
    const next = loader.request()
    expect(m.calls()).toBe(1) // callbacks stay serialized: the old one is still running
    m.finish(0, true) // old callback ends; its result belongs to no one
    await vi.waitFor(() => expect(m.calls()).toBe(2)) // the new setup gets its own read
    m.finish(1, true)
    await expect(next).resolves.toBe(true)
  })

  it('a stale attempt that ends after stop() does not schedule a retry or settle new waiters early', async () => {
    vi.useFakeTimers()
    const m = manualLoad()
    const loader = createSerialLoader(m.load)
    void loader.request()
    loader.stop()
    m.finish(0, false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(m.calls()).toBe(1)
  })

  it('a plain request after start() while a stale attempt runs does not join it', async () => {
    const m = manualLoad()
    const loader = createSerialLoader(m.load)
    void loader.request()
    loader.stop()
    loader.start()
    let settled = false
    const next = loader.request().then((v) => {
      settled = true
      return v
    })
    m.finish(0, true)
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.waitFor(() => expect(m.calls()).toBe(2))
    m.finish(1, false)
    await expect(next).resolves.toBe(false)
  })
})

describe('createNewestCallTracker', () => {
  it('reports only the latest call as current', () => {
    const tracker = createNewestCallTracker()
    const first = tracker.begin()
    expect(first()).toBe(false)
    const second = tracker.begin()
    expect(first()).toBe(true)
    expect(second()).toBe(false)
  })

  it('lets an older load that finishes last be discarded (out-of-order completion)', async () => {
    const tracker = createNewestCallTracker()
    const writes: string[] = []
    const resolvers: Array<() => void> = []
    const load = async (label: string) => {
      const superseded = tracker.begin()
      await new Promise<void>((r) => resolvers.push(r))
      if (superseded()) return true
      writes.push(label)
      return true
    }
    const older = load('older')
    const newer = load('newer')
    resolvers[1]() // newer finishes first
    await newer
    resolvers[0]() // older finishes last
    await older
    expect(writes).toEqual(['newer'])
  })
})

describe('createLatestResultApplier', () => {
  it('drops an older message response that resolves after a newer one', async () => {
    const run = createLatestResultApplier()
    const resolvers: Array<(v: string[]) => void> = []
    const fetchFeed = () => new Promise<string[]>((r) => resolvers.push(r))
    let feed: string[] = []
    const apply = (v: string[]) => {
      feed = v
    }
    const older = run(fetchFeed, apply)
    const newer = run(fetchFeed, apply)
    resolvers[1](['m1', 'm2']) // newer response arrives first
    await expect(newer).resolves.toBe('applied')
    resolvers[0](['m1']) // stale response arrives last
    await expect(older).resolves.toBe('superseded')
    expect(feed).toEqual(['m1', 'm2'])
  })

  it('applies an in-order response and skips a failed (null) read', async () => {
    const run = createLatestResultApplier()
    let feed: string[] = []
    await expect(
      run(
        async () => ['a'],
        (v) => (feed = v)
      )
    ).resolves.toBe('applied')
    await expect(
      run(
        async () => null,
        (v: string[]) => (feed = v)
      )
    ).resolves.toBe('failed')
    expect(feed).toEqual(['a'])
  })

  it('reports a superseded FAILED read as superseded, not failed (no stale error)', async () => {
    const run = createLatestResultApplier()
    const resolvers: Array<(v: string[] | null) => void> = []
    const fetchFeed = () => new Promise<string[] | null>((r) => resolvers.push(r))
    const apply = () => {}
    const older = run(fetchFeed, apply)
    const newer = run(fetchFeed, apply)
    resolvers[1](['ok'])
    await expect(newer).resolves.toBe('applied')
    resolvers[0](null) // older read fails after the newer one succeeded
    await expect(older).resolves.toBe('superseded')
  })

  it('reports a current failed read as failed', async () => {
    const run = createLatestResultApplier()
    await expect(
      run(
        async () => null,
        () => {}
      )
    ).resolves.toBe('failed')
  })
})
