import { describe, expect, it } from 'vitest'
import {
  MONOPOLY_BOARD,
  MONOPOLY_EXPANDED_BOARD,
  MONOPOLY_MAX_PLAYERS,
  monopolyGoToJailPosition,
  monopolyJailPosition,
  ownsColorMonopoly,
  spaceAt,
  spacesInGroup,
} from '@/lib/monopoly-board'
import { movePosition } from '@/lib/monopoly'
import { boardGridCell } from '@/components/monopoly/monopoly-ui'
import { themedSpaceName } from '@/components/monopoly/monopoly-themes'

describe('Estate Kings expanded board', () => {
  it('supports eight players while preserving the classic board', () => {
    expect(MONOPOLY_MAX_PLAYERS).toBe(8)
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
})
