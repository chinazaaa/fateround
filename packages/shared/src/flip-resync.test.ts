import { describe, expect, it, vi } from 'vitest'
import { createFlipResyncTracker } from './flip-resync'

// Mirrors how apps/mobile MatchingPairsPlayerView.postFlip drives the tracker around a flip request that
// rejects on a refused / failed response (postMatchingPairsFlip throws on non-OK and on network errors).
function flip(t: ReturnType<typeof createFlipResyncTracker>, request: Promise<unknown>) {
  t.begin()
  let failed = false
  return request
    .catch(() => {
      failed = true
    })
    .then(() => t.end(failed))
}

describe('createFlipResyncTracker (mobile postFlip usage)', () => {
  it('reloads once after a refused flip (409) rejects', async () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    await flip(t, Promise.reject(new Error('Request failed')))
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('does not reload after a clean accept', async () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    await flip(t, Promise.resolve({ success: true }))
    expect(resync).not.toHaveBeenCalled()
  })

  it('waits for the overlapping flip to settle before reloading', async () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    let release!: () => void
    const slow = flip(t, new Promise<void>((r) => (release = r)))
    await flip(t, Promise.reject(new Error('network')))
    expect(resync).not.toHaveBeenCalled()
    expect(t.inFlight()).toBe(true)
    release()
    await slow
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('a rejecting resync does not leak a rejection and leaves the tracker usable', async () => {
    const t = createFlipResyncTracker(() => Promise.reject(new Error('load failed')))
    await flip(t, Promise.reject(new Error('x')))
    await Promise.resolve()
    expect(t.inFlight()).toBe(false)
  })
})

describe('createFlipResyncTracker.evaluateSnapshot (round ownership)', () => {
  const snap = (t: ReturnType<typeof createFlipResyncTracker>, roundId: string, selecting = false) =>
    t.evaluateSnapshot({ roundId, epochAtStart: t.epoch(), selecting })

  it('applies the first snapshot and claims the round', () => {
    const t = createFlipResyncTracker(vi.fn())
    expect(snap(t, 'r1')).toBe('apply')
    expect(t.boardRound()).toBe('r1')
  })

  it('keeps a selection within the same round and defers the read', async () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    expect(snap(t, 'r1', true)).toBe('keep-dirty')
    expect(resync).not.toHaveBeenCalled()
    t.flushDeferred()
    await Promise.resolve()
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('does not preserve a selection from the previous round', () => {
    const t = createFlipResyncTracker(vi.fn())
    snap(t, 'r1')
    expect(snap(t, 'r2', true)).toBe('new-round')
    expect(t.boardRound()).toBe('r2')
  })

  it('does not let an unanswered flip from the previous round block the new round', () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    t.begin()
    expect(snap(t, 'r2')).toBe('new-round')
    expect(resync).not.toHaveBeenCalled()
  })

  it('drops a deferred read that belonged to the previous round', async () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    snap(t, 'r1', true)
    snap(t, 'r2', true)
    t.flushDeferred()
    await Promise.resolve()
    expect(resync).not.toHaveBeenCalled()
  })

  it('still guards an in-flight flip within the new round once it owns the board', () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    snap(t, 'r2')
    t.begin()
    expect(snap(t, 'r2')).toBe('keep-resync')
  })

  it('forgets the owner after clearBoardRound', () => {
    const t = createFlipResyncTracker(vi.fn())
    snap(t, 'r1')
    t.clearBoardRound()
    expect(t.boardRound()).toBeNull()
    expect(snap(t, 'r2', true)).toBe('keep-dirty')
  })
})
