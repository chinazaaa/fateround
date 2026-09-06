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

/**
 * A finished session must never produce a "your turn" push.
 *
 * The routes now pass the games row they read BEFORE their mutation, so it is
 * pinned to `status: 'active'` even on the move that ended the game. That makes
 * the per-session terminal check the only thing standing between a player who
 * just won and an "It's your turn!" notification — and it was reading
 * `session.status` on tables whose terminal column is `phase`, i.e. reading
 * `undefined` and never firing.
 */
describe('resolveCurrentTurnPlayerId — finished sessions', () => {
  // gameType → session table, its terminal column, and a row that WOULD resolve
  // to a player if the terminal guard did not fire.
  const TERMINAL: {
    gameType: string
    table: string
    column: 'status' | 'phase'
    live: Record<string, unknown>
    resolvesTo: string
  }[] = [
    // `phase`-based session tables
    {
      gameType: 'ludo',
      table: 'ludo_sessions',
      column: 'phase',
      live: { turn_order: ['p1', 'p2'], current_turn_index: 0 },
      resolvesTo: 'p1',
    },
    {
      gameType: 'whot',
      table: 'whot_sessions',
      column: 'phase',
      live: { turn_order: ['p1', 'p2'], current_turn_index: 1 },
      resolvesTo: 'p2',
    },
    {
      gameType: 'scrabble',
      table: 'scrabble_sessions',
      column: 'phase',
      live: { turn_order: ['p1', 'p2'], current_turn_index: 0 },
      resolvesTo: 'p1',
    },
    {
      gameType: 'crazy_eights',
      table: 'crazy_eights_sessions',
      column: 'phase',
      live: { turn_order: ['p1', 'p2'], current_turn_index: 1 },
      resolvesTo: 'p2',
    },
    {
      gameType: 'snake_and_ladder',
      table: 'snake_ladder_sessions',
      column: 'phase',
      live: { turn_order: ['p1', 'p2'], current_turn_index: 0 },
      resolvesTo: 'p1',
    },
    {
      gameType: 'yahtzee',
      table: 'yahtzee_sessions',
      column: 'phase',
      live: { turn_order: ['p1', 'p2'], current_turn_index: 1 },
      resolvesTo: 'p2',
    },
    {
      gameType: 'monopoly',
      table: 'monopoly_boards',
      column: 'phase',
      live: { turn_order: ['p1', 'p2'], current_turn_index: 0 },
      resolvesTo: 'p1',
    },
    {
      gameType: 'mahjong',
      table: 'mahjong_sessions',
      column: 'phase',
      live: { turn_order: ['p1', 'p2'], current_turn_index: 1 },
      resolvesTo: 'p2',
    },
    // `status`-based session tables
    {
      gameType: 'chess',
      table: 'chess_sessions',
      column: 'status',
      live: { current_turn: 'w', player_white_id: 'p1', player_black_id: 'p2' },
      resolvesTo: 'p1',
    },
    {
      gameType: 'checkers',
      table: 'checkers_sessions',
      column: 'status',
      live: { current_turn: 'r', player_red_id: 'p1', player_black_id: 'p2' },
      resolvesTo: 'p1',
    },
    {
      gameType: 'checkers_international',
      table: 'checkers10_sessions',
      column: 'status',
      live: { current_turn: 'b', player_red_id: 'p1', player_black_id: 'p2' },
      resolvesTo: 'p2',
    },
    {
      gameType: 'checkers_nigeria',
      table: 'checkers10_sessions',
      column: 'status',
      live: { current_turn: 'r', player_red_id: 'p1', player_black_id: 'p2' },
      resolvesTo: 'p1',
    },
    {
      gameType: 'ayo',
      table: 'ayo_sessions',
      column: 'status',
      live: { current_turn: 'b', player_a_id: 'p1', player_b_id: 'p2' },
      resolvesTo: 'p2',
    },
    {
      gameType: 'tic_tac_toe',
      table: 'tic_tac_toe_sessions',
      column: 'status',
      live: { current_turn_mark: 'X', player_x_id: 'p1', player_o_id: 'p2' },
      resolvesTo: 'p1',
    },
  ]

  // Pins the branch → table mapping, so a future branch can't be pointed at a
  // table whose terminal column it doesn't check.
  it.each(TERMINAL)(
    '$gameType: reads $table and resolves a player while the session is live',
    async ({ gameType, table, live, resolvesTo }) => {
      queueResponse({ data: live })

      const playerId = await resolveCurrentTurnPlayerId('game1', { status: 'active', game_type: gameType })

      expect(queriedTables()).toEqual([table])
      expect(playerId).toBe(resolvesTo)
    }
  )

  it.each(TERMINAL)(
    '$gameType: returns null when $table says $column = finished, even with an active games row',
    async ({ gameType, column, live }) => {
      queueResponse({ data: { ...live, [column]: 'finished' } })

      const playerId = await resolveCurrentTurnPlayerId('game1', { status: 'active', game_type: gameType })

      expect(playerId).toBeNull()
    }
  )

  it('sends no push when the game just ended on this move', async () => {
    queueResponse({ data: { phase: 'finished', turn_order: ['p1', 'p2'], current_turn_index: 0 } })

    scheduleTurnNotification('game1', { status: 'active', game_type: 'ludo' })
    await Promise.all(scheduled)

    // No push_subscriptions / mobile_push_tokens read means nothing was sent.
    expect(queriedTables()).toEqual(['ludo_sessions'])
  })
})

describe('resolveCurrentTurnPlayerId — untrusted known rows', () => {
  it('falls back to the games fetch when the passed row has a non-string status', async () => {
    queueResponse({ data: { status: 'active', game_type: 'ludo' } }) // games
    queueResponse({ data: { turn_order: ['p1', 'p2'], current_turn_index: 1 } })

    const playerId = await resolveCurrentTurnPlayerId('game1', {
      game_type: 'ludo',
    } as unknown as Parameters<typeof resolveCurrentTurnPlayerId>[1])

    expect(queriedTables()).toEqual(['games', 'ludo_sessions'])
    expect(playerId).toBe('p2')
  })
})
