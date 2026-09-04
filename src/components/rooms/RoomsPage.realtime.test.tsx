// @vitest-environment jsdom
/**
 * The browse-rooms channel used to subscribe with `{ event: '*', table: 'rooms' }` and
 * NO filter, so every visitor on this page received every room INSERT/UPDATE/DELETE
 * across the entire platform. This pins the filtered shape it uses now, including the
 * deliberate exception for DELETE, the id-scoped watched channel that delivers the
 * going-private frame the is_public filter structurally drops, and that realtime reloads
 * run once per frame even under Strict Mode's double-invoked updaters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

type Sub = { event: string; schema: string; table: string; filter?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload: any) => void

const rt = vi.hoisted(() => ({ subs: [] as (Sub & { handler: Handler })[] }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = {}
      c.on = (_type: string, config: Sub, handler: Handler) => {
        rt.subs.push({ ...config, handler })
        return c
      }
      c.subscribe = () => c
      return c
    },
    removeChannel: (c: unknown) => c,
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/rooms',
  useSearchParams: () => new URLSearchParams(),
}))

import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { RoomsPage } from './RoomsPage'
import { PUBLIC_ROOMS_REALTIME_FILTER, WATCHED_ROOM_IDS_MAX } from '@/lib/rooms-realtime'

/** The page now holds several `rooms` subscriptions; address them by event AND filter. */
function handlerFor(event: string, filter: string | undefined): Handler | undefined {
  return rt.subs.filter((s) => s.event === event && s.filter === filter).at(-1)?.handler
}

const ROOM = {
  id: 'ABC123',
  name: 'Fun Room',
  created_at: '2026-08-31T10:00:00.000Z',
  is_public: true,
  is_locked: false,
  description: null,
  timezone: null,
  max_members: null,
  memberCount: 3,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  rt.subs = []
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ rooms: [ROOM], hasMore: false, nextCursor: null }),
  }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function openBrowseTab(strict = false) {
  const page = (
    <ToastProvider>
      <ConfirmProvider>
        <RoomsPage />
      </ConfirmProvider>
    </ToastProvider>
  )
  render(strict ? <StrictMode>{page}</StrictMode> : page)
  fireEvent.click(await screen.findByRole('tab', { name: 'Browse' }))
  await screen.findByText('Fun Room')
  await waitFor(() => expect(rt.subs.length).toBeGreaterThan(0))
}

describe('RoomsPage browse realtime subscription', () => {
  it('never subscribes to the unfiltered wildcard firehose', async () => {
    await openBrowseTab()
    const roomSubs = rt.subs.filter((s) => s.table === 'rooms')
    expect(roomSubs.length).toBeGreaterThan(0)
    expect(roomSubs.some((s) => s.event === '*')).toBe(false)
  })

  it('filters INSERT and UPDATE on is_public server-side', async () => {
    await openBrowseTab()
    for (const event of ['INSERT', 'UPDATE']) {
      const sub = rt.subs.find(
        (s) => s.table === 'rooms' && s.event === event && s.filter === PUBLIC_ROOMS_REALTIME_FILTER
      )
      expect(sub, `missing is_public-filtered ${event} subscription`).toBeTruthy()
      expect(sub?.schema).toBe('public')
    }
  })

  it('also watches UPDATEs for the ids on screen (the going-private frame the is_public filter drops)', async () => {
    // postgres_changes evaluates `is_public=eq.true` against the POST-update row, so the
    // UPDATE that flips a listed room private never reaches the filtered subscription.
    // A second id-scoped channel must exist to deliver it.
    await openBrowseTab()
    await waitFor(() => {
      const sub = rt.subs.find((s) => s.table === 'rooms' && s.event === 'UPDATE' && s.filter?.startsWith('id=in.('))
      expect(sub?.filter).toBe('id=in.(ABC123)')
      expect(sub?.schema).toBe('public')
    })
  })

  it('leaves DELETE unfiltered so id-only payloads still arrive', async () => {
    // `rooms` uses REPLICA IDENTITY DEFAULT: a DELETE payload contains only the primary
    // key, so a filter on is_public could never match and deleted rooms would linger.
    await openBrowseTab()
    const del = rt.subs.find((s) => s.table === 'rooms' && s.event === 'DELETE')
    expect(del).toBeTruthy()
    expect(del?.filter).toBeUndefined()
  })
})

