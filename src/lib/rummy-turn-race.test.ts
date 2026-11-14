import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RummyCard, RummySuit } from '@/types'

vi.mock('server-only', () => ({}))

import { processRummyDiscard, processRummyGoOut } from './rummy'

/**
 * Concurrent discard / go-out requests from the same player used to each pass the turn checks and
 * each write the hand, because the hand was updated before the session row was claimed. These
 * tests run the real processors against a tiny in-memory Supabase stand-in that implements the
 * `.eq('updated_at', ...)` optimistic check the way Postgres does (the write only applies if the
 * row still matches).
 */

const c = (suit: RummySuit, rank: number): RummyCard => ({ id: `${suit}-${rank}`, suit, rank })

type Row = Record<string, unknown>

function makeDb(hand: RummyCard[]) {
  const tables: Record<string, Row[]> = {
    rummy_sessions: [
      {
        id: 's1',
        game_id: 'ABCD',
        turn_order: ['p1', 'p2'],
        current_turn_index: 0,
        phase: 'playing',
        draw_pile: [c('clubs', 9)],
        discard_pile: [c('spades', 2)],
        top_discard: c('spades', 2),
        turn_step: 'discard',
        reshuffle_count: 0,
        status_message: null,
        winner_player_id: null,
        winning_melds: null,
        turn_deadline_at: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    rummy_player_hands: [
      { id: 'h1', game_id: 'ABCD', player_id: 'p1', player_order: 0, cards: hand },
      { id: 'h2', game_id: 'ABCD', player_id: 'p2', player_order: 1, cards: [c('clubs', 1)] },
    ],
    players: [
      { id: 'p1', game_id: 'ABCD', name: 'Ana' },
      { id: 'p2', game_id: 'ABCD', name: 'Ben' },
    ],
    games: [{ id: 'ABCD', timer_seconds: 0, game_duration_seconds: 0, session_started_at: null }],
  }
  let tick = 0

  const builder = (table: string) => {
    const filters: [string, unknown][] = []
    let patch: Row | null = null
    const match = () =>
      tables[table].filter((r) =>
        filters.every(([k, v]) => (k === 'id' && table === 'games' ? r.id === v : r[k] === v))
      )
    const run = async () => {
      await Promise.resolve()
      if (patch) {
        const rows = match()
        const stamp =
          typeof patch.updated_at === 'string' ? `2026-01-01T00:00:${String(++tick).padStart(2, '0')}.000Z` : null
        for (const r of rows) {
          Object.assign(r, patch)
          if (stamp) r.updated_at = stamp
        }
        return { data: rows.map((r) => ({ ...r })), error: null }
      }
      return { data: match().map((r) => ({ ...r })), error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      order: () => api,
      eq: (k: string, v: unknown) => {
        filters.push([k, v])
        return api
      },
      update: (p: Row) => {
        patch = p
        return api
      },
      maybeSingle: async () => {
        const res = await run()
        return { data: (res.data as Row[])[0] ?? null, error: null }
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => run().then(resolve, reject),
    }
    return api
  }

  return { client: { from: builder } as unknown as SupabaseClient, tables }
}

const handOf = (tables: Record<string, Row[]>, id: string) =>
  (tables.rummy_player_hands.find((h) => h.player_id === id)?.cards as RummyCard[]) ?? []

describe('Rummy concurrent turn actions', () => {
  it('lets exactly one of several simultaneous discards through', async () => {
    const hand = [c('hearts', 5), c('hearts', 6), c('diamonds', 6), c('hearts', 1), c('clubs', 12)]
    const { client, tables } = makeDb(hand)

    const results = await Promise.all(
      ['hearts-5', 'diamonds-6', 'hearts-1'].map((id) => processRummyDiscard(client, 'ABCD', 'p1', id))
    )

    expect(results.filter((r) => !r.error)).toHaveLength(1)
    expect(results.filter((r) => r.error)).toHaveLength(2)
    // One card left the hand, and it is the one on top of the discard pile: nothing vanishes.
    const left = handOf(tables, 'p1')
    expect(left).toHaveLength(hand.length - 1)
    const session = tables.rummy_sessions[0]
    const top = session.top_discard as RummyCard
    expect(left.map((x) => x.id)).not.toContain(top.id)
    expect((session.discard_pile as RummyCard[]).map((x) => x.id)).toContain(top.id)
    expect(session.current_turn_index).toBe(1)
  })

  it('still discards normally when nothing races', async () => {
    const { client, tables } = makeDb([c('hearts', 5), c('hearts', 6)])
    expect(await processRummyDiscard(client, 'ABCD', 'p1', 'hearts-5')).toEqual({})
    expect(handOf(tables, 'p1').map((x) => x.id)).toEqual(['hearts-6'])
    expect(tables.rummy_sessions[0].turn_step).toBe('draw')
  })

  it('does not let a go-out and a discard both land on the same turn', async () => {
    const hand = [c('hearts', 5), c('spades', 5), c('clubs', 5), c('diamonds', 9)]
    const { client, tables } = makeDb(hand)

    const [out, discard] = await Promise.all([
      processRummyGoOut(client, 'ABCD', 'p1', [['hearts-5', 'spades-5', 'clubs-5']], 'diamonds-9'),
      processRummyDiscard(client, 'ABCD', 'p1', 'diamonds-9'),
    ])

    expect([out, discard].filter((r) => !r.error)).toHaveLength(1)
    const session = tables.rummy_sessions[0]
    // Either the player went out (phase finished, hand empty) or discarded (turn passed, hand kept).
    if (session.phase === 'finished') {
      expect(handOf(tables, 'p1')).toHaveLength(0)
    } else {
      expect(session.current_turn_index).toBe(1)
      expect(handOf(tables, 'p1')).toHaveLength(hand.length - 1)
    }
  })
})
