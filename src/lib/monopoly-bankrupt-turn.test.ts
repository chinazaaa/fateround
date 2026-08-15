import { describe, it, expect } from 'vitest'
import { advanceMonopolyTurnPastBankrupt, isTurnHolderBankrupt } from './monopoly'
import type { MonopolyBoard, MonopolyPlayerState } from '@/types'

// Guards for the "game stalled on a bankrupt turn holder" scenario. If
// current_turn_index somehow lands on a bankrupt player (their UI is disabled
// and their bot driver returns null), the game would sit there forever.
// isTurnHolderBankrupt detects it; advanceMonopolyTurnPastBankrupt repairs it.

function board(overrides: Partial<MonopolyBoard> = {}): MonopolyBoard {
  return {
    id: 'b',
    game_id: 'G1',
    turn_order: ['a', 'b', 'c'],
    current_turn_index: 0,
    phase: 'roll',
    last_dice: null,
    consecutive_doubles: 0,
    property_owners: {},
    property_buildings: {},
    mortgaged_properties: {},
    houses_in_bank: 32,
    hotels_in_bank: 12,
    chance_deck: [],
    community_deck: [],
    chance_discard: [],
    community_discard: [],
    auction_state: null,
    pending_trade: null,
    pending_debt: null,
    pending_space: null,
    status_message: null,
    last_card_event: null,
    last_rent_event: null,
    last_cash_event: null,
    last_trade_event: null,
    turn_deadline_at: null,
    winner_player_id: null,
    created_at: '',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as MonopolyBoard
}

function pState(playerId: string, overrides: Partial<MonopolyPlayerState> = {}): MonopolyPlayerState {
  return {
    id: `ps-${playerId}`,
    game_id: 'G1',
    player_id: playerId,
    position: 0,
    cash: 1500,
    in_jail: false,
    jail_turns: 0,
    get_out_of_jail_free: 0,
    bankrupt: false,
    passed_go_once: false,
    player_order: 0,
    created_at: '',
    ...overrides,
  } as MonopolyPlayerState
}

describe('isTurnHolderBankrupt', () => {
  it('is false when the turn holder is alive', () => {
    const states = [pState('a'), pState('b'), pState('c')]
    expect(isTurnHolderBankrupt(board({ current_turn_index: 0 }), states)).toBe(false)
    expect(isTurnHolderBankrupt(board({ current_turn_index: 1 }), states)).toBe(false)
  })

  it('is true when the turn holder is bankrupt', () => {
    const states = [pState('a', { bankrupt: true }), pState('b'), pState('c')]
    expect(isTurnHolderBankrupt(board({ current_turn_index: 0 }), states)).toBe(true)
  })

  it('is true when the turn holder has no state row (removed)', () => {
    const states = [pState('b'), pState('c')]
    expect(isTurnHolderBankrupt(board({ current_turn_index: 0 }), states)).toBe(true)
  })

  it('is false when turn_order is empty', () => {
    expect(isTurnHolderBankrupt(board({ turn_order: [], current_turn_index: 0 }), [])).toBe(false)
  })
})

describe('advanceMonopolyTurnPastBankrupt', () => {
  function makeSupabase(opts: { board: MonopolyBoard; states: MonopolyPlayerState[] }) {
    const updates: Array<{ table: string; vals: Record<string, unknown> }> = []
    const chain = (table: string, oneRow: unknown, listRow: unknown) => ({
      eq() {
        return this
      },
      in() {
        return this
      },
      order() {
        return this
      },
      maybeSingle() {
        return Promise.resolve({ data: oneRow, error: null })
      },
      then(fn: (v: { data: unknown; error: null }) => unknown) {
        return Promise.resolve({ data: listRow, error: null }).then(fn)
      },
      select() {
        return this
      },
    })
    const supabase = {
      from(table: string) {
        return {
          select() {
            if (table === 'monopoly_boards') return chain(table, opts.board, [opts.board])
            if (table === 'monopoly_player_state') return chain(table, null, opts.states)
            if (table === 'games') return chain(table, { timer_seconds: 30 }, [])
            return chain(table, null, [])
          },
          update(vals: Record<string, unknown>) {
            updates.push({ table, vals })
            return {
              eq() {
                return this
              },
              select() {
                return {
                  eq() {
                    return this
                  },
                  then(fn: (v: { data: Array<{ game_id: string }>; error: null }) => unknown) {
                    return Promise.resolve({ data: [{ game_id: 'G1' }], error: null }).then(fn)
                  },
                }
              },
            }
          },
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    return { supabase, updates }
  }

  it('advances the turn off a bankrupt holder', async () => {
    const b = board({
      current_turn_index: 0,
      phase: 'roll',
      pending_debt: null,
      pending_space: null,
    })
    const states = [pState('a', { bankrupt: true }), pState('b'), pState('c')]
    const m = makeSupabase({ board: b, states })
    const result = await advanceMonopolyTurnPastBankrupt(m.supabase, 'G1')

    expect(result.advanced).toBe(true)
    const boardUpdate = m.updates.find((u) => u.table === 'monopoly_boards')
    expect(boardUpdate).toBeDefined()
    expect(boardUpdate!.vals.current_turn_index).toBe(1)
    expect(boardUpdate!.vals.phase).toBe('roll')
    expect(boardUpdate!.vals.consecutive_doubles).toBe(0)
    expect(boardUpdate!.vals.pending_debt).toBeNull()
    expect(boardUpdate!.vals.pending_space).toBeNull()
  })

  it('is a no-op when the current turn holder is alive', async () => {
    const b = board({ current_turn_index: 1 })
    const states = [pState('a', { bankrupt: true }), pState('b'), pState('c')]
    const m = makeSupabase({ board: b, states })
    const result = await advanceMonopolyTurnPastBankrupt(m.supabase, 'G1')

    expect(result.advanced).toBe(false)
    expect(m.updates.filter((u) => u.table === 'monopoly_boards')).toHaveLength(0)
  })

  it('is a no-op when the game is finished', async () => {
    const b = board({ current_turn_index: 0, phase: 'finished' })
    const states = [pState('a', { bankrupt: true }), pState('b'), pState('c')]
    const m = makeSupabase({ board: b, states })
    const result = await advanceMonopolyTurnPastBankrupt(m.supabase, 'G1')

    expect(result.advanced).toBe(false)
  })

  it('skips multiple consecutive bankrupt players', async () => {
    // Four players: a (current, bankrupt), b (bankrupt), c (alive), d (alive).
    // Two survivors so checkWinner does NOT short-circuit the advance.
    const b = board({ current_turn_index: 0, turn_order: ['a', 'b', 'c', 'd'] })
    const states = [
      pState('a', { bankrupt: true }),
      pState('b', { bankrupt: true }),
      pState('c'),
      pState('d'),
    ]
    const m = makeSupabase({ board: b, states })
    const result = await advanceMonopolyTurnPastBankrupt(m.supabase, 'G1')

    expect(result.advanced).toBe(true)
    const boardUpdate = m.updates.find((u) => u.table === 'monopoly_boards')!
    expect(boardUpdate.vals.current_turn_index).toBe(2)
  })

  it('is a no-op when only one player remains alive (winner short-circuit)', async () => {
    const b = board({ current_turn_index: 0 })
    const states = [pState('a', { bankrupt: true }), pState('b', { bankrupt: true }), pState('c')]
    const m = makeSupabase({ board: b, states })
    const result = await advanceMonopolyTurnPastBankrupt(m.supabase, 'G1')

    expect(result.advanced).toBe(false)
    expect(m.updates.filter((u) => u.table === 'monopoly_boards')).toHaveLength(0)
  })
})
