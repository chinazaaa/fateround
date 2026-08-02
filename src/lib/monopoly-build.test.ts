import { describe, it, expect } from 'vitest'
import { processMonopolyBuild } from './monopoly'
import {
  MONOPOLY_HOTELS_IN_BANK,
  MONOPOLY_HOTEL_LEVEL,
  MONOPOLY_HOUSES_IN_BANK,
  MONOPOLY_MAX_HOUSES_PER_PROPERTY,
} from './monopoly-board'

// `sell_hotel` used to refund the hotel PLUS the three houses underneath, while
// `buy_hotel` only charged for the hotel step. Since selling steps the site back
// down to MAX_HOUSES_PER_PROPERTY and restores both bank counts, the round trip
// left the board byte-identical and netted the player a full house cost — an
// unbounded money printer behind the existing "Sell hotel" button. These tests
// pin every build step to a half-cost refund and assert the buy/sell round trips
// are strictly lossy.

type Row = { data: unknown; error: unknown }

// Old Kent Road (1) and Whitechapel Road (3) are the brown group — the whole
// group must be owned to build, and the even-build rule spans both sites.
const BROWN_A = 1
const BROWN_B = 3
const HOUSE_COST = 50

function makeHarness(opts: { buildings: Record<string, number>; cash: number; houses?: number; hotels?: number }) {
  const board: Record<string, unknown> = {
    game_id: 'GAME1',
    turn_order: ['builder', 'rival'],
    current_turn_index: 0,
    phase: 'roll',
    property_owners: { [String(BROWN_A)]: 'builder', [String(BROWN_B)]: 'builder' },
    property_buildings: { ...opts.buildings },
    mortgaged_properties: {},
    houses_in_bank: opts.houses ?? MONOPOLY_HOUSES_IN_BANK,
    hotels_in_bank: opts.hotels ?? MONOPOLY_HOTELS_IN_BANK,
    pending_space: null,
    pending_debt: null,
    updated_at: '2026-01-01T00:00:00.000Z',
  }
  const states: Array<Record<string, unknown>> = [
    { player_id: 'builder', position: 0, cash: opts.cash, in_jail: false, bankrupt: false, player_order: 0 },
    { player_id: 'rival', position: 0, cash: 1500, in_jail: false, bankrupt: false, player_order: 1 },
  ]

  function selectChain(table: string) {
    const filters: Record<string, unknown> = {}
    const chain = {
      eq(col: string, val: unknown) {
        filters[col] = val
        return chain
      },
      maybeSingle(): Promise<Row> {
        if (table === 'monopoly_boards') return Promise.resolve({ data: board, error: null })
        if (table === 'monopoly_player_state') {
          return Promise.resolve({
            data: states.find((s) => s.player_id === filters['player_id']) ?? null,
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then(onFulfilled?: (v: Row) => unknown, onRejected?: (e: unknown) => unknown) {
        const list: Row =
          table === 'monopoly_player_state' ? { data: states, error: null } : { data: null, error: null }
        return Promise.resolve(list).then(onFulfilled, onRejected)
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
      }
    },
    // Stateful stand-in for monopoly_claim_and_apply: applies the patches in
    // memory so a sequence of builds sees the board its predecessor left behind.
    rpc(_fn: string, params: Record<string, unknown>) {
      Object.assign(board, params.p_board_patch as Record<string, unknown>)
      for (const patch of params.p_player_patches as Array<Record<string, unknown>>) {
        const target = states.find((s) => s.player_id === patch.player_id)
        if (target) Object.assign(target, patch)
      }
      return Promise.resolve({ data: true, error: null })
    },
  }

  return {
    async build(spaceIndex: number, action: 'buy_house' | 'sell_house' | 'buy_hotel' | 'sell_hotel') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await processMonopolyBuild(supabase as any, 'GAME1', 'builder', spaceIndex, action)
      expect(result.error).toBeUndefined()
    },
    cash: () => states.find((s) => s.player_id === 'builder')!.cash as number,
    buildings: () => board.property_buildings as Record<string, number>,
    houses: () => board.houses_in_bank as number,
    hotels: () => board.hotels_in_bank as number,
  }
}

describe('processMonopolyBuild — hotel economy', () => {
  it('charges the hotel step alone on buy, and refunds half of that step on sell', async () => {
    const h = makeHarness({
      buildings: { [String(BROWN_A)]: MONOPOLY_MAX_HOUSES_PER_PROPERTY, [String(BROWN_B)]: MONOPOLY_HOTEL_LEVEL },
      cash: 1000,
      houses: MONOPOLY_HOUSES_IN_BANK - MONOPOLY_MAX_HOUSES_PER_PROPERTY,
      hotels: MONOPOLY_HOTELS_IN_BANK - 1,
    })

    await h.build(BROWN_A, 'buy_hotel')
    expect(h.cash()).toBe(1000 - HOUSE_COST)
    expect(h.buildings()[String(BROWN_A)]).toBe(MONOPOLY_HOTEL_LEVEL)

    await h.build(BROWN_A, 'sell_hotel')
    // Half the hotel step — NOT half the hotel plus half of all three houses,
    // which stay standing on the site.
    expect(h.cash()).toBe(1000 - HOUSE_COST + Math.floor(HOUSE_COST / 2))
    expect(h.buildings()[String(BROWN_A)]).toBe(MONOPOLY_MAX_HOUSES_PER_PROPERTY)
  })

  it('cannot be farmed for cash: repeated buy_hotel/sell_hotel strictly loses money', async () => {
    const h = makeHarness({
      buildings: { [String(BROWN_A)]: MONOPOLY_MAX_HOUSES_PER_PROPERTY, [String(BROWN_B)]: MONOPOLY_HOTEL_LEVEL },
      cash: 1000,
      houses: MONOPOLY_HOUSES_IN_BANK - MONOPOLY_MAX_HOUSES_PER_PROPERTY,
      hotels: MONOPOLY_HOTELS_IN_BANK - 1,
    })
    const before = { buildings: JSON.stringify(h.buildings()), houses: h.houses(), hotels: h.hotels() }

    // The old refund made each cycle worth +£50 with the board unchanged:
    // 1000 -> 1050 -> 1100 -> 1150. Each cycle must now cost half a house.
    const seen: number[] = []
    for (let i = 0; i < 3; i++) {
      await h.build(BROWN_A, 'buy_hotel')
      await h.build(BROWN_A, 'sell_hotel')
      seen.push(h.cash())
    }

    expect(seen).toEqual([975, 950, 925])
    // Board state restored exactly — which is precisely why an unbounded loop
    // was possible, so the cash drain is the only thing holding the line.
    expect(JSON.stringify(h.buildings())).toBe(before.buildings)
    expect(h.houses()).toBe(before.houses)
    expect(h.hotels()).toBe(before.hotels)
  })

  it('returns half the total build cost when a hotel site is fully liquidated', async () => {
    // Both brown sites at hotel: 4 x houseCost sunk into each (3 houses + the
    // hotel step) = £400. Selling everything must return exactly half.
    const h = makeHarness({
      buildings: { [String(BROWN_A)]: MONOPOLY_HOTEL_LEVEL, [String(BROWN_B)]: MONOPOLY_HOTEL_LEVEL },
      cash: 0,
      houses: MONOPOLY_HOUSES_IN_BANK,
      hotels: MONOPOLY_HOTELS_IN_BANK - 2,
    })

    await h.build(BROWN_A, 'sell_hotel')
    await h.build(BROWN_B, 'sell_hotel')
    // Even-build rule applies on the way down too, so the sites alternate.
    for (let i = 0; i < MONOPOLY_MAX_HOUSES_PER_PROPERTY; i++) {
      await h.build(BROWN_A, 'sell_house')
      await h.build(BROWN_B, 'sell_house')
    }

    // Matches computePlayerEstateValue's houseCost x (HOUSES_UNDER_HOTEL + 1) / 2
    // per site, so incremental selling and bulk liquidation agree.
    expect(h.cash()).toBe(200)
    expect(h.buildings()[String(BROWN_A)]).toBe(0)
    expect(h.buildings()[String(BROWN_B)]).toBe(0)
    expect(h.houses()).toBe(MONOPOLY_HOUSES_IN_BANK)
    expect(h.hotels()).toBe(MONOPOLY_HOTELS_IN_BANK)
  })

  it('keeps the house round trip lossy too', async () => {
    const h = makeHarness({ buildings: {}, cash: 1000 })

    await h.build(BROWN_A, 'buy_house')
    expect(h.cash()).toBe(1000 - HOUSE_COST)
    expect(h.houses()).toBe(MONOPOLY_HOUSES_IN_BANK - 1)

    await h.build(BROWN_A, 'sell_house')
    expect(h.cash()).toBe(1000 - Math.floor(HOUSE_COST / 2))
    expect(h.buildings()[String(BROWN_A)]).toBe(0)
    expect(h.houses()).toBe(MONOPOLY_HOUSES_IN_BANK)
  })
})
