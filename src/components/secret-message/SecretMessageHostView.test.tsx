// @vitest-environment jsdom
/** The host inbox must show a load failure (with retry) instead of "No messages yet". */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const inbox = vi.hoisted(() => ({
  state: { messages: [] as unknown[], loading: true, loadError: false },
  reload: vi.fn(async () => true),
}))

vi.mock('@/hooks/useAnonymousMessages', () => ({
  useAnonymousMessages: () => ({ ...inbox.state, reload: inbox.reload, removeMessage: vi.fn() }),
}))
vi.mock('@/hooks/useAnonymousMessageTrim', () => ({ useAnonymousMessageTrim: () => {} }))
vi.mock('@/hooks/useGameTableSync', () => ({ useGameTableSync: () => true }))
vi.mock('@/hooks/useScrollHostViewToTop', () => ({ useScrollHostViewToTop: () => {} }))
vi.mock('@/hooks/usePolling', () => ({
  POLL_INTERVALS: { lobby: 1, slow: 1 },
  supabasePollOk: () => true,
  usePolling: () => {},
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: 'ABCD', status: 'active', title: 'T' }, error: null }) }),
      }),
    }),
  },
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }))
vi.mock('@/components/GameLinkQrCode', () => ({ GameLinkQrCode: () => null }))
vi.mock('@/components/InviteLinkActions', () => ({ InviteLinkActions: () => null }))
vi.mock('@/components/host/HostGameHeader', () => ({ HostGameHeader: () => null }))
vi.mock('@/components/host-lobby/HostVisibilityToggle', () => ({ HostVisibilityToggle: () => null }))
vi.mock('@/components/ui/CreateNewGameButton', () => ({ CreateNewGameButton: () => null }))
vi.mock('@/components/host/host-icons', () => ({ ExitIcon: () => null }))
vi.mock('@/components/anonymous-messages/AnonymousMessageFeed', () => ({
  AnonymousMessageFeed: ({
    emptyLabel,
    scrollToLatestOnMount,
  }: {
    emptyLabel: string
    scrollToLatestOnMount?: boolean
  }) => (
    <div data-testid="feed" data-scroll-on-mount={String(Boolean(scrollToLatestOnMount))}>
      {emptyLabel}
    </div>
  ),
}))

import { SecretMessageHostView } from './SecretMessageHostView'

beforeEach(() => {
  inbox.state = { messages: [], loading: true, loadError: false }
  inbox.reload.mockClear()
})

describe('SecretMessageHostView inbox states', () => {
  it('shows a retry state, not the empty label, when the first read failed', async () => {
    inbox.state = { messages: [], loading: true, loadError: true }
    render(<SecretMessageHostView gameCode="ABCD" hostToken="tok" />)
    await screen.findByText(/Couldn.t load your inbox/)
    expect(screen.queryByText(/No messages yet/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(inbox.reload).toHaveBeenCalledTimes(1)
  })

  it('shows a loading state before the first read completes', async () => {
    render(<SecretMessageHostView gameCode="ABCD" hostToken="tok" />)
    await screen.findByText('Loading your inbox…')
    expect(screen.queryByText(/No messages yet/)).toBeNull()
  })

  it('shows the empty label after a successful empty read', async () => {
    inbox.state = { messages: [], loading: false, loadError: false }
    render(<SecretMessageHostView gameCode="ABCD" hostToken="tok" />)
    await screen.findByText(/No messages yet/)
  })

  it('keeps the feed and notes a failed refresh after a successful read', async () => {
    inbox.state = { messages: [], loading: false, loadError: true }
    render(<SecretMessageHostView gameCode="ABCD" hostToken="tok" />)
    await waitFor(() => expect(screen.getByText(/No messages yet/)).toBeTruthy())
    expect(screen.getByText(/Couldn.t refresh/)).toBeTruthy()
  })

  it('asks the feed to jump to the newest message, since it mounts already holding the inbox', async () => {
    inbox.state = { messages: [{ id: 'm1' }], loading: false, loadError: false }
    render(<SecretMessageHostView gameCode="ABCD" hostToken="tok" />)
    const feed = await screen.findByTestId('feed')
    expect(feed.getAttribute('data-scroll-on-mount')).toBe('true')
  })
})
