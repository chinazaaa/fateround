import { describe, expect, it } from 'vitest'
import { MAX_PACK_QUESTIONS, validatePackQuestions } from './question-pack-questions'

/**
 * Unit pins for the rule itself, as distinct from the two request matrices at the handlers
 * (src/app/api/library/route.questions.test.ts and
 * src/app/api/admin/library/[id]/route.questions.test.ts).
 *
 * This is where the boundary rows that no caller can reach through `JSON.parse` live — sparse
 * arrays, `new String`, `Object.create(null)` — since the module is exported and documented as
 * the shared rule, not as a private helper of either route.
 */

const strings = (n: number) => Array.from({ length: n }, (_, i) => `q${i + 1}`)

const NON_EMPTY_ARRAY = 'questions must be a non-empty array'
const TOO_MANY = 'Too many questions (max 500)'
const BAD_ELEMENT = 'questions must contain only non-empty strings or objects'

describe('validatePackQuestions — shape and length', () => {
  it('pins the cap constant the admin message quotes', () => {
    expect(MAX_PACK_QUESTIONS).toBe(500)
    expect(validatePackQuestions(strings(501))).toEqual({ ok: false, error: TOO_MANY })
  })

  it.each<[string, unknown]>([
    ['a string', 'q1'],
    ['a number', 5],
    ['true', true],
    ['an object', { question: 'q1' }],
    ['null', null],
    ['undefined', undefined],
  ])('rejects a non-array (%s)', (_label, value) => {
    expect(validatePackQuestions(value)).toEqual({ ok: false, error: NON_EMPTY_ARRAY })
  })

  it('rejects an empty array', () => {
    expect(validatePackQuestions([])).toEqual({ ok: false, error: NON_EMPTY_ARRAY })
  })

  it.each([1, 2, 499, 500])('accepts %i elements and returns the same array identity', (n) => {
    const input = strings(n)
    const result = validatePackQuestions(input)
    expect(result).toEqual({ ok: true, questions: input })
    // Identity, not just equality: the callers write `question_count` off the returned array, so
    // it must be the very value they store.
    expect(result.ok && result.questions).toBe(input)
  })
})

describe('validatePackQuestions — elements', () => {
  it.each<[string, unknown]>([
    ['a string', 'q1'],
    ['a string with surrounding whitespace', '  q1  '],
    ['a plain object', { question: 'q1' }],
    ['an empty object', {}],
    ['a nested object', { a: { b: 1 } }],
  ])('accepts %s', (_label, item) => {
    expect(validatePackQuestions([item])).toEqual({ ok: true, questions: [item] })
  })

  it.each<[string, unknown]>([
    ['an empty string', ''],
    ['a whitespace-only string', '   '],
    ['a tab/newline-only string', '\t\n'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 5],
    ['zero', 0],
    ['a boolean', true],
    ['a nested array', ['q1']],
    ['an empty nested array', []],
  ])('rejects %s', (_label, item) => {
    expect(validatePackQuestions([item])).toEqual({ ok: false, error: BAD_ELEMENT })
  })

  it('rejects one bad element among many good ones, wherever it sits', () => {
    for (const at of [0, 1, 249, 499]) {
      const input: unknown[] = strings(500)
      input[at] = 5
      expect(validatePackQuestions(input)).toEqual({ ok: false, error: BAD_ELEMENT })
    }
  })

  it('checks length before elements, so an over-cap array of junk reports the cap', () => {
    expect(validatePackQuestions(Array.from({ length: 501 }, () => 5))).toEqual({ ok: false, error: TOO_MANY })
  })
})

describe('validatePackQuestions — values no caller can send', () => {
  /**
   * `.every()` skips array holes, so the previous implementation passed a sparse array and then
   * stored it as `[null, "a"]` with `question_count: 2` — the exact shape the rule forbids.
   * `JSON.parse` never produces holes, so neither route can reach this, but the rule is exported.
   */
  it('rejects a sparse array rather than skipping its holes', () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [, 'a', ,]
    expect(sparse.length).toBe(3)
    expect(JSON.parse(JSON.stringify(sparse))).toEqual([null, 'a', null])
    expect(validatePackQuestions(sparse)).toEqual({ ok: false, error: BAD_ELEMENT })
  })

  /** Documented in the module: `typeof` cannot tell these from a plain object. Unreachable. */
  it('accepts a boxed String and a null-prototype object, as documented', () => {
    expect(validatePackQuestions([new String('   ')]).ok).toBe(true)
    expect(validatePackQuestions([Object.create(null)]).ok).toBe(true)
  })
})
