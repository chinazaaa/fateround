// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { WordRushSession } from '@/types'
import { useWordRushTimer } from './useWordRushTimer'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true } as Response)
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const marker = {
  turn_index: 0,
  round: 1,
  setter_id: 's',
  is_last: true,
  turn_deadline_at: null,
  turn_seconds: 60,
  awarded: false,
}

/** The state after the LAST round closed: finished session, effects still owed. */
const finishedWithMarker = {
  status: 'finished',
  phase: 'finished',
  turn_deadline_at: null,
  intermission_deadline_at: null,
  round_finalize: marker,
} as unknown as WordRushSession

const finalizeCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/word-rush/finalize')

describe('useWordRushTimer — resuming round finalization', () => {
  it('asks the server to finalize when a finished session still carries the marker', async () => {
    renderHook(() => useWordRushTimer('ABCD', finishedWithMarker, true))
    await vi.advanceTimersByTimeAsync(2900)
    expect(finalizeCalls()).toHaveLength(0) // the in-request finalization normally clears it first

    await vi.advanceTimersByTimeAsync(200)
    expect(finalizeCalls()).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/word-rush/finalize',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ gameId: 'ABCD' }) })
    )

    await vi.advanceTimersByTimeAsync(5000)
    expect(finalizeCalls()).toHaveLength(2) // keeps asking until the marker clears
  })

  it('stops asking once the marker clears', async () => {
    const { rerender } = renderHook(({ s }) => useWordRushTimer('ABCD', s, true), {
      initialProps: { s: finishedWithMarker },
    })
    await vi.advanceTimersByTimeAsync(3100)
    expect(finalizeCalls()).toHaveLength(1)

    rerender({ s: { ...finishedWithMarker, round_finalize: null } as unknown as WordRushSession })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(finalizeCalls()).toHaveLength(1)
  })

  it('sends nothing when the marker is gone before the first ask', async () => {
    const { rerender } = renderHook(({ s }) => useWordRushTimer('ABCD', s, true), {
      initialProps: { s: finishedWithMarker },
    })
    await vi.advanceTimersByTimeAsync(1000)
    rerender({ s: { ...finishedWithMarker, round_finalize: null } as unknown as WordRushSession })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not ask for a finished session without a marker, or from a client that does not drive', async () => {
    const clean = { ...finishedWithMarker, round_finalize: null } as unknown as WordRushSession
    renderHook(() => useWordRushTimer('ABCD', clean, true))
    renderHook(() => useWordRushTimer('ABCD', finishedWithMarker, false))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
