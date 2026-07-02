// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const cap = vi.hoisted(() => ({
  ons: [] as Array<{
    event: string
    config: { table: string; filter: string; event: string }
    cb: (payload?: unknown) => void
  }>,
  subscribed: false,
  removed: false,
  channelName: '',
}))

vi.mock('@/lib/supabase', () => {
  const channel = {
    on(event: string, config: { table: string; filter: string; event: string }, cb: (payload?: unknown) => void) {
      cap.ons.push({ event, config, cb })
      return channel
    },
    subscribe() {
      cap.subscribed = true
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
    },
  }
})

import { useGameTableSync } from './useGameTableSync'

beforeEach(() => {
  cap.ons = []
  cap.subscribed = false
  cap.removed = false
  cap.channelName = ''
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
