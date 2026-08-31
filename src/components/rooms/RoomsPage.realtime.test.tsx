// @vitest-environment jsdom
/**
 * The browse-rooms channel used to subscribe with `{ event: '*', table: 'rooms' }` and
 * NO filter, so every visitor on this page received every room INSERT/UPDATE/DELETE
 * across the entire platform. This pins the filtered shape it uses now, including the
 * deliberate exception for DELETE.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

type Sub = { event: string; schema: string; table: string; filter?: string }

const rt = vi.hoisted(() => ({ subs: [] as Sub[] }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = {}
      c.on = (_type: string, config: Sub) => {
        rt.subs.push(config)
        return c
      }
      c.subscribe = () => c
      return c
    },
    removeChannel: () => {},
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
import { PUBLIC_ROOMS_REALTIME_FILTER } from '@/lib/rooms-realtime'

beforeEach(() => {
  rt.subs = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ rooms: [], hasMore: false, nextCursor: null }),
    }))
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function openBrowseTab() {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <RoomsPage />
      </ConfirmProvider>
    </ToastProvider>
  )
  fireEvent.click(await screen.findByRole('tab', { name: 'Browse' }))
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
      const sub = rt.subs.find((s) => s.table === 'rooms' && s.event === event)
      expect(sub, `missing ${event} subscription`).toBeTruthy()
      expect(sub?.filter).toBe(PUBLIC_ROOMS_REALTIME_FILTER)
    }
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
