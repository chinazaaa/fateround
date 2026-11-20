import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyPlayerChange, createRosterReadGuard } from './player-realtime'

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
