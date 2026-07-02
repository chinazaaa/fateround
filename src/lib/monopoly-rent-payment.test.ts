import { describe, it, expect } from 'vitest'
import { processMonopolyPayRent, processMonopolySettleDebt } from './monopoly'

// Rent used to be settled as three separate writes: a board CAS claim, then an
// absolute cash UPDATE for the payer, then one for the owner. Any failure or
// concurrent absolute cash write in that window lost the transfer — players saw
// rent "not paid" or "paid but the owner never received it". These tests pin
// that the handlers now route the claim + both cash movements through the
// atomic monopoly_settle_payment RPC and never issue direct cash writes.

type Row = { data: unknown; error: unknown }

function makeMockSupabase(opts: {
  board: Record<string, unknown>
  states: Array<Record<string, unknown>>
  rpcResult?: { data: unknown; error: { message: string } | null }
}) {
  const updates: Array<{ table: string; vals: Record<string, unknown> }> = []
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []

  // Chainable + awaitable stand-in for reads. `.eq()` filters are recorded so
  // per-player maybeSingle() lookups resolve to the right state row, while
  // awaiting the chain directly resolves the full list.
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
      order() {
        return chain
      },
      maybeSingle() {
        return Promise.resolve(single())
      },
      then(onFulfilled?: (v: Row) => unknown, onRejected?: (e: unknown) => unknown) {
        const list: Row =
          table === 'monopoly_player_state' ? { data: opts.states, error: null } : { data: null, error: null }
        return Promise.resolve(list).then(onFulfilled, onRejected)
      },
    }
    return chain
  }

  // Update chains end in .eq().eq().select('game_id') and are awaited; a
  // non-empty data array counts as "won the CAS claim".
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

// Space 1 = Old Kent Road (base rent £2), owned by "owner"; "payer" is on it
// with the pay_rent phase pending.
function baseBoard(overrides: Record<string, unknown> = {}) {
  return {
    game_id: 'GAME1',
    turn_order: ['payer', 'owner'],
    current_turn_index: 0,
    phase: 'pay_rent',
    last_dice: { d1: 1, d2: 2, total: 3, doubles: false },
    consecutive_doubles: 0,
    property_owners: { '1': 'owner' },
    property_buildings: {},
    mortgaged_properties: {},
    pending_space: 1,
    pending_debt: null,
    last_rent_event: null,
    turn_deadline_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function playerState(id: string, cash: number, overrides: Record<string, unknown> = {}) {
  return {
    player_id: id,
    position: 1,
    cash,
    in_jail: false,
    jail_turns: 0,
    get_out_of_jail_free: 0,
    bankrupt: false,
    passed_go_once: true,
    player_order: id === 'payer' ? 0 : 1,
    ...overrides,
  }
}

describe('processMonopolyPayRent — atomic settlement', () => {
  it('settles rent through the atomic RPC and issues no direct cash writes', async () => {
    const m = makeMockSupabase({ board: baseBoard(), states: [playerState('payer', 500), playerState('owner', 800)] })
    const result = await processMonopolyPayRent(m.supabase, 'GAME1', 'payer')

    expect(result.error).toBeUndefined()
    expect(m.rpcCalls).toHaveLength(1)
    expect(m.rpcCalls[0]!.fn).toBe('monopoly_settle_payment')
    const params = m.rpcCalls[0]!.params
    expect(params.p_payer_id).toBe('payer')
    expect(params.p_creditor_id).toBe('owner')
    expect(params.p_amount).toBe(2) // Old Kent Road base rent
    expect(params.p_expected_updated_at).toBe('2026-01-01T00:00:00.000Z')
    expect(params.p_last_rent_event).toMatchObject({ payer_player_id: 'payer', owner_player_id: 'owner', amount: 2 })
    // The transfer must live entirely inside the RPC transaction.
    expect(m.updates.filter((u) => u.table === 'monopoly_player_state')).toHaveLength(0)
    expect(m.updates.filter((u) => u.table === 'monopoly_boards')).toHaveLength(0)
  })

  it('treats a lost claim as already settled (no retries, no cash writes)', async () => {
    const m = makeMockSupabase({
      board: baseBoard(),
      states: [playerState('payer', 500), playerState('owner', 800)],
      rpcResult: { data: false, error: null },
    })
    const result = await processMonopolyPayRent(m.supabase, 'GAME1', 'payer')

    expect(result.error).toBeUndefined()
    expect(m.rpcCalls).toHaveLength(1)
    expect(m.updates).toHaveLength(0)
  })

  it('enters raise-funds without touching the RPC when the payer cannot afford rent', async () => {
    const m = makeMockSupabase({ board: baseBoard(), states: [playerState('payer', 1), playerState('owner', 800)] })
    const result = await processMonopolyPayRent(m.supabase, 'GAME1', 'payer')

    expect(result.error).toBeUndefined()
    expect(m.rpcCalls).toHaveLength(0)
    const boardUpdate = m.updates.find((u) => u.table === 'monopoly_boards')
    expect(boardUpdate).toBeTruthy()
    expect(boardUpdate!.vals.phase).toBe('raise_funds')
    expect(boardUpdate!.vals.pending_debt).toMatchObject({ player_id: 'payer', creditor_player_id: 'owner', amount: 2 })
  })

  it('falls back to raise-funds when the RPC reports the cash vanished mid-flight', async () => {
    const m = makeMockSupabase({
      board: baseBoard(),
      states: [playerState('payer', 500), playerState('owner', 800)],
      rpcResult: { data: null, error: { message: 'INSUFFICIENT_FUNDS' } },
    })
    const result = await processMonopolyPayRent(m.supabase, 'GAME1', 'payer')

    expect(result.error).toBeUndefined()
    const boardUpdate = m.updates.find((u) => u.table === 'monopoly_boards')
    expect(boardUpdate).toBeTruthy()
    expect(boardUpdate!.vals.phase).toBe('raise_funds')
    // No direct cash write may accompany the fallback.
    expect(m.updates.filter((u) => u.table === 'monopoly_player_state')).toHaveLength(0)
  })

  it('surfaces unexpected RPC failures so the payment can be retried (phase not consumed)', async () => {
    const m = makeMockSupabase({
      board: baseBoard(),
      states: [playerState('payer', 500), playerState('owner', 800)],
      rpcResult: { data: null, error: { message: 'connection reset' } },
    })
    const result = await processMonopolyPayRent(m.supabase, 'GAME1', 'payer')

    expect(result.error).toBeTruthy()
    expect(m.updates).toHaveLength(0)
  })
})

describe('processMonopolySettleDebt — atomic settlement', () => {
  it('settles a jail debt through the RPC with the jail-release flag', async () => {
    const m = makeMockSupabase({
      board: baseBoard({
        phase: 'raise_funds',
        pending_space: null,
        pending_debt: {
          player_id: 'payer',
          creditor_player_id: null,
          amount: 50,
          reason: 'Need £50 to leave jail',
          debt_type: 'jail',
          space_index: 10,
        },
      }),
      states: [playerState('payer', 200, { in_jail: true, jail_turns: 3 }), playerState('owner', 800)],
    })
    const result = await processMonopolySettleDebt(m.supabase, 'GAME1', 'payer')

    expect(result.error).toBeUndefined()
    expect(m.rpcCalls).toHaveLength(1)
    const params = m.rpcCalls[0]!.params
    expect(params.p_amount).toBe(50)
    expect(params.p_creditor_id).toBeNull()
    expect(params.p_payer_leaves_jail).toBe(true)
    expect(m.updates).toHaveLength(0)
  })
})
