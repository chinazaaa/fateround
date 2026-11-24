import { describe, expect, it } from 'vitest'
import { createFinishedLatch } from './finished-latch'

describe('createFinishedLatch', () => {
  it('lets everything through until a finished read latches the session', () => {
    const l = createFinishedLatch()
    expect(l.observe('active', 's1')).toBe('ok')
    expect(l.observe('finished', 's1')).toBe('ok')
  })

  it('drops a stale active read of the finished session; a different session passes', () => {
    const l = createFinishedLatch()
    l.observe('finished', 's1')
    expect(l.observe('active', 's1')).toBe('stale-active')
    expect(l.observe('active', 's2')).toBe('ok')
  })

  it('a replay through waiting clears the latch and the unpublished flag', () => {
    const l = createFinishedLatch()
    l.observe('finished', 's1')
    l.observe('waiting', null)
    expect(l.unpublished()).toBe(false)
    expect(l.observe('active', 's1')).toBe('ok')
  })

  it('keeps the finished session retryable until the finished screen is selected', () => {
    const l = createFinishedLatch()
    l.observe('finished', 's1') // a load saw it, then stalled before selecting the screen
    expect(l.observe('active', 's1')).toBe('stale-active')
    expect(l.staleResult()).toBe(false) // reports failure so the caller reads again
    l.published() // a run selected the finished screen
    expect(l.staleResult()).toBe(true)
  })

  it('a null session id latches too', () => {
    const l = createFinishedLatch()
    l.observe('finished', null)
    expect(l.observe('active', undefined)).toBe('stale-active')
  })

  it('reset (room change) forgets the previous room', () => {
    const l = createFinishedLatch()
    l.observe('finished', 's1')
    l.reset()
    expect(l.observe('active', 's1')).toBe('ok')
    expect(l.unpublished()).toBe(false)
  })
})
