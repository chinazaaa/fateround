import { describe, expect, it } from 'vitest'
import { PREVIEWED_GAME_TYPES, previewText } from '@/lib/question-pack-preview'
import { QUESTION_PACK_GAME_TYPES } from '@/lib/question-pack-game-types'

/**
 * The admin review list's preview line, tested directly. The data it renders is unapproved,
 * user-submitted JSON (`POST /api/library` only checks `Array.isArray(questions)`), so each type
 * is exercised with a well-formed item, one missing a field, one with a wrong-typed field, and
 * non-object values.
 */

/**
 * Characterisation pin for the six types that already had a branch, captured by running the
 * ORIGINAL implementation (src/app/admin/library/page.tsx:598-608 @ a41fa85d) over this corpus
 * before the refactor. Every expectation below is that recorded output, warts included: the
 * "undefined" a missing optionB renders, the "[object Object]" an object `word` renders, and the
 * "" a non-matching object renders. Any change here is a regression, not a tidy-up.
 */
const UNCHANGED_SIX: [string, unknown, string][] = [
  ['trivia', 'a raw string question', 'a raw string question'],
  ['trivia', null, 'null'],
  ['trivia', undefined, 'undefined'],
  ['trivia', 42, '42'],
  ['trivia', ['a', 'b'], ''],
  ['trivia', {}, ''],
  ['trivia', { question: 'Q?', answers: ['a', 'b'], correct: 0 }, 'Q?'],
  ['trivia', { optionA: 'A', optionB: 'B' }, ''],
  ['trivia', { optionA: 'A' }, ''],
  ['trivia', { optionA: 1, optionB: { x: 1 } }, ''],
  ['trivia', { answer: 'ANS', clue: 'the clue' }, ''],
  ['trivia', { word: 'WORD' }, ''],
  ['trivia', { word: 'WORD', hint: 'a hint' }, ''],
  ['trivia', { word: { a: 1 }, hint: ['h'] }, ''],
  ['trivia', { question: 'Who?' }, 'Who?'],
  ['trivia', { text: 'some text' }, ''],
  ['trivia', { prompt: 'draw a cat' }, ''],
  ['would_you_rather', 'a raw string question', 'a raw string question'],
  ['would_you_rather', null, 'null'],
  ['would_you_rather', undefined, 'undefined'],
  ['would_you_rather', 42, '42'],
  ['would_you_rather', ['a', 'b'], 'undefined or undefined'],
  ['would_you_rather', {}, 'undefined or undefined'],
  ['would_you_rather', { question: 'Q?', answers: ['a', 'b'], correct: 0 }, 'undefined or undefined'],
  ['would_you_rather', { optionA: 'A', optionB: 'B' }, 'A or B'],
  ['would_you_rather', { optionA: 'A' }, 'A or undefined'],
  ['would_you_rather', { optionA: 1, optionB: { x: 1 } }, '1 or [object Object]'],
  ['would_you_rather', { answer: 'ANS', clue: 'the clue' }, 'undefined or undefined'],
  ['would_you_rather', { word: 'WORD' }, 'undefined or undefined'],
  ['would_you_rather', { word: 'WORD', hint: 'a hint' }, 'undefined or undefined'],
  ['would_you_rather', { word: { a: 1 }, hint: ['h'] }, 'undefined or undefined'],
  ['would_you_rather', { question: 'Who?' }, 'undefined or undefined'],
  ['would_you_rather', { text: 'some text' }, 'undefined or undefined'],
  ['would_you_rather', { prompt: 'draw a cat' }, 'undefined or undefined'],
  ['this_or_that', 'a raw string question', 'a raw string question'],
  ['this_or_that', null, 'null'],
  ['this_or_that', undefined, 'undefined'],
  ['this_or_that', 42, '42'],
  ['this_or_that', ['a', 'b'], 'undefined or undefined'],
  ['this_or_that', {}, 'undefined or undefined'],
  ['this_or_that', { question: 'Q?', answers: ['a', 'b'], correct: 0 }, 'undefined or undefined'],
  ['this_or_that', { optionA: 'A', optionB: 'B' }, 'A or B'],
  ['this_or_that', { optionA: 'A' }, 'A or undefined'],
  ['this_or_that', { optionA: 1, optionB: { x: 1 } }, '1 or [object Object]'],
  ['this_or_that', { answer: 'ANS', clue: 'the clue' }, 'undefined or undefined'],
  ['this_or_that', { word: 'WORD' }, 'undefined or undefined'],
  ['this_or_that', { word: 'WORD', hint: 'a hint' }, 'undefined or undefined'],
  ['this_or_that', { word: { a: 1 }, hint: ['h'] }, 'undefined or undefined'],
  ['this_or_that', { question: 'Who?' }, 'undefined or undefined'],
  ['this_or_that', { text: 'some text' }, 'undefined or undefined'],
  ['this_or_that', { prompt: 'draw a cat' }, 'undefined or undefined'],
  ['crossword', 'a raw string question', 'a raw string question'],
  ['crossword', null, 'null'],
  ['crossword', undefined, 'undefined'],
  ['crossword', 42, '42'],
  ['crossword', ['a', 'b'], ' — '],
  ['crossword', {}, ' — '],
  ['crossword', { question: 'Q?', answers: ['a', 'b'], correct: 0 }, ' — '],
  ['crossword', { optionA: 'A', optionB: 'B' }, ' — '],
  ['crossword', { optionA: 'A' }, ' — '],
  ['crossword', { optionA: 1, optionB: { x: 1 } }, ' — '],
  ['crossword', { answer: 'ANS', clue: 'the clue' }, 'ANS — the clue'],
  ['crossword', { word: 'WORD' }, ' — '],
  ['crossword', { word: 'WORD', hint: 'a hint' }, ' — '],
  ['crossword', { word: { a: 1 }, hint: ['h'] }, ' — '],
  ['crossword', { question: 'Who?' }, ' — '],
  ['crossword', { text: 'some text' }, ' — '],
  ['crossword', { prompt: 'draw a cat' }, ' — '],
  ['word_search', 'a raw string question', 'a raw string question'],
  ['word_search', null, 'null'],
  ['word_search', undefined, 'undefined'],
  ['word_search', 42, '42'],
  ['word_search', ['a', 'b'], ''],
  ['word_search', {}, ''],
  ['word_search', { question: 'Q?', answers: ['a', 'b'], correct: 0 }, ''],
  ['word_search', { optionA: 'A', optionB: 'B' }, ''],
  ['word_search', { optionA: 'A' }, ''],
  ['word_search', { optionA: 1, optionB: { x: 1 } }, ''],
  ['word_search', { answer: 'ANS', clue: 'the clue' }, ''],
  ['word_search', { word: 'WORD' }, 'WORD'],
  ['word_search', { word: 'WORD', hint: 'a hint' }, 'WORD'],
  ['word_search', { word: { a: 1 }, hint: ['h'] }, '[object Object]'],
  ['word_search', { question: 'Who?' }, ''],
  ['word_search', { text: 'some text' }, ''],
  ['word_search', { prompt: 'draw a cat' }, ''],
  ['word_scramble', 'a raw string question', 'a raw string question'],
  ['word_scramble', null, 'null'],
  ['word_scramble', undefined, 'undefined'],
  ['word_scramble', 42, '42'],
  ['word_scramble', ['a', 'b'], ''],
  ['word_scramble', {}, ''],
  ['word_scramble', { question: 'Q?', answers: ['a', 'b'], correct: 0 }, ''],
  ['word_scramble', { optionA: 'A', optionB: 'B' }, ''],
  ['word_scramble', { optionA: 'A' }, ''],
  ['word_scramble', { optionA: 1, optionB: { x: 1 } }, ''],
  ['word_scramble', { answer: 'ANS', clue: 'the clue' }, ''],
  ['word_scramble', { word: 'WORD' }, 'WORD'],
  ['word_scramble', { word: 'WORD', hint: 'a hint' }, 'WORD — a hint'],
  ['word_scramble', { word: { a: 1 }, hint: ['h'] }, '[object Object] — h'],
  ['word_scramble', { question: 'Who?' }, ''],
  ['word_scramble', { text: 'some text' }, ''],
  ['word_scramble', { prompt: 'draw a cat' }, ''],
]

