// @vitest-environment jsdom
/**
 * /browse subscribed with `{ event: '*', schema: 'public', table: 'games' }` and NO filter,
 * so every viewer received every `games` INSERT/UPDATE/DELETE across the entire platform —
 * a measured 12,275 byte frame per UPDATE per subscriber — and the handler discarded the
 * payload and ran a full `loadGames()` refetch for each one.
 *
 * This pins the filtered shape it uses now (including the deliberate DELETE exception),
 * that payloads are applied locally instead of refetched, and that the poll fallback stands
 * down while the channel is subscribed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'

type Sub = { event: string; schema: string; table: string; filter?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload: any) => void

const rt = vi.hoisted(() => ({
  subs: [] as (Sub & { handler: Handler })[],
  onStatus: null as ((status: string) => void) | null,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = {}
      c.on = (_type: string, config: Sub, handler: Handler) => {
        rt.subs.push({ ...config, handler })
        return c
      }
      c.subscribe = (cb?: (status: string) => void) => {
        // Only the main filtered channel passes a status callback; keep it.
        if (cb) rt.onStatus = cb
        return c
      }
      return c
    },
    removeChannel: (c: unknown) => c,
  },
}))

import { BrowseGamesPage } from './BrowseGamesPage'
import { PUBLIC_GAMES_REALTIME_FILTER, WATCHED_GAME_IDS_MAX } from '@/lib/browse-games-realtime'

/** The page now holds several `games` subscriptions; address them by event AND filter. */
function handlerFor(event: string, filter: string | undefined): Handler | undefined {
  return rt.subs.filter((s) => s.event === event && s.filter === filter).at(-1)?.handler
}

const GAME = {
  id: 'ABC123',
  title: 'Game night',
  game_type: 'trivia',
  status: 'waiting',
  max_players: 8,
  allow_late_players: true,
  created_at: '2026-08-31T10:00:00.000Z',
  scheduled_at: null,
  playerCount: 3,
  viewerCount: 0,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  rt.subs = []
  rt.onStatus = null
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ games: [GAME], hasMore: false, nextCursor: null }),
  }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function mount() {
  render(<BrowseGamesPage />)
  await screen.findByText('Game night')
  await waitFor(() => expect(rt.subs.length).toBeGreaterThan(0))
}

describe('BrowseGamesPage realtime subscription', () => {
  it('never subscribes to the unfiltered wildcard firehose', async () => {
    await mount()
    const gameSubs = rt.subs.filter((s) => s.table === 'games')
    expect(gameSubs.length).toBeGreaterThan(0)
    expect(gameSubs.some((s) => s.event === '*')).toBe(false)
  })

  it('filters INSERT and UPDATE on is_public server-side', async () => {
    await mount()
    for (const event of ['INSERT', 'UPDATE']) {
      const sub = rt.subs.find(
        (s) => s.table === 'games' && s.event === event && s.filter === PUBLIC_GAMES_REALTIME_FILTER
      )
      expect(sub, `missing is_public-filtered ${event} subscription`).toBeTruthy()
      expect(sub?.schema).toBe('public')
    }
  })

  it('also watches UPDATEs for the ids on screen (the going-private frame the is_public filter drops)', async () => {
    // postgres_changes evaluates `is_public=eq.true` against the POST-update row, so the
    // UPDATE that flips a listed game private never reaches the filtered subscription.
    // A second id-scoped channel must exist to deliver it.
    await mount()
    await waitFor(() => {
      const sub = rt.subs.find((s) => s.table === 'games' && s.event === 'UPDATE' && s.filter?.startsWith('id=in.('))
      expect(sub?.filter).toBe('id=in.(ABC123)')
      expect(sub?.schema).toBe('public')
    })
  })

  it('leaves DELETE unfiltered so id-only payloads still arrive', async () => {
    // `games` has REPLICA IDENTITY DEFAULT: a DELETE payload carries only the primary key,
    // so a filter on is_public could never match and deleted games would linger forever.
    await mount()
    const del = rt.subs.find((s) => s.table === 'games' && s.event === 'DELETE')
    expect(del).toBeTruthy()
    expect(del?.filter).toBeUndefined()
  })
})

