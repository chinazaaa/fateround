// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWordGroupingCompletionNudge } from './useWordGroupingCompletionNudge'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ json: async () => ({ success: true, finished: false }) } as Response)
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useWordGroupingCompletionNudge', () => {
  it('asks the server to settle after a few seconds, then keeps asking until the game finishes', async () => {
    const onFinished = vi.fn()
    renderHook(() => useWordGroupingCompletionNudge('ABCD', true, onFinished))
    await vi.advanceTimersByTimeAsync(3900)
    expect(fetchMock).not.toHaveBeenCalled() // the normal in-request finish gets a head start

    await vi.advanceTimersByTimeAsync(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/word-grouping/complete',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ gameId: 'ABCD' }) })
    )

    await vi.advanceTimersByTimeAsync(6000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onFinished).not.toHaveBeenCalled()

    fetchMock.mockResolvedValue({ json: async () => ({ success: true, finished: true }) } as Response)
    await vi.advanceTimersByTimeAsync(6000)
    expect(onFinished).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(3) // stopped once finished
  })

  it('keeps trying after a failed request', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    renderHook(() => useWordGroupingCompletionNudge('ABCD', true))
    await vi.advanceTimersByTimeAsync(4100)
    await vi.advanceTimersByTimeAsync(6000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends nothing when disabled (puzzle not done, or the game already moved on)', async () => {
    renderHook(() => useWordGroupingCompletionNudge('ABCD', false))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends nothing if the screen moves on before the first ask, and stops when disabled later', async () => {
    const { rerender } = renderHook(({ on }) => useWordGroupingCompletionNudge('ABCD', on), {
      initialProps: { on: true },
    })
    await vi.advanceTimersByTimeAsync(1000)
    rerender({ on: false })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).not.toHaveBeenCalled()

    rerender({ on: true })
    await vi.advanceTimersByTimeAsync(4100)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    rerender({ on: false })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
