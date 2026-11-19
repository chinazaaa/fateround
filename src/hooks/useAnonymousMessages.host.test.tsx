// @vitest-environment jsdom
/**
 * Host inbox (Secret Message) reads: one initial read per enable, the inbox is dropped and in-flight
 * reads are invalidated when the board closes, and a failed read is exposed instead of looking empty.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      throw new Error('host inbox must not read through supabase')
    },
    channel() {
      throw new Error('host inbox is poll-only')
    },
    removeChannel: () => {},
  },
}))

import { useAnonymousMessages } from './useAnonymousMessages'

type Msg = { id: string; game_id: string; text: string; created_at: string; player_name: string }
const msg = (id: string): Msg => ({
  id,
  game_id: 'ABCD',
  text: id,
  created_at: '2026-01-01T00:00:00Z',
  player_name: '',
})

const NO_PLAYERS: { id: string; name: string }[] = []
const hostInbox = { hostToken: 'tok' }
let fetchMock: ReturnType<typeof vi.fn>

const okResponse = (ids: string[]) => ({ ok: true, json: async () => ({ messages: ids.map(msg) }) })
const failResponse = { ok: false, json: async () => ({}) }

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('useAnonymousMessages host inbox', () => {
  it('sends exactly one initial list request when the inbox becomes enabled', async () => {
    fetchMock.mockResolvedValue(okResponse(['a']))
    const { result } = renderHook(() => useAnonymousMessages('ABCD', true, NO_PLAYERS, hostInbox))
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['a']))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clears the inbox when the board closes and ignores a read that was in flight', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(['old']))
    const { result, rerender } = renderHook(
      ({ enabled }) => useAnonymousMessages('ABCD', enabled, NO_PLAYERS, hostInbox),
      {
        initialProps: { enabled: true },
      }
    )
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    // A slow read started while the board is open ...
    let release: (v: unknown) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise((r) => (release = r)))
    let pending: Promise<boolean> = Promise.resolve(false)
    act(() => {
      pending = result.current.reload()
    })

    // ... then the board closes: the cached inbox is dropped.
    rerender({ enabled: false })
    await waitFor(() => expect(result.current.messages).toEqual([]))
    expect(result.current.loading).toBe(true)

    // The old read resolves afterwards and must not repopulate the feed.
    await act(async () => {
      release(okResponse(['old', 'stale']))
      await pending
    })
    expect(result.current.messages).toEqual([])

    // After reopening, only a fresh read fills it.
    fetchMock.mockResolvedValueOnce(okResponse(['fresh']))
    rerender({ enabled: true })
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['fresh']))
  })

  it('does not show previous messages after reopening when the next read fails', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(['old']))
    const { result, rerender } = renderHook(
      ({ enabled }) => useAnonymousMessages('ABCD', enabled, NO_PLAYERS, hostInbox),
      {
        initialProps: { enabled: true },
      }
    )
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    rerender({ enabled: false })
    fetchMock.mockResolvedValue(failResponse)
    rerender({ enabled: true })
    await waitFor(() => expect(result.current.loadError).toBe(true))
    expect(result.current.messages).toEqual([])
    expect(result.current.loading).toBe(true)
  })

  it('reports a failed first read, then recovers and keeps last messages on a later failure', async () => {
    fetchMock.mockResolvedValueOnce(failResponse)
    const { result } = renderHook(() => useAnonymousMessages('ABCD', true, NO_PLAYERS, hostInbox))
    await waitFor(() => expect(result.current.loadError).toBe(true))
    expect(result.current.loading).toBe(true)

    fetchMock.mockResolvedValueOnce(okResponse(['a']))
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.loadError).toBe(false)
    expect(result.current.loading).toBe(false)

    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.loadError).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.messages.map((m) => m.id)).toEqual(['a'])
  })
})
