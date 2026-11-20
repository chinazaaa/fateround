import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

/**
 * A flip is scored in application code from the player's history and then inserted. These tests run the
 * route against a STATEFUL in-memory database and interleave a history change (the duplicate cleanup of
 * migration 20261202500000, or a flip of the same player on another server instance) at the exact await
 * point between the route's read of the history and its insert, then assert what ended up stored.
 */

const ROUND_ID = '11111111-1111-4111-8111-111111111111'
const PLAYER_ID = '22222222-2222-4222-8222-222222222222'
const GRID = 8

type Sub = {
  id: string
  round_id: string
  player_id: string
  pair_index: number
  is_match: boolean
  streak_at_time: number
  streak_bonus: number
  points_after: number
}

let subs: Sub[] = []
let nextId = 1
// Runs once, right after the route has read the history and before its record call is applied.
let beforeRecord: (() => void) | null = null
let recordCalls = 0

function addSub(partial: Partial<Sub> & { pair_index: number; is_match: boolean }): Sub {
  const row: Sub = {
    id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
    round_id: ROUND_ID,
    player_id: PLAYER_ID,
    streak_at_time: 0,
    streak_bonus: 0,
    points_after: 0,
    ...partial,
  }
  subs.push(row)
  return row
}

// Mirrors public.matching_pairs_record_flip_checked(): inserts only when the caller's fingerprint of the
// history (row count + latest row id) still matches, otherwise answers 'stale'.
function recordChecked(a: Record<string, unknown>) {
  const mine = subs.filter((s) => s.round_id === a.p_round_id && s.player_id === a.p_player_id)
  const last = mine.length ? mine[mine.length - 1].id : null
  if (mine.length !== a.p_expected_count || last !== a.p_expected_last_id) return { status: 'stale' }
  return insertRow(a)
}

// Mirrors the old public.matching_pairs_record_flip(): inserts whatever it is handed.
function insertRow(a: Record<string, unknown>) {
  addSub({
    pair_index: a.p_pair_index as number,
    is_match: a.p_is_match as boolean,
    streak_at_time: a.p_streak_at_time as number,
    streak_bonus: a.p_streak_bonus as number,
    points_after: a.p_points_after as number,
  })
  return { status: 'ok' }
}

function makeClient() {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'matching_pairs_record_flip_checked' || fn === 'matching_pairs_record_flip') {
        recordCalls++
        const hook = beforeRecord
        beforeRecord = null
        hook?.()
        return { data: fn === 'matching_pairs_record_flip' ? insertRow(args) : recordChecked(args), error: null }
      }
      return { data: { finish_rank: 1 }, error: null }
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (k: string, v: unknown) => {
          filters[k] = v
          return chain
        },
        maybeSingle: async () => {
          if (table === 'games') {
            return {
              data: {
                id: 'ABCD',
                status: 'active',
                game_type: 'matching_pairs',
                session_started_at: '2026-01-01T00:00:00.000Z',
                timer_seconds: 0,
                current_round_number: 1,
                rounds_count: 1,
              },
              error: null,
            }
          }
          if (table === 'rounds') {
            return {
              data: {
                id: ROUND_ID,
                status: 'active',
                started_at: '2026-01-01T00:00:00.000Z',
                memory_match_metadata: { gridSizePairs: GRID, pairs: [], playerBoards: [], seed: 1 },
              },
              error: null,
            }
          }
          if (table === 'memory_match_submissions') {
            const hit = subs.find((s) =>
              Object.entries(filters).every(([k, v]) => (s as Record<string, unknown>)[k] === v)
            )
            return { data: hit ? { ...hit } : null, error: null }
          }
          return { data: null, error: null }
        },
        // The list read of a player's history / progress. Snapshot rows so a later mutation of the
        // store cannot rewrite what this read already returned.
        then: (resolve: (v: unknown) => void) =>
          resolve({
            data:
              table === 'memory_match_submissions'
                ? subs
                    .filter((s) => Object.entries(filters).every(([k, v]) => (s as Record<string, unknown>)[k] === v))
                    .map((s) => ({ ...s }))
                : [],
            error: null,
          }),
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => makeClient() }))
vi.mock('@/lib/game-admin', () => ({
  assertPlayer: async () => ({
    player: { id: PLAYER_ID, spectator: false, is_eliminated: false, joined_at: '2025-12-31T23:59:00.000Z' },
  }),
}))
vi.mock('@/lib/memory-match', async (orig) => ({
  ...(await orig<typeof import('@/lib/memory-match')>()),
  finishMatchingPairsRoundIfAllDone: vi.fn(),
}))

