// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PingPongPlayerView } from './PingPongPlayerView'
import { PingPongHostView } from './PingPongHostView'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}))

vi.mock('@/hooks/useTurnNotifications', () => ({
  useTurnNotifications: vi.fn(),
}))

vi.mock('@/hooks/useLobbyOpenNotification', () => ({
  useLobbyOpenNotification: vi.fn(),
}))

vi.mock('@/hooks/useRoomMemberJoin', () => ({
  useRoomMemberJoin: () => ({ displayName: null, joinExtras: null, resolving: false }),
  useRoomMemberAutoJoin: vi.fn(),
  useRoomMemberNamePrefill: vi.fn(),
}))

const mockFrom = vi.fn()

const mockChannel: any = {
  on: vi.fn().mockImplementation(() => mockChannel),
  subscribe: vi.fn().mockImplementation(() => ({ unsubscribe: vi.fn() })),
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    channel: () => mockChannel,
    removeChannel: () => {},
  },
}))

describe('PingPongViews lifecycle unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'ping_pong_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  game_id: 'G1',
                  status: 'lobby',
                  game_type: 'ping_pong',
                  p1_score: 0,
                  p2_score: 0,
                  points_to_win: 11,
                  current_server: 1,
                  created_at: '2026-07-17T12:00:00.000Z',
                  updated_at: '2026-07-17T12:00:00.000Z',
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'games') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'G1',
                  code: 'PONG1',
                  game_type: 'ping_pong',
                  status: 'lobby',
                  host_token: 'T1',
                  settings: { ping_pong_points_to_win: 11 },
                  created_at: '2026-07-17T12:00:00.000Z',
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'players') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                data: [],
                error: null,
              }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
    })
  })

  it('renders PingPongPlayerView loading and transitions to join screen in lobby status', async () => {
    render(<PingPongPlayerView gameCode="PONG1" />)
    await waitFor(() => {
      expect(screen.getByText(/Join Game/i)).toBeTruthy()
    })
  })

  it('renders PingPongHostView lobby screen correctly when game is in lobby status', async () => {
    render(<PingPongHostView gameCode="PONG1" hostToken="T1" />)
    await waitFor(() => {
      expect(screen.getByText(/Host panel/i)).toBeTruthy()
    })
  })
})
