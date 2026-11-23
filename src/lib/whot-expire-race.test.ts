import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processWhotChoose, processWhotExpireTurn, processWhotPlay } from './whot'

const LOST_RACE = 'Another action already updated this turn — try again'
const V0 = '2026-01-01T00:00:00.000Z'
const V1 = '2026-01-01T00:00:05.000Z'

type Row = Record<string, unknown>

/**
 * Stateful fake: every whot_sessions / hands read returns the next snapshot in its list (the last
 * one repeats), so a test can hand a request a STALE session next to FRESH hands, exactly as two
 * racing requests see it. Every conditional update matches 0 rows (the claim is lost).
 */
function racingClient(opts: { sessions: Row[]; hands: Row[][]; updated?: string[] }) {
  const reads = { whot_sessions: 0, whot_player_hands: 0 }
  const pick = (list: Row[] | Row[][], n: number) => list[Math.min(n, list.length - 1)]
  return {
    from(table: string) {
      let isUpdate = false
      const chain: Record<string, unknown> = {}
      for (const m of ['eq', 'order']) chain[m] = () => chain
      chain.select = () => chain
      chain.update = () => {
        isUpdate = true
        opts.updated?.push(table)
        return chain
      }
      const read = () => {
        if (table === 'whot_sessions') return pick(opts.sessions, reads.whot_sessions++)
        if (table === 'whot_player_hands') return pick(opts.hands, reads.whot_player_hands++)
        if (table === 'games') return { timer_seconds: 20, game_duration_seconds: 0, session_started_at: null }
        return []
      }
      chain.maybeSingle = () => Promise.resolve({ data: read(), error: null })
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: isUpdate ? [] : read(), error: null })
      return chain
    },
  } as unknown as SupabaseClient
}

const session = (over: Row = {}) => ({
  game_id: 'G',
  phase: 'playing',
  turn_order: ['p1', 'p2'],
  current_turn_index: 0,
  finish_order: [],
  draw_pile: [{ id: 'sq-2', shape: 'square', number: 2 }],
  discard_pile: [],
  top_card: { id: 'circle-5', shape: 'circle', number: 5 },
  pick_two_stack: 0,
  pick_five_stack: 0,
  reshuffle_count: 0,
  turn_deadline_at: '2020-01-01T00:00:00.000Z',
  updated_at: V0,
  ...over,
})

const handsWith = (p1: Row[]) => [
  { game_id: 'G', player_id: 'p1', player_order: 0, cards: p1 },
  { game_id: 'G', player_id: 'p2', player_order: 1, cards: [{ id: 'star-4', shape: 'star', number: 4 }] },
]
const CIRCLE_3 = { id: 'circle-3', shape: 'circle', number: 3 }
const CROSS_9 = { id: 'cross-9', shape: 'cross', number: 9 }

describe('whot player plays and chooses that lose the claim', () => {
  it('play returns the conflict instead of success', async () => {
    const updated: string[] = []
    const client = racingClient({ sessions: [session()], hands: [handsWith([CIRCLE_3])], updated })
    expect(await processWhotPlay(client, 'G', 'p1', 'circle-3')).toEqual({ error: LOST_RACE })
    expect(updated).toEqual(['whot_sessions'])
  })

  it('choose returns the conflict instead of success and writes no stats', async () => {
    const updated: string[] = []
    const client = racingClient({
      sessions: [session({ phase: 'choose_whot' })],
      hands: [handsWith([CIRCLE_3])],
      updated,
    })
    expect(await processWhotChoose(client, 'G', 'p1', { shape: 'circle' })).toEqual({ error: LOST_RACE })
    expect(updated).toEqual(['whot_sessions'])
  })
})

describe('whot expire-turn never surfaces a stale-read error to the poller', () => {
  it('a play that lost the claim is skipped', async () => {
    const client = racingClient({ sessions: [session()], hands: [handsWith([CIRCLE_3])] })
    expect(await processWhotExpireTurn(client, 'G')).toEqual({ skipped: true })
  })

  it("maps 'Card not in hand' (stale session, fresh hands) to skipped once the turn has moved on", async () => {
    // Read 1 (expire's own load) and read 2 (play's load) see the old session; the winner's play
    // already removed the card from the hands play reads; read 3 (re-check) sees the new version.
    const client = racingClient({
      sessions: [session(), session(), session({ updated_at: V1, current_turn_index: 1 })],
      hands: [handsWith([CIRCLE_3]), handsWith([CROSS_9])],
    })
    expect(await processWhotExpireTurn(client, 'G')).toEqual({ skipped: true })
  })

  it("maps 'Choose WHOT shape or number first' to skipped once the turn has moved on", async () => {
    // Expire read a choose_whot session; the play-side read sees the post-choose session version.
    const client = racingClient({
      sessions: [
        session({ phase: 'choose_whot' }),
        session({ phase: 'playing', updated_at: V1, current_turn_index: 1 }),
      ],
      hands: [handsWith([CIRCLE_3])],
    })
    expect(await processWhotExpireTurn(client, 'G')).toEqual({ skipped: true })
  })

  it('still surfaces a real error when the session version did not move', async () => {
    // Card genuinely missing from hand and the session is unchanged: not a race, keep the error.
    const client = racingClient({
      sessions: [session()],
      hands: [handsWith([CIRCLE_3]), handsWith([CROSS_9])],
    })
    const res = await processWhotExpireTurn(client, 'G')
    expect(res).not.toHaveProperty('skipped')
    expect(res.error).toBe('Card not in hand')
  })
})
