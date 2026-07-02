import { describe, it, expect } from 'vitest'
import { processMonopolyForfeit, processMonopolyMortgage, processMonopolyTradeRespond } from './monopoly'

// Card payouts, trades, auction debits, and bankruptcy transfers used the same
// claim-then-write pattern rent had: CAS the board, then issue separate
// absolute cash UPDATEs from pre-claim reads, errors unchecked. These tests pin
// that the handlers now route every player-state write through the atomic
// monopoly_claim_and_apply RPC — as cash/card DELTAS for transfers — and never
// touch monopoly_player_state directly.

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

describe('processMonopolyTradeRespond — atomic swap', () => {
  const tradeBoard = () =>
    baseBoard({
      pending_trade: {
        from_player_id: 'payer',
        to_player_id: 'owner',
        offer_cash: 100,
        offer_properties: [1],
        offer_get_out_cards: 0,
        request_cash: 0,
        request_properties: [],
        request_get_out_cards: 0,
      },
    })

  it('moves cash/cards as symmetric deltas in one RPC, no direct player writes', async () => {
    const m = makeMockSupabase({ board: tradeBoard(), states: THREE_PLAYERS })
    const result = await processMonopolyTradeRespond(m.supabase, 'GAME1', 'owner', true)

    expect(result.error).toBeUndefined()
    expect(m.rpcCalls).toHaveLength(1)
    expect(m.rpcCalls[0]!.fn).toBe('monopoly_claim_and_apply')
    const params = m.rpcCalls[0]!.params
    expect((params.p_board_patch as Record<string, unknown>).pending_trade).toBeNull()
    expect(((params.p_board_patch as Record<string, unknown>).property_owners as Record<string, string>)['1']).toBe(
      'owner'
    )
    expect(params.p_player_patches).toEqual([
      { player_id: 'payer', cash_delta: -100, cards_delta: 0 },
      { player_id: 'owner', cash_delta: 100, cards_delta: 0 },
    ])
    expect(m.updates.filter((u) => u.table === 'monopoly_player_state')).toHaveLength(0)
  })

  it('surfaces a friendly error when funds vanished before the swap committed', async () => {
    const m = makeMockSupabase({
      board: tradeBoard(),
      states: THREE_PLAYERS,
      rpcResult: { data: null, error: { message: 'INSUFFICIENT_FUNDS' } },
    })
    const result = await processMonopolyTradeRespond(m.supabase, 'GAME1', 'owner', true)

    expect(result.error).toContain('Trade failed')
    expect(m.updates).toHaveLength(0)
  })
})

describe('updatePlayerAndBoard-backed handlers — atomic claim', () => {
  it('mortgage routes the board patch and cash credit through the RPC', async () => {
    const m = makeMockSupabase({ board: baseBoard(), states: THREE_PLAYERS })
    const result = await processMonopolyMortgage(m.supabase, 'GAME1', 'payer', 1, 'mortgage')

    expect(result.error).toBeUndefined()
    expect(m.rpcCalls).toHaveLength(1)
    expect(m.rpcCalls[0]!.fn).toBe('monopoly_claim_and_apply')
    const params = m.rpcCalls[0]!.params
    // Old Kent Road: price £60 → mortgage value £30.
    expect(params.p_player_patches).toEqual([{ player_id: 'payer', cash: 530 }])
    expect(((params.p_board_patch as Record<string, unknown>).mortgaged_properties as Record<string, boolean>)['1']).toBe(
      true
    )
    expect(m.updates.filter((u) => u.table === 'monopoly_player_state')).toHaveLength(0)
  })
})

describe('processMonopolyForfeit — atomic bankruptcy transfer', () => {
  it('credits the creditor by delta and resets the bankrupt player in one RPC', async () => {
    const m = makeMockSupabase({
      board: baseBoard({
        phase: 'raise_funds',
        property_owners: { '3': 'owner' },
        pending_space: 3,
        pending_debt: {
          player_id: 'payer',
          creditor_player_id: 'owner',
          amount: 4,
          reason: 'Owe £4 rent on Whitechapel Road',
          debt_type: 'rent',
          space_index: 3,
        },
      }),
      states: [playerState('payer', 3, 0, { get_out_of_jail_free: 1 }), playerState('owner', 800, 1), playerState('third', 300, 2)],
    })
    const result = await processMonopolyForfeit(m.supabase, 'GAME1', 'payer')

    expect(result.error).toBeUndefined()
    expect(m.rpcCalls).toHaveLength(1)
    expect(m.rpcCalls[0]!.fn).toBe('monopoly_claim_and_apply')
    const params = m.rpcCalls[0]!.params
    expect(params.p_player_patches).toEqual([
      { player_id: 'owner', cash_delta: 3, cards_delta: 1 },
      { player_id: 'payer', cash: 0, bankrupt: true, in_jail: false, get_out_of_jail_free: 0 },
    ])
    expect((params.p_board_patch as Record<string, unknown>).pending_debt).toBeNull()
    expect(m.updates.filter((u) => u.table === 'monopoly_player_state')).toHaveLength(0)
  })
})