describe('previewText — the six pre-existing branches are unchanged', () => {
  it.each(UNCHANGED_SIX)('%s / %j', (gameType, q, expected) => {
    expect(previewText(gameType, q)).toBe(expected)
  })
})

describe('previewText — shared guards', () => {
  it('returns a string item verbatim, whatever the game type', () => {
    expect(previewText('most_likely_to', 'Who is most likely to cry at a wedding?')).toBe(
      'Who is most likely to cry at a wedding?'
    )
    expect(previewText('not_a_game_type', 'still a string')).toBe('still a string')
  })

  it('stringifies non-object, non-string items', () => {
    expect(previewText('who_said_this', null)).toBe('null')
    expect(previewText('who_said_this', undefined)).toBe('undefined')
    expect(previewText('who_said_this', 7)).toBe('7')
    expect(previewText('who_said_this', false)).toBe('false')
  })

  it('falls back to JSON for a game type it does not know', () => {
    expect(previewText('some_future_type', { a: 1 })).toBe('{"a":1}')
  })

  it('does not treat inherited Object.prototype keys as previewers', () => {
    expect(previewText('constructor', { a: 1 })).toBe('{"a":1}')
    expect(previewText('toString', { a: 1 })).toBe('{"a":1}')
    expect(previewText('__proto__', { a: 1 })).toBe('{"a":1}')
  })
})

