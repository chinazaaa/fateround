import { afterEach, describe, expect, it, vi } from 'vitest'
import { elapsedSinceStart } from './daily-progress'

describe('elapsedSinceStart', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const at = (iso: string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
  }

  it('measures from the persisted start rather than from the timer state', () => {
    at('2026-01-01T00:02:30Z')
    expect(elapsedSinceStart(new Date('2026-01-01T00:00:00Z').getTime(), 600)).toBe(150)
  })

  // The bug this helper exists for: a reload that restores a finished board auto-submits in the
  // same commit as the timer's first tick, so the hook's `elapsed` state is still 0. Reading the
  // persisted start instead reports the real time rather than a perfect zero.
  it('reports the real time on the first commit after a reload, not zero', () => {
    at('2026-01-01T00:04:10Z')
    expect(elapsedSinceStart(new Date('2026-01-01T00:00:00Z').getTime(), 600)).toBe(250)
  })

  it('clamps to the challenge limit', () => {
    at('2026-01-01T01:00:00Z')
    expect(elapsedSinceStart(new Date('2026-01-01T00:00:00Z').getTime(), 600)).toBe(600)
  })

  it('never returns a negative time when the clock moves backwards', () => {
    at('2026-01-01T00:00:00Z')
    expect(elapsedSinceStart(new Date('2026-01-01T00:05:00Z').getTime(), 600)).toBe(0)
  })

  // Components that hold a finished board on screen before submitting pass the moment they
  // finished, so the reveal hold isn't billed as play time.
  it('measures to endAtMs when one is given, ignoring the current clock', () => {
    at('2026-01-01T00:02:33Z')
    const start = new Date('2026-01-01T00:00:00Z').getTime()
    const finishedAt = new Date('2026-01-01T00:02:30Z').getTime()
    expect(elapsedSinceStart(start, 600, finishedAt)).toBe(150)
  })

  it('still clamps and floors an explicit endAtMs', () => {
    at('2026-01-01T02:00:00Z')
    const start = new Date('2026-01-01T00:00:00Z').getTime()
    expect(elapsedSinceStart(start, 600, new Date('2026-01-01T01:00:00Z').getTime())).toBe(600)
    expect(elapsedSinceStart(start, 600, start - 5000)).toBe(0)
  })

  it('floors partial seconds', () => {
    at('2026-01-01T00:00:09.900Z')
    expect(elapsedSinceStart(new Date('2026-01-01T00:00:00Z').getTime(), 600)).toBe(9)
  })
})