import { POST } from './route'

function send(pairIndex: number, isMatch = true) {
  return POST(
    new NextRequest('https://x.test/api/matching-pairs/flip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'ABCD', resumeToken: 'TOKEN-1234', pairIndex, isMatch }),
    })
  )
}

describe('POST /api/matching-pairs/flip: history changes between the read and the insert', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:10:00.000Z'))
    subs = []
    nextId = 1
    beforeRecord = null
    recordCalls = 0
  })
  afterEach(() => vi.useRealTimers())

  it('re-scores from the cleaned history when the duplicate cleanup runs after the read', async () => {
    // Stored history: A, A-duplicate, B (the cleanup example from PR #1295): bonuses 0, 0, 500 and 3000 points.
    addSub({ pair_index: 0, is_match: true, streak_at_time: 1, points_after: 1000 })
    const dup = addSub({ pair_index: 0, is_match: true, streak_at_time: 2, points_after: 2000 })
    const b = addSub({ pair_index: 1, is_match: true, streak_at_time: 3, streak_bonus: 500, points_after: 3500 })

    // The flip for pair C has read this history (streak 3, 3500 points) when the cleanup lands: the
    // duplicate is deleted and B is replayed as the second retained match (no bonus, 2000 points).
    beforeRecord = () => {
      subs = subs.filter((s) => s.id !== dup.id)
      b.streak_at_time = 2
      b.streak_bonus = 0
      b.points_after = 2000
    }

    const res = await send(2)
    expect(res.status).toBe(200)

    // C is the third retained match: streak 3 earns the 500 bonus on top of 1000, from 2000 points.
    const c = subs[subs.length - 1]
    expect(c.pair_index).toBe(2)
    expect(c.streak_at_time).toBe(3)
    expect(c.streak_bonus).toBe(500)
    expect(c.points_after).toBe(3500)
    expect((await res.json()).pointsAfter).toBe(3500)
  })

  it('re-scores when another instance appended a flip for the same player after the read', async () => {
    addSub({ pair_index: 0, is_match: true, streak_at_time: 1, points_after: 1000 })
    // Pair 1 is flipped from this instance, but a flip of pair 2 from another instance lands first.
    beforeRecord = () => {
      addSub({ pair_index: 2, is_match: true, streak_at_time: 2, points_after: 2000 })
    }

    const res = await send(1)
    expect(res.status).toBe(200)

    // Pair 1 follows two matches: third in the run, so 1000 + 500 bonus on top of 2000, not 2000 from 1000.
    const last = subs[subs.length - 1]
    expect(last.pair_index).toBe(1)
    expect(last.streak_at_time).toBe(3)
    expect(last.streak_bonus).toBe(500)
    expect(last.points_after).toBe(3500)
  })

  it('does not insert anything from the stale read', async () => {
    addSub({ pair_index: 0, is_match: true, streak_at_time: 1, points_after: 1000 })
    beforeRecord = () => {
      addSub({ pair_index: 2, is_match: true, streak_at_time: 2, points_after: 2000 })
    }
    await send(1)
    expect(subs).toHaveLength(3)
    expect(recordCalls).toBe(2)
  })

  it('gives up with 409 when the history keeps changing', async () => {
    addSub({ pair_index: 0, is_match: true, streak_at_time: 1, points_after: 1000 })
    let pair = 2
    const churn = () => {
      addSub({ pair_index: pair++, is_match: true, streak_at_time: 1, points_after: 1 })
      beforeRecord = churn
    }
    beforeRecord = churn
    const res = await send(7)
    expect(res.status).toBe(409)
    expect(subs.some((s) => s.pair_index === 7)).toBe(false)
  })
})
