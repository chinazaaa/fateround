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

  it('floors partial seconds', () => {
    at('2026-01-01T00:00:09.900Z')
    expect(elapsedSinceStart(new Date('2026-01-01T00:00:00Z').getTime(), 600)).toBe(9)
  })
})
