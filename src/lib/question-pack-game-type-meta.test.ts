import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { QUESTION_PACK_GAME_TYPES } from '@/lib/question-pack-game-types'
import {
  QUESTION_PACK_GAME_TYPE_META,
  QUESTION_PACK_GAME_TYPE_ORDER,
  questionPackGameTypeMeta,
} from '@/lib/question-pack-game-type-meta'

/**
 * The client half of the library game-type drift.
 *
 * The API stopped keeping its own copy of the list (it calls `QUESTION_PACK_GAME_TYPES.includes`
 * at the point of use), but the admin editor, the public library and the submit form each carried
 * a hand-written copy and had fallen behind the constraint: the admin picker could not select
 * `word_grouping` or `who_said_this` at all, and a `word_grouping` pack rendered its badge as the
 * raw slug through `{meta?.label ?? gt}`.
 *
 * Every assertion below is **set equality in both directions**. A containment-only pin is how a
 * bogus entry slipped through green here before: a list that is a superset of the constraint is
 * just as broken as one that is short of it — it offers a value the DB will reject with a 500.
 */
const sorted = (values: readonly string[]) => [...values].sort()

const SRC = join(process.cwd(), 'src')
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

describe('question pack game type meta', () => {
  it('has exactly one entry per accepted game type — no missing label, no phantom type', () => {
    expect(sorted(Object.keys(QUESTION_PACK_GAME_TYPE_META))).toEqual(sorted(QUESTION_PACK_GAME_TYPES))
  })

  it('orders exactly the accepted game types, without dropping or inventing one', () => {
    expect(sorted(QUESTION_PACK_GAME_TYPE_ORDER)).toEqual(sorted(QUESTION_PACK_GAME_TYPES))
    // Insertion order of the meta is the UI order, so the two must also agree element-for-element.
    expect(QUESTION_PACK_GAME_TYPE_ORDER).toEqual(Object.keys(QUESTION_PACK_GAME_TYPE_META))
  })

  it('gives every accepted type a non-empty label and a badge colour', () => {
    for (const gameType of QUESTION_PACK_GAME_TYPES) {
      const meta = QUESTION_PACK_GAME_TYPE_META[gameType]
      expect(meta.label.trim(), gameType).not.toBe('')
      // A raw slug leaking into the label is the exact symptom this module removes.
      expect(meta.label, gameType).not.toBe(gameType)
      expect(meta.color, gameType).toMatch(/border-/)
    }
  })

  it('resolves meta by string for values off the wire, and undefined for anything else', () => {
    for (const gameType of QUESTION_PACK_GAME_TYPES) {
      expect(questionPackGameTypeMeta(gameType)).toBe(QUESTION_PACK_GAME_TYPE_META[gameType])
    }
    expect(questionPackGameTypeMeta('not_a_game_type')).toBeUndefined()
    // Must not walk the prototype chain — `Object.prototype.toString` is not a pack game type.
    expect(questionPackGameTypeMeta('toString')).toBeUndefined()
    expect(questionPackGameTypeMeta('constructor')).toBeUndefined()
  })
})

/**
 * Source-level half of the pin. The runtime assertions above only cover the shared module; these
 * check that the three client sites still *consume* it instead of growing a private list again,
 * which is the failure mode that produced the drift in the first place. Same technique as
 * `daily-answer-reveal.test.ts`, which guards the daily hub the same way.
 */
describe('library client pages derive their game types from the shared module', () => {
  const SITES = ['app/admin/library/page.tsx', 'app/library/page.tsx', 'app/library/submit/page.tsx'] as const

  it.each(SITES)('%s imports the shared meta module', (rel) => {
    expect(read(rel)).toMatch(/from '@\/lib\/question-pack-game-type-meta'/)
  })

  it.each(SITES)('%s declares no local list of game-type slugs', (rel) => {
    const source = read(rel)
    // A local copy would have to name at least two pack types as string literals in one
    // declaration. `GAME_TYPE_FORMATS` in the submit page is keyed, not a list of slugs.
    const listLiterals = source.match(/\[[^[\]]*'(?:trivia|would_you_rather|word_grouping)'[^[\]]*\]/g) ?? []
    expect(listLiterals, `${rel} should derive its game types, not restate them`).toEqual([])
  })

  it('the submit form derives its picker rows from the shared order', () => {
    expect(read('app/library/submit/page.tsx')).toMatch(/QUESTION_PACK_GAME_TYPE_ORDER\.map/)
  })

  it('the public library derives its filter options from the shared order', () => {
    expect(read('app/library/page.tsx')).toMatch(/QUESTION_PACK_GAME_TYPE_ORDER\.map/)
  })

  it('the admin picker renders the shared order', () => {
    expect(read('app/admin/library/page.tsx')).toMatch(/QUESTION_PACK_GAME_TYPE_ORDER\.map/)
  })
})
