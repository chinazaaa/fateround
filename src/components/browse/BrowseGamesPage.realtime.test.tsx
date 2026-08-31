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
import { act, render, screen, waitFor } from '@testing-library/react'

type Sub = { event: string; schema: string; table: string; filter?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (payload: any) => void

const rt = vi.hoisted(() => ({
  subs: [] as Sub[],
  handlers: new Map<string, Handler>(),
  onStatus: null as ((status: string) => void) | null,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = {}
      c.on = (_type: string, config: Sub, handler: Handler) => {
        rt.subs.push(config)
        rt.handlers.set(config.event, handler)
        return c
      }
      c.subscribe = (cb?: (status: string) => void) => {
        rt.onStatus = cb ?? null
        return c
      }
      return c
    },
    removeChannel: () => {},
  },
}))

import { BrowseGamesPage } from './BrowseGamesPage'
import { PUBLIC_GAMES_REALTIME_FILTER } from '@/lib/browse-games-realtime'

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
  rt.handlers = new Map()
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
      const sub = rt.subs.find((s) => s.table === 'games' && s.event === event)
      expect(sub, `missing ${event} subscription`).toBeTruthy()
      expect(sub?.schema).toBe('public')
      expect(sub?.filter).toBe(PUBLIC_GAMES_REALTIME_FILTER)
    }
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
      rt.handlers.get('UPDATE')?.({ new: { ...GAME, is_public: true, title: 'Renamed night' } })
    })
    await screen.findByText('Renamed night')
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('removes a finished game from the payload, with no refetch', async () => {
    await mount()
    const calls = fetchMock.mock.calls.length
    act(() => {
      rt.handlers.get('UPDATE')?.({ new: { ...GAME, is_public: true, status: 'finished' } })
    })
    await waitFor(() => expect(screen.queryByText('Game night')).toBeNull())
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('removes a deleted game from the id-only DELETE payload', async () => {
    await mount()
    act(() => {
      rt.handlers.get('DELETE')?.({ old: { id: 'ABC123' } })
    })
    await waitFor(() => expect(screen.queryByText('Game night')).toBeNull())
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