describe('RoomsPage browse realtime payload handling', () => {
  it('removes a listed room the moment it flips public→private, via the watched-ids channel, with no refetch', async () => {
    // Regression: the `is_public=eq.true` UPDATE subscription can never deliver this frame
    // (the filter is matched against the post-update row), so without the id-scoped
    // channel the now-private room stayed visible until the next refetch.
    await openBrowseTab()
    await waitFor(() => expect(handlerFor('UPDATE', 'id=in.(ABC123)')).toBeTruthy())
    const calls = fetchMock.mock.calls.length
    act(() => {
      handlerFor('UPDATE', 'id=in.(ABC123)')?.({ new: { ...ROOM, is_public: false } })
    })
    await waitFor(() => expect(screen.queryByText('Fun Room')).toBeNull())
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('watches every on-screen id past the 100-value in-filter cap via chunked subscriptions', async () => {
    // Regression guard: Supabase realtime `in` filters cap at 100 values. A viewer who has
    // paged past 100 rooms must still get the going-private frame for room #101+, so ids
    // are chunked into one binding per 100 rather than silently truncated.
    const many = Array.from({ length: WATCHED_ROOM_IDS_MAX + 20 }, (_, i) => ({
      ...ROOM,
      id: `ROOM${String(i).padStart(3, '0')}`,
      name: `Room ${String(i).padStart(3, '0')}`,
    }))
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ rooms: many, hasMore: false, nextCursor: null }),
    }))
    render(
      <ToastProvider>
        <ConfirmProvider>
          <RoomsPage />
        </ConfirmProvider>
      </ToastProvider>
    )
    fireEvent.click(await screen.findByRole('tab', { name: 'Browse' }))
    await screen.findByText('Room 110')

    // Every id must be covered by some id=in.(…) subscription, each within the cap.
    await waitFor(() => {
      const watched = rt.subs.filter((s) => s.event === 'UPDATE' && s.filter?.startsWith('id=in.('))
      const coveredIds = new Set(watched.flatMap((s) => s.filter!.slice('id=in.('.length, -1).split(',')))
      for (const room of many) expect(coveredIds.has(room.id), `id ${room.id} not watched`).toBe(true)
      for (const s of watched) {
        expect(s.filter!.slice('id=in.('.length, -1).split(',').length).toBeLessThanOrEqual(WATCHED_ROOM_IDS_MAX)
      }
    })

    // A room in the SECOND chunk flips private → its chunk's handler removes it immediately.
    const sub = rt.subs
      .filter((s) => s.event === 'UPDATE' && s.filter?.startsWith('id=in.(') && s.filter.includes('ROOM110'))
      .at(-1)
    expect(sub).toBeTruthy()
    expect(sub!.filter).not.toContain('ROOM010') // genuinely the second chunk, not the first
    act(() => {
      sub!.handler({ new: { ...ROOM, id: 'ROOM110', name: 'Room 110', is_public: false } })
    })
    await waitFor(() => expect(screen.queryByText('Room 110')).toBeNull())
    expect(screen.queryByText('Room 010')).not.toBeNull()
  })

  it('removes a deleted room from the id-only DELETE payload', async () => {
    await openBrowseTab()
    act(() => {
      handlerFor('DELETE', undefined)?.({ old: { id: 'ABC123' } })
    })
    await waitFor(() => expect(screen.queryByText('Fun Room')).toBeNull())
  })
})

describe('RoomsPage realtime reload under Strict Mode', () => {
  it('issues exactly one refetch for a frame that needs one, even with double-invoked updaters', async () => {
    // The reload used to be fired from INSIDE the setPublicRooms updater; React Strict
    // Mode invokes updaters twice, so that could double-fetch (and race an out-of-order
    // overwrite of publicRooms). It now goes through a ref + tick-keyed effect, which
    // runs once per commit.
    await openBrowseTab(true)
    const calls = fetchMock.mock.calls.length
    act(() => {
      // Browsable but NOT in the list → the reducer requests a reload (needs memberCount).
      handlerFor('INSERT', PUBLIC_ROOMS_REALTIME_FILTER)?.({ new: { ...ROOM, id: 'NEW999', name: 'Brand new room' } })
    })
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(calls + 1))
    // Settle any stray microtasks/commits, then confirm no second fetch ever fired.
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchMock.mock.calls.length).toBe(calls + 1)
  })

  it('does not refetch for a frame the reducer satisfies locally', async () => {
    await openBrowseTab(true)
    await waitFor(() => expect(handlerFor('UPDATE', 'id=in.(ABC123)')).toBeTruthy())
    const calls = fetchMock.mock.calls.length
    act(() => {
      handlerFor('UPDATE', 'id=in.(ABC123)')?.({ new: { ...ROOM, is_public: false } })
    })
    await waitFor(() => expect(screen.queryByText('Fun Room')).toBeNull())
    expect(fetchMock.mock.calls.length).toBe(calls)
  })
})
