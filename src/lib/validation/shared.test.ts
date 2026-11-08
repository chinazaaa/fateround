import { describe, expect, it } from 'vitest'
import { plainText, sanitizedString } from './shared'

describe('sanitizedString', () => {
  const schema = sanitizedString(1, 20)

  it('strips NUL characters that Postgres text columns reject', () => {
    expect(schema.parse('abc\u0000def')).toBe('abcdef')
  })

  it('strips bidi override characters that reverse neighbouring text', () => {
    expect(schema.parse('‮evil‬')).toBe('evil')
  })

  it('still trims and strips HTML', () => {
    expect(schema.parse('  <b>hi</b>  ')).toBe('hi')
  })

  it('rejects a value that is only control characters', () => {
    expect(schema.safeParse('\u0000‮').success).toBe(false)
  })
})

describe('plainText', () => {
  const schema = plainText(1, 10)

  it('strips NUL and bidi controls but keeps angle brackets', () => {
    expect(schema.parse(' a\u0000‮b<3 ')).toBe('ab<3')
  })

  it('enforces the length bounds after stripping', () => {
    expect(schema.safeParse('\u0000').success).toBe(false)
    expect(schema.safeParse('x'.repeat(11)).success).toBe(false)
  })
})

describe('plainText with min 0', () => {
  it('keeps an entry that is empty after stripping so callers can filter it', () => {
    expect(plainText(0, 80).parse('\u0000')).toBe('')
  })
})

describe('plainText raw length cap', () => {
  it('rejects an overlong raw value even if stripping would make it fit', () => {
    expect(plainText(0, 80).safeParse('a'.repeat(80) + '\u0000').success).toBe(false)
  })

  it('still trims surrounding whitespace before measuring', () => {
    expect(plainText(1, 5).parse('  abcde  ')).toBe('abcde')
  })
})
