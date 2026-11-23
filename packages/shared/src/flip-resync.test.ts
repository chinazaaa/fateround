import { describe, expect, it, vi } from 'vitest'
import { createFlipResyncTracker, snapshotReadsOk } from './flip-resync'

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
    t.evaluateSnapshot({ roundId, ticket: t.startRead(), selecting })

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
    t.evaluateSnapshot({ roundId, ticket: t.startRead(), selecting })

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

  it('an r1 flip that begins during an r2 read does not invalidate the r2 read', async () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    snap(t, 'r1')
    snap(t, 'r2')
    const ticket = t.startRead()
    t.begin('r1')
    // A flip of another round cannot be missing from r2's snapshot, so it neither blocks nor repeats the read.
    expect(t.evaluateSnapshot({ roundId: 'r2', ticket, selecting: false })).toBe('apply')
    await Promise.resolve()
    expect(resync).not.toHaveBeenCalled()
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

describe('createFlipResyncTracker read tickets', () => {
  const ev = (
    t: ReturnType<typeof createFlipResyncTracker>,
    ticket: ReturnType<typeof t.startRead>,
    roundId: string,
    selecting = false
  ) => t.evaluateSnapshot({ roundId, ticket, selecting })

  it('rejects a read that started while a flip was pending and returns after it settled (success)', async () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    ev(t, t.startRead(), 'r1')
    const f = t.begin('r1')
    const ticket = t.startRead() // read starts while the flip is pending...
    t.end(f, false) // ...the flip settles before the read returns
    expect(t.inFlight('r1')).toBe(false)
    expect(ev(t, ticket, 'r1')).toBe('keep-resync')
    await Promise.resolve()
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('rejects the same read when the flip settles with a failure', async () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    ev(t, t.startRead(), 'r1')
    const f = t.begin('r1')
    const ticket = t.startRead()
    t.end(f, true)
    expect(ev(t, ticket, 'r1')).toBe('keep-resync')
  })

  it('applies a read that started after the flip settled', () => {
    const t = createFlipResyncTracker(vi.fn(async () => {}))
    ev(t, t.startRead(), 'r1')
    const f = t.begin('r1')
    t.end(f, false)
    expect(ev(t, t.startRead(), 'r1')).toBe('apply')
  })

  it('readMayBeStale mirrors the same rule for views that decide themselves', () => {
    const t = createFlipResyncTracker(vi.fn(async () => {}))
    t.enterRound('r1')
    const f = t.begin('r1')
    const ticket = t.startRead()
    t.end(f, false)
    expect(t.readMayBeStale(ticket, 'r1')).toBe(true)
    expect(t.readMayBeStale(t.startRead(), 'r1')).toBe(false)
  })

  it('an old-round settlement does not invalidate a current-round read', () => {
    const t = createFlipResyncTracker(vi.fn(async () => {}))
    ev(t, t.startRead(), 'r1')
    const old = t.begin('r1')
    ev(t, t.startRead(), 'r2')
    t.end(t.begin('r2'), false) // r2 has its own (settled) flip history
    const ticket = t.startRead()
    t.end(old, false)
    expect(ev(t, ticket, 'r2')).toBe('apply')
  })

  it('discards an older read that resolves after a newer read was applied', () => {
    const t = createFlipResyncTracker(vi.fn(async () => {}))
    ev(t, t.startRead(), 'r1')
    const slowOld = t.startRead() // read of r1, slow
    const newer = t.startRead() // read of r2
    expect(ev(t, newer, 'r2')).toBe('new-round')
    expect(t.superseded(slowOld)).toBe(true)
    expect(ev(t, slowOld, 'r1')).toBe('discard')
    expect(t.boardRound()).toBe('r2')
    // and it does not make the next r2 read look like a new round
    expect(ev(t, t.startRead(), 'r2')).toBe('apply')
  })

  it('an older read that resolves first is still applied, and the newer one then applies on top', () => {
    const t = createFlipResyncTracker(vi.fn(async () => {}))
    const a = t.startRead()
    const b = t.startRead()
    expect(ev(t, a, 'r1')).toBe('apply')
    expect(ev(t, b, 'r1')).toBe('apply')
  })

  it('discards an older read of the same round once a newer one was applied', () => {
    const t = createFlipResyncTracker(vi.fn(async () => {}))
    ev(t, t.startRead(), 'r1')
    const a = t.startRead()
    const b = t.startRead()
    expect(ev(t, b, 'r1')).toBe('apply')
    expect(ev(t, a, 'r1')).toBe('discard')
  })

  it('commitRead supersedes older reads for views that decide themselves', () => {
    const t = createFlipResyncTracker(vi.fn(async () => {}))
    const a = t.startRead()
    const b = t.startRead()
    t.commitRead(b)
    expect(t.superseded(a)).toBe(true)
    expect(t.superseded(b)).toBe(false)
  })
})

describe('snapshotReadsOk', () => {
  it('rejects a snapshot whose submissions read failed (data null must not become empty history)', () => {
    expect(snapshotReadsOk({ data: [], error: null }, { data: null, error: null })).toBe(true)
    expect(snapshotReadsOk({ data: null, error: new Error('boom') }, { data: [], error: null })).toBe(false)
  })

  it('rejects a snapshot whose progress read failed', () => {
    expect(snapshotReadsOk({ data: [], error: null }, { data: null, error: { message: 'x' } })).toBe(false)
  })

  it('accepts successful empty results as real empty history', () => {
    expect(snapshotReadsOk({ data: [], error: null }, { data: [], error: null })).toBe(true)
  })

  it('a failed read leaves the tracker uncommitted so a later read still applies and an older one is not superseded', () => {
    const t = createFlipResyncTracker(async () => {})
    const failedRead = t.startRead()
    const failedOk = snapshotReadsOk({ data: null, error: new Error('x') }, { data: [], error: null })
    if (failedOk) t.commitRead(failedRead)
    expect(failedOk).toBe(false)
    expect(t.superseded(t.startRead())).toBe(false)
    expect(t.superseded(failedRead)).toBe(false)
    const retry = t.startRead()
    expect(t.evaluateSnapshot({ roundId: 'r1', ticket: retry, selecting: false })).toBe('apply')
  })
})

describe('createFlipResyncTracker failed resync retry', () => {
  it('retries a resync that resolves false after a backoff, then stops once it succeeds', async () => {
    vi.useFakeTimers()
    try {
      const resync = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      const t = createFlipResyncTracker(resync)
      await flip(t, Promise.reject(new Error('refused')))
      expect(resync).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(999)
      expect(resync).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(resync).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(resync).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats a rejected resync as failed and keeps the retry bounded', async () => {
    vi.useFakeTimers()
    try {
      const resync = vi.fn(async () => {
        throw new Error('down')
      })
      const t = createFlipResyncTracker(resync, [10, 20])
      await flip(t, Promise.reject(new Error('refused')))
      await vi.advanceTimersByTimeAsync(10_000)
      expect(resync).toHaveBeenCalledTimes(3) // first run + the two bounded retries
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancel() drops the pending retry', async () => {
    vi.useFakeTimers()
    try {
      const resync = vi.fn(async () => false)
      const t = createFlipResyncTracker(resync, [10])
      await flip(t, Promise.reject(new Error('refused')))
      t.cancel()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(resync).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a new round drops the retry owed for the previous one', async () => {
    vi.useFakeTimers()
    try {
      const resync = vi.fn(async () => false)
      const t = createFlipResyncTracker(resync, [10])
      t.evaluateSnapshot({ roundId: 'a', ticket: t.startRead(), selecting: false })
      await flip(t, Promise.reject(new Error('refused')))
      expect(t.evaluateSnapshot({ roundId: 'b', ticket: t.startRead(), selecting: false })).toBe('new-round')
      await vi.advanceTimersByTimeAsync(10_000)
      expect(resync).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('enterRound to another round drops the failed/backoff debt of the previous round', async () => {
    vi.useFakeTimers()
    try {
      const resync = vi.fn(async () => false)
      const t = createFlipResyncTracker(resync, [10])
      t.enterRound('a')
      await flip(t, Promise.reject(new Error('refused')))
      expect(resync).toHaveBeenCalledTimes(1) // A's retry timer is now armed
      t.enterRound('b')
      await vi.advanceTimersByTimeAsync(10_000)
      expect(resync).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('enterRound for the round already shown keeps the retry owed', async () => {
    vi.useFakeTimers()
    try {
      const resync = vi.fn(async () => false)
      const t = createFlipResyncTracker(resync, [10])
      t.enterRound('a')
      await flip(t, Promise.reject(new Error('refused')))
      t.enterRound('a')
      await vi.advanceTimersByTimeAsync(10)
      expect(resync).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clearBoardRound to another round drops the previous round retry debt', async () => {
    vi.useFakeTimers()
    try {
      const resync = vi.fn(async () => false)
      const t = createFlipResyncTracker(resync, [10])
      t.evaluateSnapshot({ roundId: 'a', ticket: t.startRead(), selecting: false })
      await flip(t, Promise.reject(new Error('refused')))
      t.clearBoardRound('b')
      await vi.advanceTimersByTimeAsync(10_000)
      expect(resync).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a flip that settles after cancel() starts no resync and arms no timer', async () => {
    vi.useFakeTimers()
    try {
      const resync = vi.fn(async () => false)
      const t = createFlipResyncTracker(resync, [10])
      const token = t.begin()
      t.cancel()
      t.end(token, true)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(resync).not.toHaveBeenCalled()
      expect(t.inFlight()).toBe(false)
      // Reusable afterwards (strict-mode remount): a flip begun after cancel() behaves normally.
      await flip(t, Promise.reject(new Error('refused')))
      expect(resync).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancel() drops a deferred read so flushDeferred cannot start a load after unmount', () => {
    const resync = vi.fn(async () => {})
    const t = createFlipResyncTracker(resync)
    t.markDirty()
    t.cancel()
    t.flushDeferred()
    expect(resync).not.toHaveBeenCalled()
  })

  it('retiring a board fences older reads: a stalled read of the old round cannot apply later', () => {
    const t = createFlipResyncTracker(async () => {})
    // Round A's board is applied first, so the later stalled read is not already superseded by it.
    t.evaluateSnapshot({ roundId: 'a', ticket: t.startRead(), selecting: false })
    const stalled = t.startRead()
    const retiring = t.startRead()
    t.clearBoardRound('b', retiring)
    expect(t.evaluateSnapshot({ roundId: 'a', ticket: stalled, selecting: false })).toBe('discard')
    // The read that retired the board is itself still valid.
    expect(t.superseded(retiring)).toBe(false)
  })

  it('clearBoardRound without a ticket fences every read started before it', () => {
    const t = createFlipResyncTracker(async () => {})
    t.evaluateSnapshot({ roundId: 'a', ticket: t.startRead(), selecting: false })
    const stalled = t.startRead()
    t.clearBoardRound('b')
    expect(t.superseded(stalled)).toBe(true)
    expect(t.superseded(t.startRead())).toBe(false)
  })
})
