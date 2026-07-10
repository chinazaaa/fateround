import { describe, expect, it } from 'vitest'
import { formatThemedMoney, formatThemedText, themedSpaceLines, themedSpaceName } from './monopoly-themes'

describe('monopoly-themes formatting', () => {
  it('formats themed money for Naija edition using canonicalToDisplayMoney scaling', () => {
    expect(formatThemedMoney(1500, 'naija')).toBe('₦1,500,000')
    expect(formatThemedMoney(200, 'naija')).toBe('₦200,000')
  })

  it('formats themed text replacing £ amounts and GO space for Naija edition', () => {
    const text = 'Players join with their name and start on GO with £1,500.'
    const result = formatThemedText(text, 'naija')
    expect(result).toBe('Players join with their name and start on Oshodi Bus Terminal with ₦1,500,000.')
  })

  it('returns correct themed space names and lines for space index 0 and 1 across editions', () => {
    expect(themedSpaceName('GO', 0, 'naija')).toBe('Oshodi Bus Terminal')
    expect(themedSpaceLines('GO', 'go', 0, 'naija')).toEqual(['OSHODI BUS', 'TERMINAL'])

    expect(themedSpaceName('Old Kent Road', 1, 'naija')).toBe('Oshodi Market')
    expect(themedSpaceLines('Old Kent Road', 'property', 1, 'naija')).toEqual(['OSHODI', 'MARKET'])

    expect(themedSpaceName('GO', 0, 'pirate')).toBe('Port Royale')
    expect(themedSpaceLines('GO', 'go', 0, 'pirate')).toEqual(['Port', 'Royale'])

    expect(themedSpaceName('GO', 0, 'arctic')).toBe('Base Camp')
    expect(themedSpaceLines('GO', 'go', 0, 'arctic')).toEqual(['BASE', 'CAMP'])
  })
})