/**
 * The eight that used to fall through to JSON.stringify. Each row is
 * [label, item, expected]; every type gets a well-formed item, a missing field, a wrong-typed
 * field, and (via the shared block below) non-object values.
 */
const NEW_EIGHT: Record<string, [string, unknown, string][]> = {
  most_likely_to: [
    ['well-formed', { question: 'Who is most likely to move abroad?' }, 'Who is most likely to move abroad?'],
    ['missing question', { prompt: 'nope' }, ''],
    ['wrong-typed question', { question: { a: 1 } }, ''],
    ['numeric question', { question: 42 }, '42'],
  ],
  never_have_i_ever: [
    ['well-formed', { question: 'been skydiving' }, 'been skydiving'],
    ['missing question', {}, ''],
    ['wrong-typed question', { question: ['a'] }, ''],
  ],
  pick_a_number: [
    ['well-formed', { question: 'What is your biggest regret?' }, 'What is your biggest regret?'],
    ['missing question', {}, ''],
    ['wrong-typed question', { question: null }, ''],
  ],
  describe_it: [
    ['well-formed', { word: 'umbrella' }, 'umbrella'],
    ['missing word', { prompt: 'umbrella' }, ''],
    ['wrong-typed word', { word: { a: 1 } }, ''],
  ],
  quick_draw: [
    ['well-formed (prompt)', { prompt: 'a cat riding a skateboard' }, 'a cat riding a skateboard'],
    ['well-formed (word)', { word: 'lighthouse' }, 'lighthouse'],
    ['prompt wins over word', { prompt: 'a prompt', word: 'a word' }, 'a prompt'],
    ['missing both', {}, ''],
    ['wrong-typed prompt falls back to word', { prompt: { a: 1 }, word: 'lighthouse' }, 'lighthouse'],
    ['wrong-typed both', { prompt: ['a'], word: { b: 2 } }, ''],
  ],
  codewords: [
    ['well-formed', { word: 'Alien' }, 'Alien'],
    ['missing word', { value: 'Alien' }, ''],
    ['wrong-typed word', { word: ['Alien'] }, ''],
  ],
  word_grouping: [
    [
      'well-formed',
      {
        groups: [
          { category: 'Fruits', words: ['apple', 'pear', 'plum', 'fig'], difficulty: 1 },
          { category: 'Colours', words: ['red', 'blue', 'jade', 'rose'], difficulty: 2 },
          { category: 'Rivers', words: ['nile', 'po', 'ob', 'amazon'], difficulty: 3 },
          { category: '___ boat', words: ['row', 'sail', 'house', 'gravy'], difficulty: 4 },
        ],
      },
      'Fruits · Colours · Rivers · ___ boat',
    ],
    ['missing groups', { puzzle: '1' }, ''],
    ['wrong-typed groups', { groups: 'Fruits' }, ''],
    ['group missing category', { groups: [{ words: ['a'] }, { category: 'Colours' }] }, 'Colours'],
    ['wrong-typed category', { groups: [{ category: { a: 1 } }, { category: 'Colours' }] }, 'Colours'],
    ['non-object group', { groups: ['Fruits', null, { category: 'Colours' }] }, 'Colours'],
    ['empty groups', { groups: [] }, ''],
  ],
  who_said_this: [
    [
      'well-formed',
      { quote: 'Believe it!', options: ['Naruto', 'Sasuke', 'Sakura', 'Kakashi'], correctIndex: 0 },
      'Believe it! — Naruto',
    ],
    ['missing options', { quote: 'Believe it!' }, 'Believe it!'],
    ['missing quote', { options: ['Naruto', 'Sasuke'], correctIndex: 1 }, 'Sasuke'],
    ['missing correctIndex', { quote: 'Believe it!', options: ['Naruto'] }, 'Believe it!'],
    ['wrong-typed options', { quote: 'Believe it!', options: 'Naruto', correctIndex: 0 }, 'Believe it!'],
    ['wrong-typed quote', { quote: { a: 1 }, options: ['Naruto'], correctIndex: 0 }, 'Naruto'],
    ['correctIndex out of range', { quote: 'Believe it!', options: ['Naruto'], correctIndex: 4 }, 'Believe it!'],
    ['negative correctIndex', { quote: 'Believe it!', options: ['Naruto'], correctIndex: -1 }, 'Believe it!'],
    ['fractional correctIndex', { quote: 'Believe it!', options: ['Naruto'], correctIndex: 0.5 }, 'Believe it!'],
    ['string correctIndex', { quote: 'Believe it!', options: ['Naruto'], correctIndex: '0' }, 'Believe it!'],
    ['wrong-typed option at index', { quote: 'Believe it!', options: [{ a: 1 }], correctIndex: 0 }, 'Believe it!'],
    ['nothing usable', {}, ''],
  ],
}

