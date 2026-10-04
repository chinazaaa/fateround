import { describe, expect, it } from 'vitest'
import { PREVIEWED_GAME_TYPES, UNRENDERABLE_PREVIEW, previewText } from '@/lib/question-pack-preview'
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
/** The six that already had a branch, named once so the eight can be derived rather than retyped. */
const PRE_EXISTING_SIX: readonly string[] = [
  'trivia',
  'would_you_rather',
  'this_or_that',
  'crossword',
  'word_search',
  'word_scramble',
]

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
 * The eight that used to fall through to JSON.stringify. Each row is [label, item, expected];
 * every type gets a well-formed item, a missing field, a wrong-typed field, and (via the shared
 * block below) non-object values.
 *
 * An item with nothing renderable in it still shows its raw JSON — a preview line reading just
 * "3. " would be strictly less than what origin/dev showed, on the one screen where an admin has
 * to see what they are approving. Those rows are spelled out here rather than asserted
 * generically, so the fallback cannot quietly become a blank line again.
 */
const NEW_EIGHT: Record<string, [string, unknown, string][]> = {
  most_likely_to: [
    ['well-formed', { question: 'Who is most likely to move abroad?' }, 'Who is most likely to move abroad?'],
    ['missing question', { prompt: 'nope' }, '{"prompt":"nope"}'],
    ['wrong-typed question', { question: { a: 1 } }, '{"question":{"a":1}}'],
    ['numeric question', { question: 42 }, '42'],
    ['empty question', { question: '' }, '{"question":""}'],
  ],
  never_have_i_ever: [
    ['well-formed', { question: 'been skydiving' }, 'been skydiving'],
    ['missing question', {}, '{}'],
    ['wrong-typed question', { question: ['a'] }, '{"question":["a"]}'],
  ],
  pick_a_number: [
    ['well-formed', { question: 'What is your biggest regret?' }, 'What is your biggest regret?'],
    ['missing question', {}, '{}'],
    ['wrong-typed question', { question: null }, '{"question":null}'],
  ],
  describe_it: [
    ['well-formed', { word: 'umbrella' }, 'umbrella'],
    ['missing word', { prompt: 'umbrella' }, '{"prompt":"umbrella"}'],
    ['wrong-typed word', { word: { a: 1 } }, '{"word":{"a":1}}'],
  ],
  quick_draw: [
    // `question` first: quick_draw is dispatched to parseStoredMltQuestions
    // (src/lib/custom-questions.ts:854), which is the only consumer that reads an object item and
    // it reads `question` (:839). `prompt` and `word` follow as plausible hand-edits.
    ['well-formed (question)', { question: 'a cat riding a skateboard' }, 'a cat riding a skateboard'],
    ['well-formed (prompt)', { prompt: 'a cat riding a skateboard' }, 'a cat riding a skateboard'],
    ['well-formed (word)', { word: 'lighthouse' }, 'lighthouse'],
    ['question wins', { question: 'the question', prompt: 'the prompt', word: 'the word' }, 'the question'],
    ['prompt beats word', { prompt: 'a prompt', word: 'a word' }, 'a prompt'],
    ['empty prompt falls through to word', { prompt: '', word: 'lighthouse' }, 'lighthouse'],
    ['missing all three', {}, '{}'],
    ['wrong-typed prompt falls back to word', { prompt: { a: 1 }, word: 'lighthouse' }, 'lighthouse'],
    ['wrong-typed everywhere', { prompt: ['a'], word: { b: 2 } }, '{"prompt":["a"],"word":{"b":2}}'],
  ],
  codewords: [
    ['well-formed', { word: 'Alien' }, 'Alien'],
    ['missing word', { value: 'Alien' }, '{"value":"Alien"}'],
    ['wrong-typed word', { word: ['Alien'] }, '{"word":["Alien"]}'],
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
    ['missing groups', { puzzle: '1' }, '{"puzzle":"1"}'],
    ['wrong-typed groups', { groups: 'Fruits' }, '{"groups":"Fruits"}'],
    ['group missing category', { groups: [{ words: ['a'] }, { category: 'Colours' }] }, 'Colours'],
    ['wrong-typed category', { groups: [{ category: { a: 1 } }, { category: 'Colours' }] }, 'Colours'],
    ['non-object group', { groups: ['Fruits', null, { category: 'Colours' }] }, 'Colours'],
    ['empty groups', { groups: [] }, '{"groups":[]}'],
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
    ['nothing usable', {}, '{}'],
  ],
}

