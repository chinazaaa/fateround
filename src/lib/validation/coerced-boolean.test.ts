import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { coercedBoolean, optionalCoercedBoolean } from './shared'
import { unoPlaySchema, unoPlayMultiSchema, unoJumpInSchema, unoChallengeSchema } from './board-games'

describe('coercedBoolean', () => {
  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
    [' TRUE ', true],
    ['False', false],
  ])('accepts %j', (input, expected) => {
    expect(coercedBoolean().parse(input)).toBe(expected)
  })

  it.each([[''], ['  '], [null], [undefined]])('treats %j as missing for a required field', (value) => {
    expect(coercedBoolean().safeParse(value).success).toBe(false)
  })

  it.each([['0'], ['1'], ['yes'], [0], [1], [[]], [{}], ['null']])('rejects %j', (value) => {
    expect(coercedBoolean().safeParse(value).success).toBe(false)
  })

  it('treats blank and null as not provided on an optional field', () => {
    const schema = z.object({ b: optionalCoercedBoolean() })
    expect(schema.parse({})).toEqual({})
    expect(schema.parse({ b: '' })).toEqual({})
    expect(schema.parse({ b: null })).toEqual({})
    expect(schema.parse({ b: 'false' })).toEqual({ b: false })
    expect(schema.safeParse({ b: 'maybe' }).success).toBe(false)
  })
})

describe('uno boolean fields', () => {
  const base = { gameId: 'ABCD', resumeToken: 'TOKEN-1234' }

  it('no longer turns "false" into true', () => {
    expect(unoChallengeSchema.parse({ ...base, challenge: 'false' }).challenge).toBe(false)
    expect(unoChallengeSchema.parse({ ...base, challenge: false }).challenge).toBe(false)
    expect(unoChallengeSchema.parse({ ...base, challenge: 'true' }).challenge).toBe(true)
    expect(unoChallengeSchema.safeParse({ ...base, challenge: '0' }).success).toBe(false)
    expect(unoChallengeSchema.safeParse(base).success).toBe(false)
  })

  it.each([
    ['unoPlaySchema', unoPlaySchema, { cardId: 'c1' }],
    ['unoPlayMultiSchema', unoPlayMultiSchema, { cardIds: ['c1', 'c2'] }],
    ['unoJumpInSchema', unoJumpInSchema, { cardId: 'c1' }],
  ])('%s callUno', (_name, schema, extra) => {
    const parse = (callUno?: unknown) =>
      (schema as unknown as z.ZodType<{ callUno?: boolean }>).parse({ ...base, ...extra, callUno }).callUno
    expect(parse('false')).toBe(false)
    expect(parse(false)).toBe(false)
    expect(parse('true')).toBe(true)
    expect(parse(true)).toBe(true)
    expect(parse(undefined)).toBeUndefined()
    expect(parse(null)).toBeUndefined()
  })
})
