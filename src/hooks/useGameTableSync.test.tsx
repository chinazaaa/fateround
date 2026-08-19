// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const cap = vi.hoisted(() => ({
  ons: [] as Array<{
    event: string
    config: { table: string; filter: string; event: string }
    cb: (payload?: unknown) => void
  }>,
  subscribed: false,
  removed: false,
  channelName: '',
  statusCb: undefined as ((status: string) => void) | undefined,
  socketConnected: true,
}))

vi.mock('@/lib/supabase', () => {
  const channel = {
    on(event: string, config: { table: string; filter: string; event: string }, cb: (payload?: unknown) => void) {
      cap.ons.push({ event, config, cb })
      return channel
    },
    subscribe(cb?: (status: string) => void) {
      cap.subscribed = true
      cap.statusCb = cb
      return channel
    },
  }
  return {
    supabase: {
      channel(name: string) {
        cap.channelName = name
        return channel
      },
      removeChannel() {
        cap.removed = true
      },
      realtime: {
        isConnected: () => cap.socketConnected,
      },
    },
  }
})

import { useGameTableSync } from './useGameTableSync'

beforeEach(() => {
  cap.ons = []
  cap.subscribed = false
  cap.removed = false
  cap.channelName = ''
  cap.statusCb = undefined
  cap.socketConnected = true
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('useGameTableSync', () => {
  it('subscribes to each table with the right filter column', () => {
    renderHook(() =>
      useGameTableSync(
        'ABCD',
        [{ table: 'games', column: 'id' }, 'scrabble_sessions', 'scrabble_player_state'],
        () => {}
      )
    )
    expect(cap.subscribed).toBe(true)
    expect(cap.channelName).toBe('sync-ABCD')
    expect(cap.ons.map((o) => o.config.table)).toEqual(['games', 'scrabble_sessions', 'scrabble_player_state'])
    // bare strings → game_id; the object form lets `games` filter by its `id` PK
    expect(cap.ons.map((o) => o.config.filter)).toEqual(['id=eq.ABCD', 'game_id=eq.ABCD', 'game_id=eq.ABCD'])
    expect(cap.ons.every((o) => o.event === 'postgres_changes' && o.config.event === '*')).toBe(true)
  })

  it('reloads once (debounced) when a burst of changes fires', async () => {
    const reload = vi.fn()
    renderHook(() => useGameTableSync('ABCD', ['scrabble_sessions'], reload))
    cap.ons[0].cb()
    cap.ons[0].cb()
    expect(reload).not.toHaveBeenCalled() // debounced
    await vi.advanceTimersByTimeAsync(150) // fire timer + flush the reload microtask
    expect(reload).toHaveBeenCalledTimes(1) // coalesced
  })

  it('applies pushed rows synchronously for tables that opt in, then still reloads', async () => {
    const reload = vi.fn()
    const apply = vi.fn()
    renderHook(() => useGameTableSync('ABCD', [{ table: 'chess_sessions', apply }], reload))

    const row = { id: 's1', fen: 'position' }
    cap.ons[0].cb({ eventType: 'UPDATE', new: row })
    expect(apply).toHaveBeenCalledExactlyOnceWith(row) // immediate, no debounce
    expect(reload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    expect(reload).toHaveBeenCalledTimes(1) // reconciliation still runs
  })

  it('skips the reconciliation reload when apply returns true (the W1 delta fast-path)', async () => {
    const reload = vi.fn()
    const apply = vi.fn(() => true) // "row fully absorbed — no refetch needed"
    renderHook(() => useGameTableSync('ABCD', [{ table: 'tic_tac_toe_sessions', apply }], reload))

    const row = { id: 's1', updated_at: '2026-01-01T00:00:01Z', status: 'active' }
    cap.ons[0].cb({ eventType: 'UPDATE', new: row })
    expect(apply).toHaveBeenCalledExactlyOnceWith(row)
    await vi.advanceTimersByTimeAsync(150)
    expect(reload).not.toHaveBeenCalled() // the whole point: no full multi-table refetch
  })

  it('still reloads when apply returns false (a status change that must reconcile)', async () => {
    const reload = vi.fn()
    // Mimics a view that skips ordinary moves but reloads on the finishing row.
    const apply = vi.fn((row: Record<string, unknown>) => row.status === 'active')
    renderHook(() => useGameTableSync('ABCD', [{ table: 'tic_tac_toe_sessions', apply }], reload))

    cap.ons[0].cb({ eventType: 'UPDATE', new: { id: 's1', status: 'active' } }) // move → skip
    cap.ons[0].cb({ eventType: 'UPDATE', new: { id: 's1', status: 'finished' } }) // finish → reload
    await vi.advanceTimersByTimeAsync(150)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('skips apply for DELETEs and payloads without a row, but always reloads', async () => {
    const reload = vi.fn()
    const apply = vi.fn()
    renderHook(() => useGameTableSync('ABCD', [{ table: 'chess_sessions', apply }], reload))

    cap.ons[0].cb({ eventType: 'DELETE', new: {} })
    cap.ons[0].cb() // payload-less callers (and unknown shapes) must stay safe
    expect(apply).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('survives a throwing apply — the reload still fires', async () => {
    const reload = vi.fn()
    const apply = vi.fn(() => {
      throw new Error('bad row')
    })
    renderHook(() => useGameTableSync('ABCD', [{ table: 'chess_sessions', apply }], reload))

    cap.ons[0].cb({ eventType: 'UPDATE', new: { id: 's1' } })
    expect(apply).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(150)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('returns connected only while SUBSCRIBED and the socket is live (gates the safety-net poll)', () => {
    const { result } = renderHook(() => useGameTableSync('ABCD', ['scrabble_sessions'], () => {}))
    expect(result.current).toBe(false) // not connected until the channel confirms
    act(() => cap.statusCb?.('SUBSCRIBED'))
    expect(result.current).toBe(true)
    act(() => cap.statusCb?.('CHANNEL_ERROR')) // socket dropped → poll should resume
    expect(result.current).toBe(false)
  })

  it('flips connected false on a SILENT socket drop the status callback never reports', () => {
    const { result } = renderHook(() => useGameTableSync('ABCD', ['scrabble_sessions'], () => {}))
    act(() => cap.statusCb?.('SUBSCRIBED'))
    expect(result.current).toBe(true)
    // Socket dies without emitting CLOSED/CHANNEL_ERROR — the callback stays silent.
    cap.socketConnected = false
    expect(result.current).toBe(true) // still stale between heartbeats
    act(() => vi.advanceTimersByTime(3000)) // heartbeat re-reads live socket state
    expect(result.current).toBe(false) // caught → fallback poll re-enables
    // Recovery: realtime auto-reconnects and re-fires SUBSCRIBED.
    cap.socketConnected = true
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current).toBe(true)
  })

  it('does not subscribe when disabled or missing gameCode', () => {
    renderHook(() => useGameTableSync('ABCD', ['t'], () => {}, { enabled: false }))
    expect(cap.subscribed).toBe(false)
    renderHook(() => useGameTableSync('', ['t'], () => {}))
    expect(cap.subscribed).toBe(false)
  })

  it('removes the channel on unmount', () => {
    const { unmount } = renderHook(() => useGameTableSync('ABCD', ['t'], () => {}))
    unmount()
    expect(cap.removed).toBe(true)
  })
})
