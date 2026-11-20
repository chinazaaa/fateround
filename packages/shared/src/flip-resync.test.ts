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
