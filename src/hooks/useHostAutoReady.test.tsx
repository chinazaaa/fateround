import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'

const markPlayerReady = vi.fn(async () => {})
vi.mock('@/lib/player-ready', () => ({ markPlayerReady: (...a: unknown[]) => markPlayerReady(...a) }))
vi.mock('@/lib/utils', async (orig) => ({
  ...(await orig<typeof import('@/lib/utils')>()),
  getPlayerSession: () => ({ resumeToken: 'RT' }),
}))

const CODE = 'ABCD'
const hostSpectator = [{ id: 'h1', spectator: true }]

afterEach(() => {
  markPlayerReady.mockClear()
  localStorage.clear()
})

describe('useHostAutoReady', () => {
  it('re-readies a spectator host when they mean to play (Host + play)', async () => {
    localStorage.setItem('host_mode_ABCD', 'player')
    renderHook(() => useHostAutoReady(CODE, 'waiting', 'h1', hostSpectator))
    await waitFor(() => expect(markPlayerReady).toHaveBeenCalledWith('ABCD', 'RT'))
  })

  it('leaves the host watching when they chose Host only (spectator)', async () => {
    localStorage.setItem('host_mode_ABCD', 'spectator')
    renderHook(() => useHostAutoReady(CODE, 'waiting', 'h1', hostSpectator))
    // Give the effect a tick; it must NOT drag the host back into a seat.
    await new Promise((r) => setTimeout(r, 20))
    expect(markPlayerReady).not.toHaveBeenCalled()
  })

  it('does nothing when the host already holds a seat', async () => {
    localStorage.setItem('host_mode_ABCD', 'player')
    renderHook(() => useHostAutoReady(CODE, 'waiting', 'h1', [{ id: 'h1', spectator: false }]))
    await new Promise((r) => setTimeout(r, 20))
    expect(markPlayerReady).not.toHaveBeenCalled()
  })
})
