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
