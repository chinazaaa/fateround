import { describe, it, expect } from 'vitest'
import { processMonopolyBuild, processMonopolyForfeit } from './monopoly'
import {
  MONOPOLY_HOTELS_IN_BANK,
  MONOPOLY_HOTEL_LEVEL,
  MONOPOLY_HOUSES_IN_BANK,
  MONOPOLY_HOUSES_UNDER_HOTEL,
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
    // Same call, but hands back the rejection instead of asserting success.
    tryBuild(spaceIndex: number, action: 'buy_house' | 'sell_house' | 'buy_hotel' | 'sell_hotel') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return processMonopolyBuild(supabase as any, 'GAME1', 'builder', spaceIndex, action)
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
    // Both brown sites at hotel: 5 x houseCost sunk into each (4 houses + the
    // hotel step) = £500. Selling everything must return exactly half.
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
    expect(h.cash()).toBe(250)
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

// The bank counts are conserved inventory, not free-running numbers: every house
// on the board came out of houses_in_bank, so
//   houses_in_bank + standing houses == MONOPOLY_HOUSES_IN_BANK
// must hold after any sequence of actions (and likewise for hotels). They are
// also the only scarcity constraint on building, so drift silently changes game
// balance. Clamping to [0, 32] would paper over it by minting or destroying
// houses; these tests pin the accounting instead.
// TESTS_CONSERVATION_PLACEHOLDER
describe('processMonopolyBuild — bank conservation', () => {
  it('refuses to sell a hotel the bank has too few houses to break it into', async () => {
    // Bank down to 2 houses: stepping a hotel back to 3 houses needs 3.
    const h = makeHarness({
      buildings: { [String(BROWN_A)]: MONOPOLY_HOTEL_LEVEL, [String(BROWN_B)]: MONOPOLY_HOTEL_LEVEL },
      cash: 1000,
      houses: MONOPOLY_HOUSES_UNDER_HOTEL - 1,
      hotels: MONOPOLY_HOTELS_IN_BANK - 2,
    })

    const result = await h.tryBuild(BROWN_A, 'sell_hotel')

    // Previously this went through and left houses_in_bank at -1.
    expect(result.error).toBe('The bank has too few houses to break this hotel into — mortgage or forfeit instead')
    expect(h.houses()).toBe(MONOPOLY_HOUSES_UNDER_HOTEL - 1)
    expect(h.buildings()[String(BROWN_A)]).toBe(MONOPOLY_HOTEL_LEVEL)
    expect(h.cash()).toBe(1000)
  })

  it('allows the sale at exactly three houses, landing the bank on zero', async () => {
    const h = makeHarness({
      buildings: { [String(BROWN_A)]: MONOPOLY_HOTEL_LEVEL, [String(BROWN_B)]: MONOPOLY_HOTEL_LEVEL },
      cash: 1000,
      houses: MONOPOLY_HOUSES_UNDER_HOTEL,
      hotels: MONOPOLY_HOTELS_IN_BANK - 2,
    })

    await h.build(BROWN_A, 'sell_hotel')

    // The boundary is a floor, not a rejection: zero is a legal bank state.
    expect(h.houses()).toBe(0)
    expect(h.buildings()[String(BROWN_A)]).toBe(MONOPOLY_MAX_HOUSES_PER_PROPERTY)
  })

  it('credits every house standing on a legacy level-4 site when it upgrades to a hotel', async () => {
    // canAddHotel still admits level 4 for boards saved before the 3-house cap.
    // buy_hotel used to credit a hardcoded 3, quietly losing the 4th house.
    const LEGACY_LEVEL_4 = 4
    const h = makeHarness({
      buildings: { [String(BROWN_A)]: LEGACY_LEVEL_4, [String(BROWN_B)]: MONOPOLY_HOTEL_LEVEL },
      cash: 1000,
      houses: MONOPOLY_HOUSES_IN_BANK - LEGACY_LEVEL_4,
      hotels: MONOPOLY_HOTELS_IN_BANK - 1,
    })

    await h.build(BROWN_A, 'buy_hotel')

    // All four come back, so the invariant still closes: 0 standing, bank full.
    expect(h.houses()).toBe(MONOPOLY_HOUSES_IN_BANK)
    expect(h.buildings()[String(BROWN_A)]).toBe(MONOPOLY_HOTEL_LEVEL)
  })

  it('keeps houses_in_bank inside [0, 32] across a full build-up and tear-down', async () => {
    const h = makeHarness({ buildings: {}, cash: 2000 })
    const standing = () =>
      Object.values(h.buildings()).reduce((sum, level) => sum + (level === MONOPOLY_HOTEL_LEVEL ? 0 : level), 0)
    const check = () => {
      expect(h.houses()).toBeGreaterThanOrEqual(0)
      expect(h.houses()).toBeLessThanOrEqual(MONOPOLY_HOUSES_IN_BANK)
      expect(h.hotels()).toBeGreaterThanOrEqual(0)
      expect(h.hotels()).toBeLessThanOrEqual(MONOPOLY_HOTELS_IN_BANK)
      // The real constraint: nothing is minted or destroyed along the way.
      expect(h.houses() + standing()).toBe(MONOPOLY_HOUSES_IN_BANK)
    }

    for (let i = 0; i < MONOPOLY_MAX_HOUSES_PER_PROPERTY; i++) {
      await h.build(BROWN_A, 'buy_house')
      check()
      await h.build(BROWN_B, 'buy_house')
      check()
    }
    for (const site of [BROWN_A, BROWN_B]) {
      await h.build(site, 'buy_hotel')
      check()
      await h.build(site, 'sell_hotel')
      check()
    }
    for (let i = 0; i < MONOPOLY_MAX_HOUSES_PER_PROPERTY; i++) {
      await h.build(BROWN_A, 'sell_house')
      check()
      await h.build(BROWN_B, 'sell_house')
      check()
    }

    expect(h.houses()).toBe(MONOPOLY_HOUSES_IN_BANK)
    expect(h.hotels()).toBe(MONOPOLY_HOTELS_IN_BANK)
  })
})

describe('bankruptcy — returning a hotel site to the bank', () => {
  it('returns the hotel only, since the houses under it went back when it was built', async () => {
    // Debtor owns a hotel on BROWN_A. buy_hotel already returned the three
    // houses beneath it, so the bank is short one hotel and nothing else.
    const board: Record<string, unknown> = {
      game_id: 'GAME1',
      turn_order: ['debtor', 'creditor'],
      current_turn_index: 0,
      phase: 'raise_funds',
      property_owners: { [String(BROWN_A)]: 'debtor', [String(BROWN_B)]: 'creditor' },
      property_buildings: { [String(BROWN_A)]: MONOPOLY_HOTEL_LEVEL },
      mortgaged_properties: {},
      houses_in_bank: MONOPOLY_HOUSES_IN_BANK,
      hotels_in_bank: MONOPOLY_HOTELS_IN_BANK - 1,
      pending_space: BROWN_B,
      pending_debt: {
        player_id: 'debtor',
        creditor_player_id: 'creditor',
        amount: 4,
        reason: 'Owe £4 rent on Whitechapel Road',
        debt_type: 'rent',
        space_index: BROWN_B,
      },
      pending_trade: null,
      turn_deadline_at: null,
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    const states = [
      {
        player_id: 'debtor',
        position: 3,
        cash: 3,
        in_jail: false,
        bankrupt: false,
        player_order: 0,
        get_out_of_jail_free: 0,
      },
      {
        player_id: 'creditor',
        position: 0,
        cash: 800,
        in_jail: false,
        bankrupt: false,
        player_order: 1,
        get_out_of_jail_free: 0,
      },
    ]

    const rpcCalls: Array<Record<string, unknown>> = []
    function selectChain(table: string) {
      const filters: Record<string, unknown> = {}
      const chain = {
        eq(col: string, val: unknown) {
          filters[col] = val
          return chain
        },
        in: () => chain,
        order: () => chain,
        maybeSingle(): Promise<Row> {
          if (table === 'monopoly_boards') return Promise.resolve({ data: board, error: null })
          if (table === 'games') return Promise.resolve({ data: { timer_seconds: 30 }, error: null })
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
            table === 'monopoly_player_state'
              ? { data: states, error: null }
              : table === 'players'
                ? { data: [], error: null }
                : { data: null, error: null }
          return Promise.resolve(list).then(onFulfilled, onRejected)
        },
      }
      return chain
    }
    const supabase = {
      from: (table: string) => ({
        select: () => selectChain(table),
        update: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }),
      }),
      rpc(_fn: string, params: Record<string, unknown>) {
        rpcCalls.push(params)
        return Promise.resolve({ data: true, error: null })
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processMonopolyForfeit(supabase as any, 'GAME1', 'debtor')
    expect(result.error).toBeUndefined()

    const patch = rpcCalls[0]!.p_board_patch as Record<string, unknown>
    // Used to credit MONOPOLY_HOUSES_UNDER_HOTEL here too, minting 3 phantom
    // houses per hotel and pushing the bank past its cap on every bankruptcy.
    expect(patch.houses_in_bank).toBe(MONOPOLY_HOUSES_IN_BANK)
    expect(patch.hotels_in_bank).toBe(MONOPOLY_HOTELS_IN_BANK)
    expect(patch.property_buildings).toEqual({})
  })
})
