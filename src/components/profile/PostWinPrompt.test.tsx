// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const h = vi.hoisted(() => ({ profile: null as { is_anonymous: boolean } | null }))

vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: h.profile, loading: false, refresh: vi.fn() }) }))
vi.mock('@/components/profile/SaveToProfileModal', () => ({ SaveToProfileModal: () => null }))

import { PostWinPrompt } from './PostWinPrompt'
import { emitTrophiesEarned } from '@/lib/trophies/earned-events'

const trophy = { id: 'first_win', title: 'First win', tier: 'bronze', points: 25 }

beforeEach(() => {
  h.profile = { is_anonymous: true }
})

describe('PostWinPrompt', () => {
  it('shows nothing until something is earned', () => {
    // The rule that matters most: this must never appear at lobby join or mid-game. It is
    // driven purely by an award event, so there is no path that can fire it early.
    render(<PostWinPrompt />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('celebrates and asks a guest to save', () => {
    render(<PostWinPrompt />)
    act(() => emitTrophiesEarned([trophy]))

    expect(screen.getByText(/First win/)).toBeTruthy()
    // Names the specific loss rather than saying "sign up" — the loss is the reason.
    expect(screen.getByText(/not lost/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save to profile' })).toBeTruthy()
  })

  it('congratulates a signed-in player without asking for anything', () => {
    // Showing a save prompt to someone whose progress is already saved is noise, and noise is
    // what teaches people to dismiss the prompt that does matter.
    h.profile = { is_anonymous: false }
    render(<PostWinPrompt />)
    act(() => emitTrophiesEarned([trophy]))

    expect(screen.getByText(/Added to your profile/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save to profile' })).toBeNull()
  })

  it('summarises when several land at once', () => {
    render(<PostWinPrompt />)
    act(() => emitTrophiesEarned([trophy, { ...trophy, id: 'first_game', title: 'First round' }]))
    expect(screen.getByText(/\+1 more/)).toBeTruthy()
  })

  it('stays dismissed once dismissed', () => {
    render(<PostWinPrompt />)
    act(() => emitTrophiesEarned([trophy]))
    act(() => screen.getByRole('button', { name: 'Dismiss' }).click())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('comes back for a later game after being dismissed', () => {
    // Dismissing one night's result must not silence the prompt forever.
    render(<PostWinPrompt />)
    act(() => emitTrophiesEarned([trophy]))
    act(() => screen.getByRole('button', { name: 'Dismiss' }).click())
    act(() => emitTrophiesEarned([{ ...trophy, id: 'ten_games', title: 'Regular' }]))
    expect(screen.getByText(/Regular/)).toBeTruthy()
  })

  it('ignores an empty award', () => {
    render(<PostWinPrompt />)
    act(() => emitTrophiesEarned([]))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