describe('BrowseGamesPage realtime payload handling', () => {
  it('applies an UPDATE from the payload instead of refetching the list', async () => {
    await mount()
    const calls = fetchMock.mock.calls.length
    act(() => {
      handlerFor(
        'UPDATE',
        PUBLIC_GAMES_REALTIME_FILTER
      )?.({ new: { ...GAME, is_public: true, title: 'Renamed night' } })
    })
    await screen.findByText('Renamed night')
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('removes a finished game from the payload, with no refetch', async () => {
    await mount()
    const calls = fetchMock.mock.calls.length
    act(() => {
      handlerFor('UPDATE', PUBLIC_GAMES_REALTIME_FILTER)?.({ new: { ...GAME, is_public: true, status: 'finished' } })
    })
    await waitFor(() => expect(screen.queryByText('Game night')).toBeNull())
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('removes a listed game the moment it flips public→private, via the watched-ids channel', async () => {
    // Regression: the `is_public=eq.true` UPDATE subscription can never deliver this frame
    // (the filter is matched against the post-update row), so without the id-scoped channel
    // the now-private game stayed visible for up to 60s.
    await mount()
    await waitFor(() => expect(handlerFor('UPDATE', 'id=in.(ABC123)')).toBeTruthy())
    const calls = fetchMock.mock.calls.length
    act(() => {
      handlerFor('UPDATE', 'id=in.(ABC123)')?.({ new: { ...GAME, is_public: false } })
    })
    await waitFor(() => expect(screen.queryByText('Game night')).toBeNull())
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('watches every on-screen id past the 100-value in-filter cap via chunked subscriptions', async () => {
    // Regression: `watchedGamesRealtimeFilter` used to silently truncate to the first 100
    // ids, so with >100 loaded games the going-private frame for game #101+ never arrived
    // and the row stayed visible until the 60s safety refetch.
    const many = Array.from({ length: WATCHED_GAME_IDS_MAX + 20 }, (_, i) => ({
      ...GAME,
      id: `GAME${String(i).padStart(3, '0')}`,
      title: `Game ${String(i).padStart(3, '0')}`,
    }))
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ games: many, hasMore: false, nextCursor: null }),
    }))
    render(<BrowseGamesPage />)
    await screen.findByText('Game 110')

    // Every id must be covered by some id=in.(…) subscription, and each within the cap.
    await waitFor(() => {
      const watched = rt.subs.filter((s) => s.event === 'UPDATE' && s.filter?.startsWith('id=in.('))
      const coveredIds = new Set(watched.flatMap((s) => s.filter!.slice('id=in.('.length, -1).split(',')))
      for (const g of many) expect(coveredIds.has(g.id), `id ${g.id} not watched`).toBe(true)
      for (const s of watched) {
        expect(s.filter!.slice('id=in.('.length, -1).split(',').length).toBeLessThanOrEqual(WATCHED_GAME_IDS_MAX)
      }
    })

    // A game in the SECOND chunk flips private → its chunk's handler removes it immediately.
    const sub = rt.subs
      .filter((s) => s.event === 'UPDATE' && s.filter?.startsWith('id=in.(') && s.filter.includes('GAME110'))
      .at(-1)
    expect(sub).toBeTruthy()
    expect(sub!.filter).not.toContain('GAME010') // genuinely the second chunk, not the first
    act(() => {
      sub!.handler({ new: { ...GAME, id: 'GAME110', title: 'Game 110', is_public: false } })
    })
    await waitFor(() => expect(screen.queryByText('Game 110')).toBeNull())
    expect(screen.queryByText('Game 010')).not.toBeNull()
  })

  it('removes a deleted game from the id-only DELETE payload', async () => {
    await mount()
    act(() => {
      handlerFor('DELETE', undefined)?.({ old: { id: 'ABC123' } })
    })
    await waitFor(() => expect(screen.queryByText('Game night')).toBeNull())
  })
})

describe('BrowseGamesPage watched-channel reload under Strict Mode', () => {
  it('issues exactly one refetch for a watched frame that needs one, even with double-invoked updaters', async () => {
    // The reload used to be fired from INSIDE the setGames updater; React Strict Mode
    // invokes updaters twice, so that could double-fetch (and race an out-of-order
    // overwrite). It now goes through a ref + effect, which runs once per commit.
    render(
      <StrictMode>
        <BrowseGamesPage />
      </StrictMode>
    )
    await screen.findByText('Game night')
    await waitFor(() => expect(handlerFor('UPDATE', 'id=in.(ABC123)')).toBeTruthy())

    const calls = fetchMock.mock.calls.length
    act(() => {
      // Browsable but NOT in the list → the reducer requests a reload.
      handlerFor('UPDATE', 'id=in.(ABC123)')?.({ new: { ...GAME, id: 'OFFLIST', title: 'Off list', is_public: true } })
    })
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(calls + 1))
    // Settle any stray microtasks/commits, then confirm no second fetch ever fired.
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchMock.mock.calls.length).toBe(calls + 1)
  })

  it('does not refetch for a watched frame the reducer satisfies locally', async () => {
    render(
      <StrictMode>
        <BrowseGamesPage />
      </StrictMode>
    )
    await screen.findByText('Game night')
    await waitFor(() => expect(handlerFor('UPDATE', 'id=in.(ABC123)')).toBeTruthy())

    const calls = fetchMock.mock.calls.length
    act(() => {
      handlerFor('UPDATE', 'id=in.(ABC123)')?.({ new: { ...GAME, is_public: false } })
    })
    await waitFor(() => expect(screen.queryByText('Game night')).toBeNull())
    expect(fetchMock.mock.calls.length).toBe(calls)
  })
})

describe('BrowseGamesPage poll fallback', () => {
  it('skips the interval refetch while the channel is subscribed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await mount()
    act(() => {
      rt.onStatus?.('SUBSCRIBED')
    })
    const calls = fetchMock.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000)
    })
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('does not treat a FAILED refetch as fresh — the next poll tick retries', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await mount()
    act(() => {
      rt.onStatus?.('SUBSCRIBED')
    })
    // Let the healthy-refresh window lapse so the poll fires, and make that load fail.
    fetchMock.mockImplementation(async () => {
      throw new Error('network down')
    })
    const before = fetchMock.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000)
    })
    const afterFailure = fetchMock.mock.calls.length
    expect(afterFailure).toBeGreaterThan(before)
    // The failure must NOT have recorded freshness (that would gate recovery for another
    // 60s): the very next 15s tick retries.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000)
    })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFailure)
  })

  it('still polls when the channel is not subscribed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await mount()
    act(() => {
      rt.onStatus?.('CHANNEL_ERROR')
    })
    const calls = fetchMock.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000)
    })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls)
  })
})