describe('previewText — the eight types that used to render raw JSON', () => {
  for (const [gameType, cases] of Object.entries(NEW_EIGHT)) {
    describe(gameType, () => {
      it.each(cases)('%s', (_label, q, expected) => {
        expect(previewText(gameType, q)).toBe(expected)
      })

      /**
       * The regression guard, not a tautology: an item this type CAN render must not fall through
       * to JSON, and no item of any kind may render as a blank line. A previous version of this
       * assertion only checked `!== JSON.stringify(q)`, which passed for the malformed rows
       * precisely because they rendered as nothing.
       */
      it('renders the well-formed rows itself and never renders nothing', () => {
        for (const [label, q, expected] of cases) {
          const out = previewText(gameType, q)
          expect(out.length, `${label} previewed as a blank line`).toBeGreaterThan(0)
          if (label.startsWith('well-formed')) {
            expect(out, `${label} fell through to JSON`).not.toBe(JSON.stringify(q))
          }
          expect(out).toBe(expected)
        }
      })
    })
  }

  it('handles non-object items the shared way, whatever the type', () => {
    for (const gameType of Object.keys(NEW_EIGHT)) {
      expect(previewText(gameType, 'a bare string')).toBe('a bare string')
      expect(previewText(gameType, null)).toBe('null')
      expect(previewText(gameType, undefined)).toBe('undefined')
      expect(previewText(gameType, 3)).toBe('3')
    }
  })

  it('covers exactly the eight types that are not the pre-existing six', () => {
    expect(Object.keys(NEW_EIGHT).sort()).toEqual(
      PREVIEWED_GAME_TYPES.filter((gt) => !PRE_EXISTING_SIX.includes(gt))
        .slice()
        .sort()
    )
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

/**
 * UNREACHABLE FROM THE CURRENT CALLER — do not read these as live paths.
 *
 * `previewText`'s only caller is src/app/admin/library/page.tsx:513, and every item it passes
 * comes from `JSON.parse` (the fetch at page.tsx:51-52, and the questions editor at :168 whose
 * result round-trips back through :70). JSON.parse yields plain objects holding JSON value types
 * only: no getters, no `toJSON` hooks, no cycles, no symbols. So nothing below can occur today.
 *
 * They are pinned anyway because the declared `: string` return type has to be true for a future
 * caller that does not source its items from JSON — CodeRabbit flagged exactly that. The
 * guarding is done once at the boundary rather than inside each previewer, so the six
 * pre-existing branches keep the byte-identical output UNCHANGED_SIX pins.
 */
describe('previewText — totality on input the current caller cannot produce', () => {
  it('returns the diagnostic for a getter that throws, on a legacy branch', () => {
    const q = {
      get question() {
        throw new Error('boom')
      },
    }
    expect(previewText('trivia', q)).toBe(UNRENDERABLE_PREVIEW)
  })

  it('returns the diagnostic for a getter that throws, on the JSON fallback', () => {
    const q = {
      get anything() {
        throw new Error('boom')
      },
    }
    expect(previewText('some_future_type', q)).toBe(UNRENDERABLE_PREVIEW)
  })

  it('returns the diagnostic for a toJSON that throws', () => {
    const q = {
      toJSON() {
        throw new Error('boom')
      },
    }
    expect(previewText('some_future_type', q)).toBe(UNRENDERABLE_PREVIEW)
  })

  it('returns the diagnostic for a circular reference', () => {
    const q: Record<string, unknown> = { a: 1 }
    q.self = q
    expect(() => JSON.stringify(q)).toThrow()
    expect(previewText('some_future_type', q)).toBe(UNRENDERABLE_PREVIEW)
  })

  it('returns the diagnostic when serialization yields undefined', () => {
    const q = {
      toJSON() {
        return undefined
      },
    }
    expect(JSON.stringify(q)).toBeUndefined()
    expect(previewText('some_future_type', q)).toBe(UNRENDERABLE_PREVIEW)
  })

  it('returns the diagnostic for a hostile toString on a template-literal branch', () => {
    const q = {
      optionA: {
        toString() {
          throw new Error('boom')
        },
      },
      optionB: 'B',
    }
    expect(previewText('would_you_rather', q)).toBe(UNRENDERABLE_PREVIEW)
  })

  it('always returns a string, never throws, across every accepted type', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const hostile: unknown[] = [
      circular,
      {
        toJSON() {
          throw new Error('boom')
        },
      },
      {
        toJSON() {
          return undefined
        },
      },
      {
        get question() {
          throw new Error('boom')
        },
      },
      { optionA: Symbol('s'), optionB: Symbol('s') },
    ]
    for (const gt of [...QUESTION_PACK_GAME_TYPES, 'some_future_type']) {
      for (const q of hostile) {
        expect(() => previewText(gt, q)).not.toThrow()
        expect(typeof previewText(gt, q)).toBe('string')
      }
    }
  })
})
