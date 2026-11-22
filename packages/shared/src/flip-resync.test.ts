import { describe, expect, it, vi } from 'vitest'
import { createFlipResyncTracker } from './flip-resync'

// Mirrors how apps/mobile MatchingPairsPlayerView.postFlip drives the tracker around a flip request that
// rejects on a refused / failed response (postMatchingPairsFlip throws on non-OK and on network errors).
function flip(t: ReturnType<typeof createFlipResyncTracker>, request: Promise<unknown>) {
  const token = t.begin()
  let failed = false
  return request
    .catch(() => {
      failed = true
    })
    .then(() => t.end(token, failed))
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
    t.begin('r1')
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
    t.begin('r2')
    expect(snap(t, 'r2')).toBe('keep-resync')
  })

  it('forgets the owner after clearBoardRound', () => {
    const t = createFlipResyncTracker(vi.fn())
    snap(t, 'r1')
    t.clearBoardRound('r2')
    expect(t.boardRound()).toBeNull()
  })

  it('the first board after clearBoardRound still takes the new-round path (even with a selection or a flip)', () => {
    const t = createFlipResyncTracker(vi.fn())
    snap(t, 'r1')
    t.begin('r1') // r1 flip still unanswered
    t.clearBoardRound('r2') // r2 has no board yet
    expect(snap(t, 'r2', true)).toBe('new-round')
    expect(t.boardRound()).toBe('r2')
  })

  it('a second board of the same round after the clear is a normal snapshot again', () => {
    const t = createFlipResyncTracker(vi.fn())
    snap(t, 'r1')
    t.clearBoardRound('r2')
    expect(snap(t, 'r2')).toBe('new-round')
    expect(snap(t, 'r2')).toBe('apply')
  })
})

describe('createFlipResyncTracker pending flips are scoped to their round', () => {
  const snap = (t: ReturnType<typeof createFlipResyncTracker>, roundId: string, selecting = false) =>
    t.evaluateSnapshot({ roundId, epochAtStart: t.epoch(), selecting })

  it('an unanswered r1 flip does not hold back later r2 snapshots', () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    t.begin('r1') // never answered
    expect(snap(t, 'r2')).toBe('new-round')
    expect(t.inFlight('r2')).toBe(false)
    expect(t.inFlight()).toBe(false)
    expect(snap(t, 'r2')).toBe('apply')
    expect(snap(t, 'r2')).toBe('apply')
    expect(resync).not.toHaveBeenCalled()
  })

  it('an old r1 completion does not decrement the r2 count', () => {
    const t = createFlipResyncTracker(vi.fn(async () => {}))
    snap(t, 'r1')
    const old = t.begin('r1')
    snap(t, 'r2')
    t.begin('r2')
    t.end(old, false)
    expect(t.inFlight('r2')).toBe(true)
    expect(snap(t, 'r2')).toBe('keep-resync')
  })

  it('settling the same token twice does not decrement another flip', () => {
    const t = createFlipResyncTracker(vi.fn(async () => {}))
    snap(t, 'r1')
    const a = t.begin('r1')
    t.begin('r1')
    t.end(a, false)
    t.end(a, false)
    expect(t.inFlight('r1')).toBe(true)
  })

  it('a failed r2 flip resyncs even while an r1 flip is still unanswered', () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    t.begin('r1')
    snap(t, 'r2')
    const f = t.begin('r2')
    t.end(f, true)
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('a failed r2 flip still waits for another unanswered r2 flip', () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    snap(t, 'r2')
    const a = t.begin('r2')
    const b = t.begin('r2')
    t.end(a, true)
    expect(resync).not.toHaveBeenCalled()
    t.end(b, false)
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('an r1 flip failing after the round changed does not trigger a reload', () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    const old = t.begin('r1')
    snap(t, 'r2')
    t.end(old, true)
    expect(resync).not.toHaveBeenCalled()
  })

  it('a late r1 success does not consume the r2 deferred read', async () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    const old = t.begin('r1')
    snap(t, 'r2')
    snap(t, 'r2', true) // selecting: deferred until the selection ends
    t.end(old, false)
    expect(resync).not.toHaveBeenCalled()
    t.flushDeferred()
    await Promise.resolve()
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('an r1 failure recorded before the round changed is dropped by the new round', () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    const a = t.begin('r1')
    const b = t.begin('r1')
    t.end(a, true) // r1 still has b pending, so the reload waits
    snap(t, 'r2')
    t.end(b, false)
    expect(resync).not.toHaveBeenCalled()
    // The leftover r1 failure must not surface as a reload when an r2 flip is accepted later.
    const f = t.begin('r2')
    t.end(f, false)
    expect(resync).not.toHaveBeenCalled()
  })

  it('an r1 flip that begins during an r2 read makes that read be repeated, not stall', async () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    snap(t, 'r2')
    const epochAtStart = t.epoch()
    t.begin('r1')
    expect(t.evaluateSnapshot({ roundId: 'r2', epochAtStart, selecting: false })).toBe('keep-resync')
    await Promise.resolve()
    expect(resync).toHaveBeenCalledTimes(1) // r2 has nothing pending, so the repeat read is not blocked by r1
  })

  it('a flip with no round given belongs to the round the view is on', () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    const f = t.begin()
    expect(t.inFlight('r1')).toBe(true)
    t.end(f, true)
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('enterRound scopes the gate for views that decide apply/skip themselves', () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    t.enterRound('r1')
    t.begin('r1')
    t.enterRound('r2')
    const f = t.begin('r2')
    t.end(f, true)
    expect(resync).toHaveBeenCalledTimes(1)
  })
})
