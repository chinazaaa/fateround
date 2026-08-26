import { describe, expect, it } from 'vitest'
import {
  MONOPOLY_BOARD,
  MONOPOLY_EXPANDED_BOARD,
  MONOPOLY_MAX_PLAYERS,
  goSalaryForSize,
  housesInBankForSize,
  hotelsInBankForSize,
  monopolyGoToJailPosition,
  monopolyJailPosition,
  ownsColorMonopoly,
  spaceAt,
  spacesInGroup,
  startingCashForSize,
} from '@/lib/monopoly-board'
import {
  movePosition,
  computeMonopolyNetWorth,
  resolveMonopolyWinnerId,
  buildMonopolyStandings,
  resolveSpaceLanding,
} from '@/lib/monopoly'
import { boardGridCell } from '@/components/monopoly/monopoly-ui'
import { themedSpaceName } from '@/components/monopoly/monopoly-themes'
import { buildColorGroupStatuses } from '@/lib/monopoly-color-portfolio'
import { formatTradeSideText, tradeSideHasValue } from '@/lib/monopoly-trade-messages'

describe('Estate Kings expanded board', () => {
  it('supports nine players while preserving the classic board', () => {
    expect(MONOPOLY_MAX_PLAYERS).toBe(9)
    expect(MONOPOLY_BOARD).toHaveLength(40)
    expect(spaceAt(10).type).toBe('jail')
  })

  it('has 48 unique squares and quarter-board corners', () => {
    expect(MONOPOLY_EXPANDED_BOARD).toHaveLength(48)
    expect(new Set(MONOPOLY_EXPANDED_BOARD.map((space) => space.index)).size).toBe(48)
    expect([0, 12, 24, 36].map((index) => spaceAt(index, 48).type)).toEqual([
      'go',
      'jail',
      'free_parking',
      'go_to_jail',
    ])
    expect(monopolyJailPosition(48)).toBe(12)
    expect(monopolyGoToJailPosition(48)).toBe(36)
  })

  it('wraps movement at the selected board size', () => {
    expect(movePosition(46, 4, 48)).toEqual({ to: 2, passedGo: true })
    expect(movePosition(38, 4, 40)).toEqual({ to: 2, passedGo: true })
  })

  it('maps the expanded perimeter to a 13 by 13 grid', () => {
    expect([0, 12, 24, 36].map((index) => boardGridCell(index, 48))).toEqual([
      { col: 13, row: 13 },
      { col: 1, row: 13 },
      { col: 1, row: 1 },
      { col: 13, row: 1 },
    ])
  })

  it('matches the deliberate 3/2/3 street estate pattern', () => {
    const expectedGroupSizes = {
      brown: 2,
      violet: 2,
      teal: 2,
      dark_blue: 2,
      light_blue: 3,
      orange: 3,
      pink: 3,
      indigo: 3,
      red: 3,
      yellow: 3,
      green: 3,
      coral: 3,
    } as const
    for (const [group, size] of Object.entries(expectedGroupSizes)) {
      expect(spacesInGroup(group as keyof typeof expectedGroupSizes, 48)).toHaveLength(size)
    }
    expect(MONOPOLY_EXPANDED_BOARD.filter((space) => space.type === 'station')).toHaveLength(4)
    expect(MONOPOLY_EXPANDED_BOARD.filter((space) => space.type === 'utility')).toHaveLength(2)
    expect(MONOPOLY_EXPANDED_BOARD.filter((space) => space.type === 'chance')).toHaveLength(2)
    expect(MONOPOLY_EXPANDED_BOARD.filter((space) => space.type === 'community')).toHaveLength(3)
    expect(MONOPOLY_EXPANDED_BOARD.filter((space) => space.type === 'tax')).toHaveLength(1)
    const sites = spacesInGroup('light_blue', 48)
    const owners = Object.fromEntries(sites.map((space) => [String(space.index), 'owner']))
    expect(sites).toHaveLength(3)
    expect(ownsColorMonopoly(owners, 'owner', 'light_blue', 48)).toBe(true)
    delete owners[String(sites.at(-1)!.index)]
    expect(ownsColorMonopoly(owners, 'owner', 'light_blue', 48)).toBe(false)
  })

  it('keeps every added edition label within the board fit limit', () => {
    const classicNames = new Set(MONOPOLY_BOARD.map((space) => space.name))
    const expandedOnly = MONOPOLY_EXPANDED_BOARD.filter((space) => !classicNames.has(space.name))
    for (const themeId of ['classic', 'pirate', 'arctic', 'naija'] as const) {
      for (const space of expandedOnly) {
        expect(themedSpaceName(space.name, space.index, themeId, 48).length).toBeLessThanOrEqual(16)
      }
    }
  })

  it('filters empty color groups on 40-space board and includes all 12 on 48-space board', () => {
    const playerNames = new Map([['p1', 'Alice']])
    const status40 = buildColorGroupStatuses({}, 'p1', playerNames, 40)
    expect(status40).toHaveLength(10) // 8 classic estate color groups + station + utility
    expect(status40.every((g) => g.total > 0)).toBe(true)

    const status48 = buildColorGroupStatuses({}, 'p1', playerNames, 48)
    expect(status48).toHaveLength(14) // 12 expanded estate color groups + station + utility
    expect(status48.every((g) => g.total > 0)).toBe(true)
  })

  it('formats trade side text with properties above index 40 on 48-space board', () => {
    expect(tradeSideHasValue(0, [46, 47], 0, 48)).toBe(true)
    expect(tradeSideHasValue(0, [46, 47], 0, 40)).toBe(false)

    const text48 = formatTradeSideText(100, [46, 47], 1, 'default', 48)
    expect(text48).toContain('Regent Street')
    expect(text48).toContain('Mayfair Mews')
    expect(text48).toContain('1 skip-the-queue card')

    const text48Naija = formatTradeSideText(0, [1, 47], 0, 'naija', 48)
    expect(text48Naija).toBe('Oshodi Market · Banana Island')
  })

  it('computes net worth and standings accurately for expanded board early finish', () => {
    const p1State = {
      id: 's1',
      game_id: 'g1',
      player_id: 'p1',
      cash: 500,
      in_jail: false,
      jail_turns: 0,
      get_out_of_jail_free: 0,
      bankrupt: false,
      position: 0,
      passed_go_once: true,
      player_order: 0,
      created_at: new Date().toISOString(),
    }
    const p2State = {
      id: 's2',
      game_id: 'g1',
      player_id: 'p2',
      cash: 100,
      in_jail: false,
      jail_turns: 0,
      get_out_of_jail_free: 0,
      bankrupt: false,
      position: 0,
      passed_go_once: true,
      player_order: 1,
      created_at: new Date().toISOString(),
    }
    // p2 owns index 46 (Regent Street: £400) and index 47 (Mayfair Mews: £410) on 48-space board
    const owners = { '46': 'p2', '47': 'p2' }
    const buildings = {}
    const mortgaged = {}

    const netWorthP1 = computeMonopolyNetWorth(p1State, owners, buildings, mortgaged, 48)
    const netWorthP2 = computeMonopolyNetWorth(p2State, owners, buildings, mortgaged, 48)
    expect(netWorthP1).toBe(500)
    expect(netWorthP2).toBe(100 + 400 + 410) // 910

    const winner = resolveMonopolyWinnerId([p1State, p2State], owners, buildings, mortgaged, null, 48)
    expect(winner).toBe('p2')

    const standings = buildMonopolyStandings(
      [p1State, p2State],
      [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ],
      owners,
      buildings,
      mortgaged,
      48
    )
    expect(standings[0].playerId).toBe('p2')
    expect(standings[0].rank).toBe(1)
    expect(standings[0].netWorth).toBe(910)
  })

  it('sends player to correct jail index (12 on 48-space, 10 on 40-space) when landing on go_to_jail', () => {
    // 48-space board: index 36 is OFF TO NICKED (go_to_jail) -> sends to index 12 (NICKED)
    const res48 = resolveSpaceLanding(spaceAt(36, 48), {
      cash: 1500,
      position: 36,
      inJail: false,
      jailTurns: 0,
      getOutCards: 0,
      playerId: 'p1',
      owners: {},
      buildings: {},
      mortgaged: {},
      states: [],
      diceTotal: 4,
      extraTurn: false,
      passedGoOnce: true,
      boardSize: 48,
    })
    expect(res48.position).toBe(12)
    expect(res48.inJail).toBe(true)

    // 40-space board: index 30 is OFF TO JAIL (go_to_jail) -> sends to index 10 (JAIL)
    const res40 = resolveSpaceLanding(spaceAt(30, 40), {
      cash: 1500,
      position: 30,
      inJail: false,
      jailTurns: 0,
      getOutCards: 0,
      playerId: 'p1',
      owners: {},
      buildings: {},
      mortgaged: {},
      states: [],
      diceTotal: 4,
      extraTurn: false,
      passedGoOnce: true,
      boardSize: 40,
    })
    expect(res40.position).toBe(10)
    expect(res40.inJail).toBe(true)
  })

  it('scales bank houses and hotels proportionally for 48-space board', () => {
    expect(housesInBankForSize(40)).toBe(32)
    expect(hotelsInBankForSize(40)).toBe(12)

    expect(housesInBankForSize(48)).toBe(48)
    expect(hotelsInBankForSize(48)).toBe(18)
  })

  it('quadruples starting capital per player for 48-space board (6000 vs 1500)', () => {
    expect(startingCashForSize(40)).toBe(1500)
    expect(startingCashForSize(48)).toBe(6000)
  })

  it('quadruples the PAYDAY salary for 48-space board (800 vs 200)', () => {
    expect(goSalaryForSize(40)).toBe(200)
    expect(goSalaryForSize(48)).toBe(800)
  })
})
