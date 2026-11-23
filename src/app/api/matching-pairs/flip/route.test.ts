import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const NOW = new Date('2026-01-01T00:10:00.000Z')
const ROUND_ID = '11111111-1111-4111-8111-111111111111'
const GRID = 8

let game: Record<string, unknown> = {}
let round: Record<string, unknown> = {}
let player: Record<string, unknown> = {}
let subs: Array<Record<string, unknown>> = []
let recordResult: { data: unknown; error: { message: string } | null } = { data: { status: 'ok' }, error: null }
const insert = vi.fn()

function makeClient() {
  return {
    rpc: async (fn: string, args: unknown) => {
      if (fn === 'matching_pairs_record_flip_checked') {
        insert(args)
        return recordResult
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
          if (table === 'games') return { data: game, error: null }
          if (table === 'rounds') return { data: round, error: null }
          if (table === 'memory_match_submissions') {
            const hit = subs.find((s) => Object.entries(filters).every(([k, v]) => s[k] === undefined || s[k] === v))
            return { data: hit ?? null, error: null }
          }
          return { data: null, error: null }
        },
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: table === 'memory_match_submissions' ? subs : [], error: null }),
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => makeClient() }))
const { assertPlayerMock, touchMock } = vi.hoisted(() => ({
  assertPlayerMock: vi.fn(),
  touchMock: vi.fn(),
}))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: assertPlayerMock }))
vi.mock('@/lib/game-activity', () => ({ touchGameActivity: touchMock }))
vi.mock('@/lib/memory-match', async (orig) => ({
  ...(await orig<typeof import('@/lib/memory-match')>()),
  finishMatchingPairsRoundIfAllDone: vi.fn(),
}))

import { POST } from './route'

function send(pairIndex: number, isMatch = true, roundId?: string) {
  return POST(
    new NextRequest('https://x.test/api/matching-pairs/flip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'ABCD', resumeToken: 'TOKEN-1234', pairIndex, isMatch, roundId }),
    })
  )
}

describe('POST /api/matching-pairs/flip hardening', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    insert.mockClear()
    touchMock.mockClear()
    assertPlayerMock.mockClear()
    assertPlayerMock.mockImplementation(async () => ({ player }))
    recordResult = { data: { status: 'ok' }, error: null }
    subs = []
    game = {
      id: 'ABCD',
      status: 'active',
      game_type: 'matching_pairs',
      session_started_at: '2026-01-01T00:00:00.000Z',
      timer_seconds: 0,
      current_round_number: 1,
      rounds_count: 1,
    }
    round = {
      id: ROUND_ID,
      status: 'active',
      started_at: '2026-01-01T00:00:00.000Z',
      memory_match_metadata: { gridSizePairs: GRID, pairs: [], playerBoards: [], seed: 1 },
    }
    player = { id: 'p-1', spectator: false, is_eliminated: false, joined_at: '2025-12-31T23:59:00.000Z' }
  })
  afterEach(() => vi.useRealTimers())

  it('accepts a plausible match', async () => {
    expect((await send(0)).status).toBe(200)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('records a flip whose roundId is the current round', async () => {
    expect((await send(0, true, ROUND_ID)).status).toBe(200)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('refuses a flip made on a previous round (in transit when the game moved on) without recording it', async () => {
    const res = await send(0, true, '22222222-2222-4222-8222-222222222222')
    expect(res.status).toBe(409)
    expect(insert).not.toHaveBeenCalled()
  })

  it('keeps the liveness bump for accepted players only, not for rejected viewers', async () => {
    await send(0)
    expect(assertPlayerMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), {
      readOnly: true,
    })
    expect(touchMock).toHaveBeenCalledTimes(1)

    touchMock.mockClear()
    player = { ...player, spectator: true }
    const res = await send(0)
    expect(res.status).toBe(403)
    expect(touchMock).not.toHaveBeenCalled()
  })

  it('rejects a spectator', async () => {
    player = { ...player, spectator: true }
    expect((await send(0)).status).toBe(403)
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects after the round deadline', async () => {
    game = { ...game, timer_seconds: 60 }
    expect((await send(0)).status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })

  it('accepts inside the deadline', async () => {
    game = { ...game, timer_seconds: 3600 }
    expect((await send(0)).status).toBe(200)
  })

  it('rejects when the round is not active', async () => {
    round = { ...round, status: 'finished' }
    expect((await send(0)).status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects a game that is not matching pairs', async () => {
    game = { ...game, game_type: 'trivia' }
    expect((await send(0)).status).toBe(400)
  })

  it('rejects a pair already matched', async () => {
    subs = [{ is_match: true, pair_index: 0, round_id: ROUND_ID, player_id: 'p-1', points_after: 1000 }]
    expect((await send(0)).status).toBe(409)
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects more matches than pairs', async () => {
    // Matched rows use a different pair than the request, so the duplicate-pair guard does not fire
    // first and the request actually reaches the "all pairs matched" count guard.
    subs = Array.from({ length: GRID }, () => ({ is_match: true, pair_index: 1, points_after: 1000 }))
    const res = await send(0, true)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'All pairs already matched' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects impossibly fast play (eight attempts within the first second)', async () => {
    round = { ...round, started_at: new Date(NOW.getTime() - 500).toISOString() }
    subs = Array.from({ length: 7 }, (_, i) => ({ is_match: false, pair_index: i, points_after: 0 }))
    expect((await send(7)).status).toBe(429)
    expect(insert).not.toHaveBeenCalled()
  })

  it('returns 409 (not 500) when the DB reports the pair already matched (cross-instance race)', async () => {
    recordResult = { data: { status: 'already_matched' }, error: null }
    expect((await send(0)).status).toBe(409)
  })

  it('returns 400 when the round closed between the status check and the insert', async () => {
    recordResult = { data: { status: 'round_not_active' }, error: null }
    const res = await send(0)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Round is not active')
  })

  it('keeps real DB errors on the 500 path', async () => {
    recordResult = { data: null, error: { message: 'boom' } }
    expect((await send(0)).status).toBe(500)
  })
})
