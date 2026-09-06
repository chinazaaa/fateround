import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Turn resolution must not re-read the `games` row the caller just fetched.
 *
 * Every /api/<game>/* mutation and expire-turn route reads
 * `games.select('status, game_type')` to authorize the request, then calls
 * `scheduleTurnNotification`. Before this guard, `resolveCurrentTurnPlayerId`
 * re-read the SAME row per notification — at the server ticker's rate that
 * doubled games-table read volume. The routes now pass the row through; the
 * fallback fetch stays so callers without the row (bot drivers) keep working.
 */

// `server-only` is a Next runtime guard, not resolvable under vitest.
vi.mock('server-only', () => ({}))

// `after()` defers work past the response — run it inline and collect the
// promise so tests can await the scheduled notification.
const scheduled: Promise<unknown>[] = []
vi.mock('next/server', () => ({
  after: (fn: () => Promise<unknown>) => {
    scheduled.push(fn())
  },
}))

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}))

vi.mock('@/lib/expo-push', () => ({
  sendExpoPushMessages: vi.fn().mockResolvedValue(undefined),
}))

const from = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from }),
}))

import { resolveCurrentTurnPlayerId, scheduleTurnNotification } from '@/lib/push'

// ── Table stub (same shape as whot-bot-driver.test.ts) ──────────────────────

type StubResponse = { data: unknown; error?: unknown; count?: number | null }
const nextResponses: StubResponse[] = []
function queueResponse(r: StubResponse) {
  nextResponses.push(r)
}

function makeChain(resp: StubResponse) {
  const chain: Record<string, unknown> = {}
  ;['select', 'eq', 'in', 'order', 'limit'].forEach((m) => {
    chain[m] = () => chain
  })
  ;['maybeSingle', 'single'].forEach((m) => {
    chain[m] = () => Promise.resolve(resp)
  })
  chain.then = (onFulfilled: (v: StubResponse) => unknown) => Promise.resolve(onFulfilled(resp))
  return chain
}

beforeEach(() => {
  nextResponses.length = 0
  scheduled.length = 0
  from.mockReset()
  from.mockImplementation(() => {
    const r = nextResponses.shift()
    return makeChain(r ?? { data: null, error: null, count: 0 })
  })
})

const queriedTables = () => from.mock.calls.map((c) => c[0])

describe('resolveCurrentTurnPlayerId', () => {
  it('skips the games re-read when the caller passes its game row', async () => {
    // Only the session read is queued — a games read would consume nothing
    // and, more to the point, show up in the queried-tables list.
    queueResponse({ data: null }) // ludo_sessions → no session, resolve → null

    const playerId = await resolveCurrentTurnPlayerId('game1', { status: 'active', game_type: 'ludo' })

    expect(playerId).toBeNull()
    expect(queriedTables()).not.toContain('games')
    expect(queriedTables()).toEqual(['ludo_sessions'])
  })

  it('returns null with zero queries when the passed row is not active', async () => {
    const playerId = await resolveCurrentTurnPlayerId('game1', { status: 'finished', game_type: 'ludo' })

    expect(playerId).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('still fetches the games row when no known row is passed (fallback)', async () => {
    queueResponse({ data: { status: 'active', game_type: 'ludo' } }) // games
    queueResponse({ data: null }) // ludo_sessions

    const playerId = await resolveCurrentTurnPlayerId('game1')

    expect(playerId).toBeNull()
    expect(queriedTables()).toEqual(['games', 'ludo_sessions'])
  })

  it('resolves the current player from the session when the row is passed', async () => {
    queueResponse({
      data: { status: 'active', turn_order: ['p1', 'p2'], current_turn_index: 1 },
    })

    const playerId = await resolveCurrentTurnPlayerId('game1', { status: 'active', game_type: 'ludo' })

    expect(playerId).toBe('p2')
    expect(queriedTables()).toEqual(['ludo_sessions'])
  })
})

describe('scheduleTurnNotification', () => {
  it('forwards the known game row so the deferred work never touches games', async () => {
    queueResponse({ data: null }) // ludo_sessions → resolve → null, nothing to send

    scheduleTurnNotification('game1', { status: 'active', game_type: 'ludo' })
    await Promise.all(scheduled)

    expect(queriedTables()).toEqual(['ludo_sessions'])
    expect(queriedTables()).not.toContain('games')
  })

  it('falls back to reading games when called without the row', async () => {
    queueResponse({ data: { status: 'active', game_type: 'ludo' } }) // games
    queueResponse({ data: null }) // ludo_sessions

    scheduleTurnNotification('game1')
    await Promise.all(scheduled)

    expect(queriedTables()).toEqual(['games', 'ludo_sessions'])
  })
})
