// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mutable state the hoisted mocks read from (vi.hoisted so it exists when mocks run).
const h = vi.hoisted(() => ({
  gameRow: null as { game_type: string } | null,
  verifyOk: true,
  verifyResponseOk: true,
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ code: 'abcd' }),
  useSearchParams: () => new URLSearchParams('token=secret'),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.gameRow, error: null }) }) }),
    }),
  },
}))

// Stub the heavy children so the test asserts the dispatch decision, not their internals.
vi.mock('@/components/poll-game/PollHostView', () => ({
  PollHostView: ({ gameCode, hostToken }: { gameCode: string; hostToken: string }) => (
    <div data-testid="poll-host-view">
      poll:{gameCode}:{hostToken}
    </div>
  ),
}))
vi.mock('@/components/game-host-views', () => ({
  HOST_VIEW_REGISTRY: {
    chess: ({ gameCode, hostToken }: { gameCode: string; hostToken: string }) => (
      <div data-testid="board-host-view">
        board:{gameCode}:{hostToken}
      </div>
    ),
  },
}))
// The floating music panel (Toast + realtime) is a heavy child too — stub it so the
// dispatcher test stays about the routing decision.
vi.mock('@/components/music/HostMusicControl', () => ({
  HostMusicControl: () => null,
}))
// The floating voice pill pulls in LiveKit + Toast (needs ToastProvider) — stub it so
// the dispatcher test stays about the routing decision, not the voice UI.
vi.mock('@/components/AudioChat', () => ({
  AudioChat: () => null,
}))

import HostPage from './page'

beforeEach(() => {
  h.gameRow = null
  h.verifyOk = true
  h.verifyResponseOk = true
  // The host page resolves its token from storage (clean-URL flow, like tournaments) via
  // useHostToken — seed it under the upper-cased code the page reads.
  localStorage.setItem('game_host_ABCD', 'secret')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: h.verifyResponseOk, json: async () => ({ ok: h.verifyOk }) }))
  )
})

afterEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/') // reset the URL so a strip test can't leak into others
  vi.unstubAllGlobals() // restore the real global.fetch so it can't leak into other suites
})

describe('HostPage dispatcher', () => {
  it('dispatches a poll game to PollHostView (with the upper-cased code + token)', async () => {
    h.gameRow = { game_type: 'smash_marry_kill' }
    render(<HostPage />)
    expect(await screen.findByTestId('poll-host-view')).toHaveTextContent('poll:ABCD:secret')
    expect(screen.queryByTestId('board-host-view')).not.toBeInTheDocument()
  })

  it('dispatches a board game to its dedicated host view', async () => {
    h.gameRow = { game_type: 'chess' }
    render(<HostPage />)
    expect(await screen.findByTestId('board-host-view')).toHaveTextContent('board:ABCD:secret')
    expect(screen.queryByTestId('poll-host-view')).not.toBeInTheDocument()
  })

  it('reads a ?token= host link, saves it to storage, and strips it from the URL', async () => {
    localStorage.removeItem('game_host_ABCD') // only the URL provides the token here
    window.history.replaceState({}, '', '/host/abcd?token=fromurl')
    h.gameRow = { game_type: 'chess' }
    render(<HostPage />)
    expect(await screen.findByTestId('board-host-view')).toHaveTextContent('board:ABCD:fromurl')
    expect(window.location.search).toBe('')
    expect(localStorage.getItem('game_host_ABCD')).toBe('fromurl')
  })

  it('shows Access Denied when no token is present anywhere', async () => {
    localStorage.removeItem('game_host_ABCD')
    h.gameRow = { game_type: 'chess' }
    render(<HostPage />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows Access Denied when the host token fails verification', async () => {
    h.gameRow = { game_type: 'chess' }
    h.verifyOk = false
    render(<HostPage />)
    expect(await screen.findByText('Access Denied')).toBeInTheDocument()
  })

  it('shows the server-error state (not Access Denied) when the token verifies but the game row fails to load', async () => {
    // The token already verified, so a null/errored game read is a load/schema problem —
    // not an auth problem. It must NOT masquerade as "invalid or missing host token"
    // (a missing column grant did exactly that and read as a bogus Access Denied).
    h.gameRow = null
    render(<HostPage />)
    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument()
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
  })

  it('shows the server-error state when verify-host is unreachable', async () => {
    h.gameRow = { game_type: 'chess' }
    h.verifyResponseOk = false
    render(<HostPage />)
    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument()
  })
})
