// @vitest-environment jsdom
/**
 * Player-side message feed: a snapshot read must not replace the feed with rows that predate a realtime
 * INSERT or a removal that arrived while the read was in flight.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

type Row = Record<string, unknown>
const reads: Array<(rows: Row[]) => void> = []
const handlers: Record<string, (payload: { new?: Row; old?: Row }) => void> = {}

vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'order']) chain[name] = () => chain
  chain.limit = () =>
    new Promise((resolve) => {
      reads.push((rows) => resolve({ data: rows, error: null }))
    })
  const channel = {
    on(_type: string, cfg: { event: string }, cb: (payload: { new?: Row; old?: Row }) => void) {
      handlers[cfg.event] = cb
      return channel
    },
    subscribe: () => channel,
  }
  return { supabase: { from: () => chain, channel: () => channel, removeChannel: () => {} } }
})

import { useAnonymousMessages } from './useAnonymousMessages'

const row = (id: string): Row => ({
  id,
  game_id: 'ABCD',
  player_id: 'p',
  text: id,
  created_at: `2026-01-01T00:00:0${id === 'A' ? 1 : 2}Z`,
  reply_to_id: null,
  reply_to_text: null,
  message_type: 'text',
  media_url: null,
  players: { name: 'n' },
})

/** Resolve every read currently pending, newest rows first (the hook reverses them). */
async function flushReads(rows: Row[]) {
  await act(async () => {
    for (const resolve of reads.splice(0)) resolve(rows) // only reads pending NOW, not refetches they trigger
    await Promise.resolve()
  })
}

// Stable reference: a fresh [] each render would change the hook's loader and start extra reads.
const NO_PLAYERS: { id: string; name: string }[] = []

const ids = (result: { current: { messages: { id: string }[] } }) => result.current.messages.map((m) => m.id)

beforeEach(() => {
  reads.length = 0
  for (const k of Object.keys(handlers)) delete handlers[k]
})

describe('useAnonymousMessages player feed — snapshot vs realtime ordering', () => {
  it('refetches instead of replacing the feed with a snapshot older than a realtime INSERT', async () => {
    const { result } = renderHook(() => useAnonymousMessages('ABCD', true, NO_PLAYERS))
    await waitFor(() => expect(reads.length).toBeGreaterThan(0))
    await flushReads([row('A')])
    await waitFor(() => expect(ids(result)).toEqual(['A']))

    let reload: Promise<boolean> = Promise.resolve(true)
    act(() => {
      reload = result.current.reload() // heartbeat/poll read starts; its snapshot will not contain B
    })
    await waitFor(() => expect(reads.length).toBeGreaterThan(0))
    act(() => handlers.INSERT({ new: row('B') })) // B's INSERT arrives before the read response
    expect(ids(result)).toEqual(['A', 'B'])

    await flushReads([row('A')]) // the stale snapshot arrives: it must be discarded, not applied
    expect(ids(result)).toEqual(['A', 'B']) // never regresses to the stale ['A']
    await waitFor(() => expect(reads.length).toBeGreaterThan(0)) // ... and a fresh read started
    await flushReads([row('B'), row('A')])
    await act(async () => {
      await reload
    })
    expect(ids(result)).toEqual(['A', 'B'])
  })

  it('does not let a delayed snapshot restore a message removed while it was in flight', async () => {
    const { result } = renderHook(() => useAnonymousMessages('ABCD', true, NO_PLAYERS))
    await waitFor(() => expect(reads.length).toBeGreaterThan(0))
    await flushReads([row('B'), row('A')])
    await waitFor(() => expect(ids(result)).toEqual(['A', 'B']))

    let reload: Promise<boolean> = Promise.resolve(true)
    act(() => {
      reload = result.current.reload()
    })
    await waitFor(() => expect(reads.length).toBeGreaterThan(0))
    act(() => result.current.removeMessage('B')) // removed while the read is in flight
    await flushReads([row('B'), row('A')]) // the in-flight snapshot still contains B
    expect(ids(result)).toEqual(['A']) // the removed message is not restored
    await waitFor(() => expect(reads.length).toBeGreaterThan(0))
    await flushReads([row('A')]) // the refetch reflects the removal
    await act(async () => {
      await reload
    })
    expect(ids(result)).toEqual(['A'])
  })
})
