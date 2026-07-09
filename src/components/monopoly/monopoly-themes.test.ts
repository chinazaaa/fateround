import { describe, expect, it } from 'vitest'
import { formatThemedMoney, formatThemedText } from './monopoly-themes'

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
})
