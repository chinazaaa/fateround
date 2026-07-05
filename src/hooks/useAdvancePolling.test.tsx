// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Game } from '@/types'
import { useAdvancePolling } from './useAdvancePolling'
import { POLL_INTERVALS } from './usePolling'

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

const game = (status: string) => ({ id: 'ABCD', status }) as unknown as Game

function renderAdvance(opts: { status?: string; enabled?: boolean } = {}) {
  const { status = 'active', enabled = true } = opts
  const onAdvanced = vi.fn()
  const view = renderHook(() =>
    useAdvancePolling({ endpoint: '/api/npat/advance', gameCode: 'ABCD', game: game(status), enabled, onAdvanced })
  )
  return { onAdvanced, ...view }
}

describe('useAdvancePolling', () => {
  it('POSTs the endpoint with { gameId } and calls onAdvanced on success while active', async () => {
    const { onAdvanced } = renderAdvance({ status: 'active' })
    await vi.advanceTimersByTimeAsync(10) // flush the immediate tick

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/npat/advance',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ gameId: 'ABCD' }) })
    )
    expect(onAdvanced).toHaveBeenCalledTimes(1)
  })

  it('does not poll when the game is not active', async () => {
    renderAdvance({ status: 'waiting' })
    await vi.advanceTimersByTimeAsync(POLL_INTERVALS.advanceSync * 2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not poll when disabled', async () => {
    renderAdvance({ status: 'active', enabled: false })
    await vi.advanceTimersByTimeAsync(POLL_INTERVALS.advanceSync * 2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps polling on the configured interval', async () => {
    renderAdvance({ status: 'active' })
    await vi.advanceTimersByTimeAsync(10)
    const afterFirst = fetchMock.mock.calls.length
    expect(afterFirst).toBeGreaterThanOrEqual(1)

    await vi.advanceTimersByTimeAsync(POLL_INTERVALS.advanceSync + 50)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst)
  })

  it('does not call onAdvanced when the response is not ok', async () => {
    fetchMock.mockResolvedValue({ ok: false } as Response)
    const { onAdvanced } = renderAdvance({ status: 'active' })
    await vi.advanceTimersByTimeAsync(10)

    expect(fetchMock).toHaveBeenCalled()
    expect(onAdvanced).not.toHaveBeenCalled()
  })
})
