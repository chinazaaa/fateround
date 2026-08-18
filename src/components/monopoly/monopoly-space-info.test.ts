import { describe, it, expect } from 'vitest'
import { MONOPOLY_BOARD, MONOPOLY_EXPANDED_BOARD, spaceAt } from '@/lib/monopoly-board'
import {
  MONOPOLY_EDITIONS,
  themedSpaceName,
  themedSpaceLines,
  formatThemedMoney,
} from '@/components/monopoly/monopoly-themes'
import { countOwnedInGroup, computeRent } from '@/lib/monopoly'

describe('Monopoly Space Info Cards & Deeds Audit', () => {
  it('correctly resolves every space for 40-space and 48-space boards without index wrapping', () => {
    // 40-space board check
    for (let i = 0; i < 40; i++) {
      const space = spaceAt(i, 40)
      expect(space).toBeDefined()
      expect(space.index).toBe(i)
      expect(space.name).toBe(MONOPOLY_BOARD[i]!.name)
    }

    // 48-space board check
    for (let i = 0; i < 48; i++) {
      const space = spaceAt(i, 48)
      expect(space).toBeDefined()
      expect(space.index).toBe(i)
      expect(space.name).toBe(MONOPOLY_EXPANDED_BOARD[i]!.name)
    }
  })

  it('renders distinct and correct themed titles on Space Info Cards across all 4 editions', () => {
    for (const edition of MONOPOLY_EDITIONS) {
      const names48 = new Set<string>()

      for (let i = 0; i < 48; i++) {
        const space = spaceAt(i, 48)
        const themedTitle = themedSpaceName(space.name, i, edition.themeId, 48)

        expect(themedTitle).toBeTruthy()
        expect(typeof themedTitle).toBe('string')
        expect(themedTitle.length).toBeGreaterThan(0)

        // For properties, stations, utilities, ensure title uniqueness within the edition
        if (space.type === 'property' || space.type === 'station' || space.type === 'utility') {
          expect(names48.has(themedTitle)).toBe(false)
          names48.add(themedTitle)
        }
      }
    }
  })

  it('computes accurate station rent progression on 48-space board', () => {
    // Stations on 48-space board are at indexes 6, 18, 30, 42
    const stations = [6, 18, 30, 42]
    for (const idx of stations) {
      const space = spaceAt(idx, 48)
      expect(space.type).toBe('station')
      expect(space.price).toBe(200)
    }

    const owners: Record<string, string> = {
      '6': 'player1',
      '18': 'player1',
      '30': 'player1',
      '42': 'player1',
    }

    expect(countOwnedInGroup(owners, 'player1', 'station', 48)).toBe(4)

    const space6 = spaceAt(6, 48)
    const rent1 = computeRent(space6, { '6': 'player1' }, 'player1', 7, {}, {}, 48)
    const rent2 = computeRent(space6, { '6': 'player1', '18': 'player1' }, 'player1', 7, {}, {}, 48)
    const rent3 = computeRent(space6, { '6': 'player1', '18': 'player1', '30': 'player1' }, 'player1', 7, {}, {}, 48)
    const rent4 = computeRent(space6, owners, 'player1', 7, {}, {}, 48)

    expect(rent1).toBe(25)
    expect(rent2).toBe(50)
    expect(rent3).toBe(100)
    expect(rent4).toBe(200)
  })

  it('computes accurate utility rent progression on 48-space board', () => {
    // Utilities on 48-space board are at indexes 21 and 33
    const u21 = spaceAt(21, 48)
    const u33 = spaceAt(33, 48)
    expect(u21.type).toBe('utility')
    expect(u33.type).toBe('utility')

    const diceTotal = 8
    const rent1Util = computeRent(u21, { '21': 'player1' }, 'player1', diceTotal, {}, {}, 48)
    const rent2Util = computeRent(u21, { '21': 'player1', '33': 'player1' }, 'player1', diceTotal, {}, {}, 48)

    expect(rent1Util).toBe(8 * 4) // 32
    expect(rent2Util).toBe(8 * 10) // 80
  })

  it('formats currency correctly on deed info cards for all themes', () => {
    expect(formatThemedMoney(200, 'default')).toBe('£200')
    expect(formatThemedMoney(200, 'pirate')).toBe('Đ200')
    expect(formatThemedMoney(200, 'arctic')).toBe('Ɨ200')
    expect(formatThemedMoney(200, 'naija')).toBe('₦200,000')
  })

  it('produces valid 2-line tile labels for every space on the 48-board in all themes', () => {
    for (const edition of MONOPOLY_EDITIONS) {
      for (let i = 0; i < 48; i++) {
        const space = spaceAt(i, 48)
        const lines = themedSpaceLines(space.name, space.type, i, edition.themeId)
        if (lines) {
          expect(lines.length).toBeGreaterThanOrEqual(1)
          expect(lines.length).toBeLessThanOrEqual(2)
          for (const line of lines) {
            expect(line.length).toBeGreaterThan(0)
          }
        }
      }
    }
  })
})
