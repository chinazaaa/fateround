import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { coercedNumber, optionalCoercedNumber } from './shared'
import { triviaAnswerSchema } from './round-games'
import { createGameSchema, boardGameLobbySettingsSchema } from './game'

const field = coercedNumber((n) => n.int().min(0).max(3))

describe('coercedNumber', () => {
  it('accepts numbers and numeric strings', () => {
    expect(field.parse(2)).toBe(2)
    expect(field.parse('2')).toBe(2)
    expect(field.parse(' 3 ')).toBe(3)
    expect(field.parse(0)).toBe(0)
    expect(field.parse('0')).toBe(0)
  })

  it('still applies the number checks', () => {
    expect(field.safeParse(4).success).toBe(false)
    expect(field.safeParse(-1).success).toBe(false)
    expect(field.safeParse(1.5).success).toBe(false)
    expect(field.safeParse('x').success).toBe(false)
    expect(field.safeParse(Number.NaN).success).toBe(false)
  })

  it.each([[''], ['   '], [null], [undefined]])('does not turn %j into 0 for a required field', (value) => {
    expect(field.safeParse(value).success).toBe(false)
  })

  it.each([[false], [true], [[]], [[1]], [{}]])('rejects %j instead of coercing it', (value) => {
    expect(field.safeParse(value).success).toBe(false)
  })

  it('treats blank and null as not provided on an optional field', () => {
    const optional = z.object({ n: optionalCoercedNumber((x) => x.int().min(0)) })
    expect(optional.parse({})).toEqual({})
    expect(optional.parse({ n: '' })).toEqual({})
    expect(optional.parse({ n: null })).toEqual({})
    expect(optional.parse({ n: '4' })).toEqual({ n: 4 })
    expect(optional.safeParse({ n: false }).success).toBe(false)
  })
})

describe('triviaAnswerSchema choiceIndex', () => {
  const base = { gameId: 'ABCD', resumeToken: 'TOKEN-1234', roundId: '11111111-1111-4111-8111-111111111111' }

  it('no longer records a blank answer as choice A', () => {
    expect(triviaAnswerSchema.safeParse({ ...base, choiceIndex: '' }).success).toBe(false)
    expect(triviaAnswerSchema.safeParse({ ...base, choiceIndex: null }).success).toBe(false)
    expect(triviaAnswerSchema.parse({ ...base, choiceIndex: 0 }).choiceIndex).toBe(0)
    expect(triviaAnswerSchema.parse({ ...base, choiceIndex: '3' }).choiceIndex).toBe(3)
  })
})

describe('optional game settings that are blank or null', () => {
  it.each([
    ['createGameSchema wordle_room_word_count', createGameSchema.shape.wordle_room_word_count],
    ['createGameSchema monopoly_board_size', createGameSchema.shape.monopoly_board_size],
    ['boardGameLobbySettingsSchema wordle_room_word_count', boardGameLobbySettingsSchema.shape.wordle_room_word_count],
    ['boardGameLobbySettingsSchema monopoly_board_size', boardGameLobbySettingsSchema.shape.monopoly_board_size],
  ])('%s treats blank and null as omitted', (_name, schema) => {
    expect(schema.safeParse(undefined).success).toBe(true)
    expect(schema.safeParse('').success).toBe(true)
    expect(schema.safeParse(null).success).toBe(true)
    expect(schema.safeParse(false).success).toBe(false)
  })

  it('still enforces the allowed Wordle word counts', () => {
    const schema = createGameSchema.shape.wordle_room_word_count
    expect(schema.safeParse('10').success).toBe(true)
    expect(schema.safeParse(7).success).toBe(false)
  })
})

describe('mahjong_rule_options with blank numbers', () => {
  it('drops blank and null numbers instead of keeping the key as undefined', () => {
    const schema = createGameSchema.shape.mahjong_rule_options
    const parsed = schema.parse({
      hongKongLimitFan: null,
      hongKongMinimumFan: '',
      mcrMinimumPoints: '8',
      matchLength: 'east',
    })
    expect(parsed).toEqual({ mcrMinimumPoints: 8, matchLength: 'east' })
    expect('hongKongLimitFan' in (parsed ?? {})).toBe(false)
    // so spreading over saved options keeps the saved value
    expect({ hongKongLimitFan: 13, ...parsed }.hongKongLimitFan).toBe(13)
  })

  it('still validates real values', () => {
    const schema = createGameSchema.shape.mahjong_rule_options
    expect(schema.safeParse({ hongKongLimitFan: 2 }).success).toBe(false)
    expect(schema.parse({ hongKongLimitFan: '7' })).toEqual({ hongKongLimitFan: 7 })
  })
})
