import { describe, expect, it } from 'vitest'
import { sanitizedString } from './shared'

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
