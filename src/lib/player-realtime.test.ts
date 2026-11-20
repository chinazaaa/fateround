import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyPlayerChange,
  createLatestResultApplier,
  createLoadRecovery,
  createNewestCallTracker,
  createRosterReadGuard,
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

describe('createLoadRecovery', () => {
  afterEach(() => vi.useRealTimers())

  it('does not retry when the first load succeeds', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => true)
    createLoadRecovery(load).start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('retries a failed initial load with backoff until it succeeds', async () => {
    vi.useFakeTimers()
    const load = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    createLoadRecovery(load).start()
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1) // 1s
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1) // +2s
    expect(load).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('treats a thrown load like a failure', async () => {
    vi.useFakeTimers()
    const load = vi.fn<() => Promise<boolean>>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(true)
    createLoadRecovery(load).start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('stays bounded: gives up after maxRetries', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => false)
    createLoadRecovery(load, { maxRetries: 3 }).start()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(load).toHaveBeenCalledTimes(4)
  })

  it('stop() cancels a pending retry (unmount during retry)', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => false)
    const recovery = createLoadRecovery(load)
    recovery.start()
    await vi.advanceTimersByTimeAsync(0)
    recovery.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('stop() while a load is in flight prevents scheduling a retry', async () => {
    vi.useFakeTimers()
    let resolve!: (v: boolean) => void
    const load = vi.fn(() => new Promise<boolean>((r) => (resolve = r)))
    const recovery = createLoadRecovery(load)
    recovery.start()
    recovery.stop()
    resolve(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).toHaveBeenCalledTimes(1)
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
    await expect(newer).resolves.toBe(true)
    resolvers[0](['m1']) // stale response arrives last
    await expect(older).resolves.toBe(false)
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
    ).resolves.toBe(true)
    await expect(
      run(
        async () => null,
        (v: string[]) => (feed = v)
      )
    ).resolves.toBe(false)
    expect(feed).toEqual(['a'])
  })
})
