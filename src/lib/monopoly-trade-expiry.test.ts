import { describe, it, expect } from 'vitest'
import { processMonopolyTradeRespond, repairMonopolyStalePendingTrade } from './monopoly'
import { isMonopolyTradeExpired } from './monopoly-trade-messages'

// A board holds ONE pending_trade, and proposing while one is open errors with
// "A trade is already pending" — so an offer nobody answers used to freeze
// trading for the entire table until the proposer happened to cancel it.
// These pin the response window that bounds it.

type Row = { data: unknown; error: unknown }

function makeMockSupabase(opts: {
  board: Record<string, unknown>
  states: Array<Record<string, unknown>>
  players?: Array<{ id: string; name: string }>
  rpcResult?: { data: unknown; error: { message: string } | null }
}) {
  const updates: Array<{ table: string; vals: Record<string, unknown> }> = []
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []

  function selectChain(table: string) {
    const filters: Record<string, unknown> = {}
    const single = (): Row => {
      if (table === 'monopoly_boards') return { data: opts.board, error: null }
      if (table === 'monopoly_player_state') {
        return { data: opts.states.find((s) => s.player_id === filters['player_id']) ?? null, error: null }
      }
      if (table === 'games') return { data: { timer_seconds: 30 }, error: null }
      return { data: null, error: null }
    }
    const chain = {
      eq(col: string, val: unknown) {
        filters[col] = val
        return chain
      },
      in() {
        return chain
      },
      order() {
        return chain
      },
      maybeSingle() {
        return Promise.resolve(single())
      },
      then(onFulfilled?: (v: Row) => unknown, onRejected?: (e: unknown) => unknown) {
        const list: Row =
          table === 'monopoly_player_state'
            ? { data: opts.states, error: null }
            : table === 'players'
              ? { data: opts.players ?? [], error: null }
              : { data: null, error: null }
        return Promise.resolve(list).then(onFulfilled, onRejected)
      },
    }
    return chain
  }

  function updateChain() {
    const chain = {
      eq() {
        return chain
      },
      select() {
        return chain
      },
      then(onFulfilled?: (v: Row) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve({ data: [{ game_id: 'GAME1' }], error: null }).then(onFulfilled, onRejected)
      },
    }
    return chain
  }

  const supabase = {
    from(table: string) {
      return {
        select() {
          return selectChain(table)
        },
        update(vals: Record<string, unknown>) {
          updates.push({ table, vals })
          return updateChain()
        },
      }
    },
    rpc(fn: string, params: Record<string, unknown>) {
      rpcCalls.push({ fn, params })
      return Promise.resolve(opts.rpcResult ?? { data: true, error: null })
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, updates, rpcCalls }
}

function baseBoard(overrides: Record<string, unknown> = {}) {
  return {
    game_id: 'GAME1',
    turn_order: ['payer', 'owner', 'third'],
    current_turn_index: 0,
    phase: 'roll',
    last_dice: { d1: 1, d2: 2, total: 3, doubles: false },
    consecutive_doubles: 0,
    property_owners: { '1': 'payer' },
    property_buildings: {},
    mortgaged_properties: {},
    pending_space: null,
    pending_debt: null,
    pending_trade: null,
    last_rent_event: null,
    turn_deadline_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function playerState(id: string, cash: number, order: number, overrides: Record<string, unknown> = {}) {
  return {
    player_id: id,
    position: 1,
    cash,
    in_jail: false,
    jail_turns: 0,
    get_out_of_jail_free: 0,
    bankrupt: false,
    passed_go_once: true,
    player_order: order,
    ...overrides,
  }
}

const THREE_PLAYERS = [playerState('payer', 500, 0), playerState('owner', 800, 1), playerState('third', 300, 2)]

const BOTH_PLAYERS = [
  { id: 'payer', name: 'Ada' },
  { id: 'owner', name: 'Bola' },
]

function tradeBoardExpiring(expiresAt: string | null | undefined) {
  return baseBoard({
    pending_trade: {
      from_player_id: 'payer',
      to_player_id: 'owner',
      offer_cash: 100,
      offer_properties: [1],
      offer_get_out_cards: 0,
      request_cash: 0,
      request_properties: [],
      request_get_out_cards: 0,
      ...(expiresAt === undefined ? {} : { expires_at: expiresAt }),
    },
  })
}

const PAST = '2020-01-01T00:00:00.000Z'
const FUTURE = '2999-01-01T00:00:00.000Z'

describe('isMonopolyTradeExpired', () => {
  it('treats a trade with no deadline as never expiring', () => {
    // Offers proposed before expires_at shipped must not all lapse on deploy.
    expect(isMonopolyTradeExpired({ expires_at: undefined })).toBe(false)
    expect(isMonopolyTradeExpired({ expires_at: null })).toBe(false)
  })

  it('ignores an unparseable deadline rather than expiring instantly', () => {
    expect(isMonopolyTradeExpired({ expires_at: 'not-a-date' })).toBe(false)
  })

  it('expires exactly at the deadline, not a tick later', () => {
    const at = Date.parse('2026-01-01T00:00:00.000Z')
    expect(isMonopolyTradeExpired({ expires_at: '2026-01-01T00:00:00.000Z' }, at)).toBe(true)
    expect(isMonopolyTradeExpired({ expires_at: '2026-01-01T00:00:00.000Z' }, at - 1)).toBe(false)
  })
})

describe('repairMonopolyStalePendingTrade — response window', () => {
  it('clears an unanswered trade once the window closes', async () => {
    const m = makeMockSupabase({ board: tradeBoardExpiring(PAST), states: THREE_PLAYERS, players: BOTH_PLAYERS })
    const result = await repairMonopolyStalePendingTrade(m.supabase, 'GAME1')

    expect(result.repaired).toBe(true)
    const write = m.updates.find((u) => u.table === 'monopoly_boards')!
    expect(write.vals.pending_trade).toBeNull()
    expect(write.vals.status_message).toContain('expired')
    expect((write.vals.last_trade_event as Record<string, unknown>).outcome).toBe('expired')
  })

  it('leaves a trade still inside its window alone', async () => {
    const m = makeMockSupabase({ board: tradeBoardExpiring(FUTURE), states: THREE_PLAYERS, players: BOTH_PLAYERS })
    const result = await repairMonopolyStalePendingTrade(m.supabase, 'GAME1')

    expect(result.repaired).toBe(false)
    expect(m.updates).toHaveLength(0)
  })

  it('still clears a trade whose player left, whatever the deadline says', async () => {
    // The pre-existing repair must keep working — a departed player is a
    // separate stall from an unanswered offer.
    const m = makeMockSupabase({
      board: tradeBoardExpiring(FUTURE),
      states: THREE_PLAYERS,
      players: [{ id: 'payer', name: 'Ada' }],
    })
    const result = await repairMonopolyStalePendingTrade(m.supabase, 'GAME1')

    expect(result.repaired).toBe(true)
    expect(m.updates.find((u) => u.table === 'monopoly_boards')!.vals.status_message).toContain('left the game')
  })
})

describe('processMonopolyTradeRespond — expired offers', () => {
  it('refuses to apply a swap past its deadline', async () => {
    // The trade route lapses expired offers first, but the bot driver calls
    // this directly — a late accept must not move any assets.
    const m = makeMockSupabase({ board: tradeBoardExpiring(PAST), states: THREE_PLAYERS, players: BOTH_PLAYERS })
    const result = await processMonopolyTradeRespond(m.supabase, 'GAME1', 'owner', true)

    expect(result.error).toContain('expired')
    expect(m.rpcCalls).toHaveLength(0)
    expect(m.updates).toHaveLength(0)
  })

  it('accepts normally while the window is open', async () => {
    const m = makeMockSupabase({ board: tradeBoardExpiring(FUTURE), states: THREE_PLAYERS, players: BOTH_PLAYERS })
    const result = await processMonopolyTradeRespond(m.supabase, 'GAME1', 'owner', true)

    expect(result.error).toBeUndefined()
    expect(m.rpcCalls).toHaveLength(1)
  })
})
