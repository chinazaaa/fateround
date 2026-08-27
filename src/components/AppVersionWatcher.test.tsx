// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { AppVersionWatcher } from './AppVersionWatcher'

const reload = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  reload.mockClear()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Serve a build id; change `current` to simulate the server reporting a different one. */
function serveBuildId(get: () => string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ buildId: get() }) }))
  )
}

/** Past the watcher's min-interval, then a foreground event to trigger a check. */
async function refocus() {
  await vi.advanceTimersByTimeAsync(31_000)
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(0)
}

describe('AppVersionWatcher', () => {
  it('never reloads while the build id is unchanged', async () => {
    serveBuildId(() => 'sha-1')
    render(<AppVersionWatcher />)
    await vi.advanceTimersByTimeAsync(0)
    await refocus()
    await refocus()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(reload).not.toHaveBeenCalled()
  })

  it('never reloads when the server reports no stable build id', async () => {
    // A server with no deploy marker answers null. That is "unknown", not "changed" —
    // treating it as a change is what turned every container restart into a mass reload.
    let id: string | null = 'sha-1'
    serveBuildId(() => id)
    render(<AppVersionWatcher />)
    await vi.advanceTimersByTimeAsync(0)
    id = null
    await refocus()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload on a single changed read (one odd answer cannot nuke a live game)', async () => {
    let id = 'sha-1'
    serveBuildId(() => id)
    render(<AppVersionWatcher />)
    await vi.advanceTimersByTimeAsync(0)

    id = 'sha-2'
    await refocus() // sees the change, arms the confirmation
    id = 'sha-1' // ...and the next read is back to the original
    await vi.advanceTimersByTimeAsync(10_000)
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads once a changed build id is confirmed by a second read', async () => {
    let id = 'sha-1'
    serveBuildId(() => id)
    render(<AppVersionWatcher />)
    await vi.advanceTimersByTimeAsync(0)

    id = 'sha-2'
    await refocus()
    expect(reload).not.toHaveBeenCalled()
    // Confirmation read (5s) + the settle delay before the reload (100ms).
    await vi.advanceTimersByTimeAsync(6_000)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
