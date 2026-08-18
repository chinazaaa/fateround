import { describe, expect, it } from 'vitest'
import {
  MONOPOLY_BOARD,
  MONOPOLY_EXPANDED_BOARD,
  monopolyGoToJailPosition,
  monopolyJailPosition,
  ownsColorMonopoly,
  spaceAt,
  spacesInGroup,
} from './monopoly-board'

describe('Estate Kings board editions', () => {
  it('preserves the classic 40-space board', () => {
    expect(MONOPOLY_BOARD).toHaveLength(40)
    expect(spaceAt(10).type).toBe('jail')
    expect(spaceAt(30).type).toBe('go_to_jail')
    expect(spaceAt(40).index).toBe(0)
  })

  it('provides 48 unique indexed spaces with quarter-board corners', () => {
    expect(MONOPOLY_EXPANDED_BOARD).toHaveLength(48)
    expect(new Set(MONOPOLY_EXPANDED_BOARD.map((space) => space.index)).size).toBe(48)
    expect([0, 12, 24, 36].map((index) => spaceAt(index, 48).type)).toEqual([
      'go',
      'jail',
      'free_parking',
      'go_to_jail',
    ])
    expect(spaceAt(48, 48).index).toBe(0)
  })

  it('derives jail positions from board size', () => {
    expect(monopolyJailPosition(40)).toBe(10)
    expect(monopolyJailPosition(48)).toBe(12)
    expect(monopolyGoToJailPosition(40)).toBe(30)
    expect(monopolyGoToJailPosition(48)).toBe(36)
  })

  it('requires every Site in the selected edition to complete an estate', () => {
    const classicSites = spacesInGroup('light_blue', 40)
    const expandedSites = spacesInGroup('light_blue', 48)
    const owners = Object.fromEntries(expandedSites.map((space) => [String(space.index), 'owner']))

    expect(classicSites).toHaveLength(3)
    expect(expandedSites).toHaveLength(3)
    expect(ownsColorMonopoly(owners, 'owner', 'light_blue', 48)).toBe(true)
    delete owners[String(expandedSites.at(-1)!.index)]
    expect(ownsColorMonopoly(owners, 'owner', 'light_blue', 48)).toBe(false)
  })
})
