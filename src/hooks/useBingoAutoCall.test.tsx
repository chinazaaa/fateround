// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { BingoCalledNumber, Game } from '@/types'
import { useBingoAutoCall } from './useBingoAutoCall'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const game = (id: string) =>
  ({ id, status: 'active', bingo_call_mode: 'auto', bingo_call_interval_seconds: 5 }) as unknown as Game

const row = (gameId: string) =>
  ({
    id: `${gameId}-row`,
    game_id: gameId,
    number: 7,
    called_at: new Date().toISOString(),
  }) as unknown as BingoCalledNumber

describe('useBingoAutoCall', () => {
  it('drops a sync response that resolves after the game code changed', async () => {
    let resolveFirst: (res: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )

    const onCalledA = vi.fn()
    const onCalledB = vi.fn()

    // Overdue by well past the host grace, so the standby driver pokes immediately.
    const lastCalledAt = new Date(Date.now() - 60_000).toISOString()

    const { rerender } = renderHook(
      ({ code, onCalled }: { code: string; onCalled: (r: BingoCalledNumber) => void }) =>
        useBingoAutoCall({ gameCode: code, game: game(code), role: 'host', lastCalledAt, onCalled }),
      { initialProps: { code: 'AAAA', onCalled: onCalledA } }
    )

    await vi.advanceTimersByTimeAsync(10) // flush the immediate tick
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ body: JSON.stringify({ gameId: 'AAAA' }) })

    // Switch games while that request is still in flight.
    rerender({ code: 'BBBB', onCalled: onCalledB })

    resolveFirst({
      ok: true,
      json: async () => ({ code: 'called', row: row('AAAA') }),
    })
    await vi.advanceTimersByTimeAsync(10)

    expect(onCalledA).not.toHaveBeenCalled()
    expect(onCalledB).not.toHaveBeenCalled()
  })

  it('applies a called row when the game code is unchanged', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'called', row: row('AAAA') }),
    })

    const onCalled = vi.fn()
    renderHook(() =>
      useBingoAutoCall({
        gameCode: 'AAAA',
        game: game('AAAA'),
        role: 'host',
        lastCalledAt: new Date(Date.now() - 60_000).toISOString(),
        onCalled,
      })
    )

    await vi.advanceTimersByTimeAsync(10)
    expect(onCalled).toHaveBeenCalledTimes(1)
    expect(onCalled.mock.calls[0][0]).toMatchObject({ game_id: 'AAAA', number: 7 })
  })
})
