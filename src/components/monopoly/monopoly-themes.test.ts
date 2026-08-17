import { describe, expect, it } from 'vitest'
import { formatThemedMoney, formatThemedText, themedSpaceLines, themedSpaceName } from './monopoly-themes'

describe('monopoly-themes formatting', () => {
  it('formats themed money for Naija edition using canonicalToDisplayMoney scaling', () => {
    expect(formatThemedMoney(1500, 'naija')).toBe('₦1,500,000')
    expect(formatThemedMoney(200, 'naija')).toBe('₦200,000')
  })

  it('formats themed text replacing £ amounts and PAYDAY space for Naija edition', () => {
    const text = 'Players join with their name and start on PAYDAY with £1,500.'
    const result = formatThemedText(text, 'naija')
    expect(result).toBe('Players join with their name and start on Oshodi Bus Terminal with ₦1,500,000.')
  })

  it('returns correct themed space names and lines for space index 0 and 1 across editions', () => {
    expect(themedSpaceName('PAYDAY', 0, 'naija')).toBe('Oshodi Bus Terminal')
    expect(themedSpaceLines('PAYDAY', 'go', 0, 'naija')).toEqual(['OSHODI BUS', 'TERMINAL'])

    expect(themedSpaceName('Barking Road', 1, 'naija', 48)).toBe('Oshodi Market')
    expect(themedSpaceLines('Barking Road', 'property', 1, 'naija', 48)).toEqual(['OSHODI', 'MARKET'])
    expect(themedSpaceName('Dagenham Ave', 3, 'naija', 48)).toBe('Sabon Gari')
    expect(themedSpaceName('Thamesmead Walk', 4, 'naija', 48)).toBe('Ariaria Market')
    expect(themedSpaceName('Croydon High', 5, 'naija', 48)).toBe('Niger Bridge')
    expect(themedSpaceName('Erith Road', 7, 'naija', 48)).toBe('Ogbunike Caves')

    expect(themedSpaceName('PAYDAY', 0, 'pirate')).toBe('Port Royale')
    expect(themedSpaceLines('PAYDAY', 'go', 0, 'pirate')).toEqual(['Port', 'Royale'])
    expect(themedSpaceName('Barking Road', 1, 'pirate', 48)).toBe('Tortuga')
    expect(themedSpaceName('Dagenham Ave', 3, 'pirate', 48)).toBe('Sainte-Marie')
    expect(themedSpaceName('Thamesmead Walk', 4, 'pirate', 48)).toBe('Santo Domingo')
    expect(themedSpaceName('Croydon High', 5, 'pirate', 48)).toBe('San Juan')
    expect(themedSpaceName('Erith Road', 7, 'pirate', 48)).toBe('Cartagena')

    expect(themedSpaceName('PAYDAY', 0, 'arctic')).toBe('Base Camp')
    expect(themedSpaceLines('PAYDAY', 'go', 0, 'arctic')).toEqual(['BASE', 'CAMP'])
    expect(themedSpaceName('Barking Road', 1, 'arctic', 48)).toBe('Klondike Trail')
    expect(themedSpaceName('Dagenham Ave', 3, 'arctic', 48)).toBe('Donner Pass')
    expect(themedSpaceName('Thamesmead Walk', 4, 'arctic', 48)).toBe('Svalbard')
    expect(themedSpaceName('Croydon High', 5, 'arctic', 48)).toBe('Lapland')
    expect(themedSpaceName('Erith Road', 7, 'arctic', 48)).toBe('Glacier Bay')
  })

  it('ensures cheapest properties are at indexes 1 and 3 on both 40 and 48 boards', () => {
    // 40-board: 1 and 3 are brown (£60)
    expect(themedSpaceName('Old Kent Road', 1, 'naija', 40)).toBe('Oshodi Market')
    expect(themedSpaceName('Whitechapel Road', 3, 'naija', 40)).toBe('Sabon Gari')
    expect(themedSpaceName('The Angel Islington', 6, 'naija', 40)).toBe('Ariaria Market')
    expect(themedSpaceName('Euston Road', 8, 'naija', 40)).toBe('Niger Bridge')
    expect(themedSpaceName('Pentonville Road', 9, 'naija', 40)).toBe('Ogbunike Caves')

    // 48-board: 1 and 3 are brown (£60)
    expect(themedSpaceName('Barking Road', 1, 'naija', 48)).toBe('Oshodi Market')
    expect(themedSpaceName('Dagenham Ave', 3, 'naija', 48)).toBe('Sabon Gari')
    expect(themedSpaceName('Thamesmead Walk', 4, 'naija', 48)).toBe('Ariaria Market')
    expect(themedSpaceName('Croydon High', 5, 'naija', 48)).toBe('Niger Bridge')
    expect(themedSpaceName('Erith Road', 7, 'naija', 48)).toBe('Ogbunike Caves')
  })
})
