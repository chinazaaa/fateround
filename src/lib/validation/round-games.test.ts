import { describe, expect, it } from 'vitest'
import { bingoCallSchema } from './round-games'

describe('bingoCallSchema', () => {
  const base = { gameId: 'ABCD', hostToken: 'host-token-1234' }

  it('accepts a manual number, a random call, and a call with no number key', () => {
    expect(bingoCallSchema.parse({ ...base, number: 7, random: false }).number).toBe(7)
    expect(bingoCallSchema.parse({ ...base, random: true }).random).toBe(true)
    expect(bingoCallSchema.safeParse({ ...base }).success).toBe(true)
    expect(bingoCallSchema.safeParse({ ...base, random: false }).success).toBe(true)
  })

  it.each([[null], [''], ['   ']])('rejects a blank manual number %j instead of drawing a random ball', (number) => {
    expect(bingoCallSchema.safeParse({ ...base, random: false, number }).success).toBe(false)
    expect(bingoCallSchema.safeParse({ ...base, number }).success).toBe(false)
  })

  it('still allows a random call that carries a blank number', () => {
    expect(bingoCallSchema.safeParse({ ...base, random: true, number: null }).success).toBe(true)
  })

  it('rejects out-of-range numbers', () => {
    expect(bingoCallSchema.safeParse({ ...base, number: 76 }).success).toBe(false)
  })
})