describe('previewText — the eight types that used to render raw JSON', () => {
  for (const [gameType, cases] of Object.entries(NEW_EIGHT)) {
    describe(gameType, () => {
      it.each(cases)('%s', (_label, q, expected) => {
        expect(previewText(gameType, q)).toBe(expected)
      })

      it('never renders raw JSON for an object item', () => {
        for (const [, q] of cases) {
          expect(previewText(gameType, q)).not.toBe(JSON.stringify(q))
        }
      })

      it('handles non-object items the shared way', () => {
        expect(previewText(gameType, 'a bare string')).toBe('a bare string')
        expect(previewText(gameType, null)).toBe('null')
        expect(previewText(gameType, undefined)).toBe('undefined')
        expect(previewText(gameType, 3)).toBe('3')
      })
    })
  }
})

describe('previewText — never throws on hostile input', () => {
  const hostile: unknown[] = [
    {},
    [],
    [1, 2, 3],
    Object.create(null),
    { question: Symbol('s') },
    { word: Symbol('s') },
    { prompt: Symbol('s') },
    { quote: Symbol('s'), options: [Symbol('s')], correctIndex: 0 },
    {
      groups: [
        {
          get category() {
            throw new Error('boom')
          },
        },
      ],
    },
    { groups: { length: 2 } },
    {
      question: {
        toString: () => {
          throw new Error('boom')
        },
      },
    },
    {
      word: {
        toString: () => {
          throw new Error('boom')
        },
      },
    },
  ]

  // Only the eight new branches: the six pre-existing ones interpolate unknown values into
  // template literals and can still throw on a hostile `toString` — pre-existing behaviour this
  // change deliberately leaves byte-identical rather than folding a fix in silently.
  const newTypes = [
    'most_likely_to',
    'never_have_i_ever',
    'pick_a_number',
    'describe_it',
    'quick_draw',
    'codewords',
    'word_grouping',
    'who_said_this',
  ]

  it.each(newTypes)('%s survives every hostile item', (gameType) => {
    for (const q of hostile) {
      expect(() => previewText(gameType, q)).not.toThrow()
      expect(typeof previewText(gameType, q)).toBe('string')
    }
  })
})

/**
 * The exhaustiveness pin. The map is declared `satisfies Record<QuestionPackGameType, …>`, so a
 * missing type and a bogus extra key are both compile errors already; this asserts the same thing
 * at runtime in BOTH directions so the pin cannot pass while half-wrong — a one-directional pin
 * in this area previously let a bogus entry through green.
 */
describe('every accepted game_type has a preview', () => {
  it('previews exactly the accepted list — nothing missing', () => {
    const missing = QUESTION_PACK_GAME_TYPES.filter((gt) => !PREVIEWED_GAME_TYPES.includes(gt))
    expect(missing).toEqual([])
  })

  it('previews exactly the accepted list — nothing extra', () => {
    const accepted: readonly string[] = QUESTION_PACK_GAME_TYPES
    const extra = PREVIEWED_GAME_TYPES.filter((gt) => !accepted.includes(gt))
    expect(extra).toEqual([])
  })

  it('is set-equal to the accepted list', () => {
    expect([...PREVIEWED_GAME_TYPES].sort()).toEqual([...QUESTION_PACK_GAME_TYPES].sort())
  })

  it('renders something other than raw JSON for a canonical item of every accepted type', () => {
    const canonical: Record<string, unknown> = {
      trivia: { question: 'Q?' },
      would_you_rather: { optionA: 'A', optionB: 'B' },
      this_or_that: { optionA: 'A', optionB: 'B' },
      crossword: { answer: 'ANS', clue: 'clue' },
      word_search: { word: 'WORD' },
      word_scramble: { word: 'WORD' },
      most_likely_to: { question: 'Q?' },
      never_have_i_ever: { question: 'Q?' },
      pick_a_number: { question: 'Q?' },
      describe_it: { word: 'umbrella' },
      quick_draw: { prompt: 'a cat' },
      codewords: { word: 'Alien' },
      word_grouping: { groups: [{ category: 'Fruits' }] },
      who_said_this: { quote: 'Believe it!', options: ['Naruto'], correctIndex: 0 },
    }
    for (const gt of QUESTION_PACK_GAME_TYPES) {
      const q = canonical[gt]
      expect(q, `no canonical fixture for ${gt}`).toBeDefined()
      const out = previewText(gt, q)
      expect(out, `${gt} previewed as raw JSON`).not.toBe(JSON.stringify(q))
      expect(out.length, `${gt} previewed as empty`).toBeGreaterThan(0)
    }
  })
})
