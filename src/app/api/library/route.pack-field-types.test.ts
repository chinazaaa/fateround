import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * `submitPackBodySchema` is a deliberate shape-only guard (`z.record(z.string(), z.any())`), so
 * every field of a pack submission arrives as whatever JSON value the caller sent. POST then
 * guards `title` / `game_type` / `author_name` with a bare truthiness check and applies its
 * length caps with `value.length > N` — which a non-string does not merely escape, it
 * *bypasses*: `(5).length` is `undefined` and `undefined > 100` is false, so the value reached
 * the `question_packs` insert verbatim. An array is worse in a different way: `['a','b'].length`
 * is 2, so a short array clears a cap meant to count characters, while an array with more
 * elements than the cap is rejected by accident with the cap's own message.
 *
 * This file pins the whole per-field matrix for the one handler that reaches those lines
 * (POST /api/library — the route has no second auth path), for `title`, `author_name`,
 * `description`, `game_type`, plus the `collection_ids` / `tags` filters that are the nearest
 * neighbours of the inputs this PR changes.
 *
 * The `null`, absent and empty-string rows must never move: the route treats null/absent/''
 * title, game_type and author_name as missing and answers "Missing required fields", and a
 * null/absent/'' description is written through untouched. A schema-level `z.string()` would
 * turn `null` into an "expected string, received null" 400 on requests the route handles today
 * (see CONTRIBUTING.md — #1163 / #1153), which is why the fix is a point-of-use `typeof`
 * check and the schema is untouched.
 */

vi.mock('server-only', () => ({}))

const { fromSpy, packInsertSpy, membershipInsertSpy, collectionLookupSpy, state } = vi.hoisted(() => {
  const state = {
    packInsert: { data: { id: 'pack-1' } as { id: string } | null, error: null as unknown },
    validCollections: [] as { id: string }[],
  }
  const packInsertSpy = vi.fn()
  const collectionLookupSpy = vi.fn()
  const membershipInsertSpy = vi.fn(async () => ({ error: null }))
  const fromSpy = vi.fn((table: string) => {
    if (table === 'question_packs') {
      return {
        insert: (row: unknown) => {
          packInsertSpy(row)
          return { select: () => ({ single: async () => state.packInsert }) }
        },
      }
    }
    if (table === 'content_collections') {
      return {
        select: () => ({
          in: async (_col: string, values: string[]) => {
            collectionLookupSpy(values)
            return { data: state.validCollections, error: null }
          },
        }),
      }
    }
    if (table === 'question_pack_collections') {
      return { insert: membershipInsertSpy }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  return { fromSpy, packInsertSpy, membershipInsertSpy, collectionLookupSpy, state }
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => ({ from: fromSpy }) }))

const { enforceRateLimit } = vi.hoisted(() => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
  RATE_LIMITS: { librarySubmit: { bucket: 'library-submit', max: 20, windowSeconds: 3600 } },
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  fromSpy.mockClear()
  packInsertSpy.mockClear()
  collectionLookupSpy.mockClear()
  membershipInsertSpy.mockClear()
  enforceRateLimit.mockClear()
  state.packInsert = { data: { id: 'pack-1' }, error: null }
  state.validCollections = []
})

function post(body: unknown) {
  return POST(
    new NextRequest('https://test.local/api/library', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

/** A complete, valid submission, so each case reaches the field handling under test. */
const VALID = {
  title: 'Trivia Night',
  game_type: 'trivia',
  author_name: 'Ada',
  questions: [{ prompt: 'q1' }],
} as const

/** Truthy non-strings: these clear the truthiness gate and reach the length caps. */
const TRUTHY_NON_STRING: [string, unknown][] = [
  ['a number', 5],
  ['true', true],
  ['an object', {}],
  ['a short array', ['a', 'b']],
]

/** Falsy non-strings: turned away one gate earlier, by the original truthiness check. */
const FALSY_NON_STRING: [string, unknown][] = [
  ['0', 0],
  ['false', false],
]

// ---------------------------------------------------------------------------------------------
// The required-fields gate: null / absent / '' / falsy non-string. UNCHANGED by this PR.
// ---------------------------------------------------------------------------------------------

describe.each(['title', 'game_type', 'author_name'] as const)(
  'POST /api/library — %s: absent-like values stay at the required-fields gate',
  (field) => {
    it.each([
      ['null', null],
      ['an empty string', ''],
    ])(`treats ${field} = %s as missing: 400 "Missing required fields", no DB`, async (_label, value) => {
      const res = await post({ ...VALID, [field]: value })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
      expect(fromSpy).not.toHaveBeenCalled()
    })

    it(`treats an absent ${field} as missing: 400 "Missing required fields", no DB`, async () => {
      const body: Record<string, unknown> = { ...VALID }
      delete body[field]
      const res = await post(body)
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
      expect(fromSpy).not.toHaveBeenCalled()
    })

    it.each(FALSY_NON_STRING)(
      `treats a falsy non-string ${field} (%s) as missing, at the original gate`,
      async (_label, value) => {
        const res = await post({ ...VALID, [field]: value })
        expect(res.status).toBe(400)
        await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
        expect(fromSpy).not.toHaveBeenCalled()
      }
    )
  }
)

it('still rejects a non-array questions with 400 "Missing required fields"', async () => {
  const res = await post({ ...VALID, questions: 'not-an-array' })
  expect(res.status).toBe(400)
  await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
  expect(fromSpy).not.toHaveBeenCalled()
})

// ---------------------------------------------------------------------------------------------
// The happy path, so the field handling has a baseline to be measured against.
// ---------------------------------------------------------------------------------------------

describe('POST /api/library — a valid submission', () => {
  it('inserts the pack and returns its id', async () => {
    const res = await post({ ...VALID, description: 'Fun pack', tags: ['easy', 'party'] })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, id: 'pack-1' })
    expect(packInsertSpy).toHaveBeenCalledWith({
      title: 'Trivia Night',
      game_type: 'trivia',
      author_name: 'Ada',
      description: 'Fun pack',
      questions: [{ prompt: 'q1' }],
      question_count: 1,
      status: 'pending',
      tags: ['easy', 'party'],
    })
  })

  it('leaves the rate-limit backstop in front of every field check', async () => {
    await post({})
    expect(enforceRateLimit).toHaveBeenCalledTimes(1)
  })

  it('drops unknown tags and defaults a non-array tags to []', async () => {
    await post({ ...VALID, tags: ['easy', 'nonsense', 7, null] })
    expect(packInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ tags: ['easy'] }))
    packInsertSpy.mockClear()
    await post({ ...VALID, tags: 'easy' })
    expect(packInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }))
  })
})

// ---------------------------------------------------------------------------------------------
// title / author_name: the length caps, and the non-string values that bypassed them.
// ---------------------------------------------------------------------------------------------

describe.each([
  ['title', 100, 'Title too long'],
  ['author_name', 60, 'Author name too long'],
] as const)('POST /api/library — %s length cap', (field, cap, message) => {
  it(`accepts a ${cap}-character ${field}`, async () => {
    const res = await post({ ...VALID, [field]: 'x'.repeat(cap) })
    expect(res.status).toBe(200)
    expect(packInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ [field]: 'x'.repeat(cap) }))
  })

  it(`rejects a ${cap + 1}-character ${field} with 400 "${message}"`, async () => {
    const res = await post({ ...VALID, [field]: 'x'.repeat(cap + 1) })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: message })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  // THE BUG. Pin moved deliberately: against the pre-fix route each of these returned 200 and
  // the raw JSON value was inserted into a `text NOT NULL` column, where PostgREST's
  // json_populate_recordset coerces it to text ('5', 'true', '{}', '["a","b"]') and stores it.
  // The length cap never even ran: `(5).length` is undefined and `['a','b'].length` is 2.
  it.each(TRUTHY_NON_STRING)(
    `rejects ${field} = %s with 400 "Missing required fields" and no DB write`,
    async (_label, value) => {
      const res = await post({ ...VALID, [field]: value })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
      expect(fromSpy).not.toHaveBeenCalled()
    }
  )

  // An array with MORE elements than the cap was already rejected by the pre-fix route — with
  // this exact message — because `.length` on an array counts elements. Unchanged either way,
  // which is why the assertion below did not move; only the reason did.
  it(`rejects a ${cap + 1}-element array ${field} with 400 "Missing required fields"`, async () => {
    const res = await post({ ...VALID, [field]: Array.from({ length: cap + 1 }, () => 'x') })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------
// description: optional, so null / absent / '' are written through and must stay that way.
// ---------------------------------------------------------------------------------------------

describe('POST /api/library — description', () => {
  it.each([
    ['null', null, null],
    ['an empty string', '', ''],
  ])('writes a %s description through as-is', async (_label, value, stored) => {
    const res = await post({ ...VALID, description: value })
    expect(res.status).toBe(200)
    expect(packInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ description: stored }))
  })

  it('writes an absent description through as null', async () => {
    const res = await post({ ...VALID })
    expect(res.status).toBe(200)
    expect(packInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ description: null }))
  })

  it('accepts a 500-character description', async () => {
    const res = await post({ ...VALID, description: 'x'.repeat(500) })
    expect(res.status).toBe(200)
    expect(packInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ description: 'x'.repeat(500) }))
  })

  it('rejects a 501-character description with 400 "Description too long"', async () => {
    const res = await post({ ...VALID, description: 'x'.repeat(501) })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Description too long' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  // THE BUG. Pin moved deliberately: against the pre-fix route every row below returned 200 and
  // stored the coerced JSON value in the `description text` column. The falsy rows (0, false)
  // skipped the cap via the `description &&` short-circuit; the truthy ones via `.length`
  // being undefined (or, for a short array, an element count under 500).
  it.each([...TRUTHY_NON_STRING, ...FALSY_NON_STRING])(
    'rejects description = %s with 400 "Invalid description" and no DB write',
    async (_label, value) => {
      const res = await post({ ...VALID, description: value })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'Invalid description' })
      expect(fromSpy).not.toHaveBeenCalled()
    }
  )

  // A 501-element array was already rejected pre-fix, with "Description too long", because
  // `.length` counted elements. Pin moved: it is now caught one gate earlier, by type.
  it('rejects a 501-element array description with 400 "Invalid description"', async () => {
    const res = await post({ ...VALID, description: Array.from({ length: 501 }, () => 'x') })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid description' })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------
// game_type: truthiness-checked only, never validated against the allowed list by this route.
// ---------------------------------------------------------------------------------------------

describe('POST /api/library — game_type', () => {
  // Deliberately NOT changed by this PR: an unknown *string* game_type still reaches the insert
  // and is left to `question_packs_game_type_check` in the database, which answers a 500 via
  // internalErrorMessage. Adding list validation here would move a gate this PR has no pin for.
  it('passes an unknown string game_type through to the insert', async () => {
    const res = await post({ ...VALID, game_type: 'not_a_real_game' })
    expect(res.status).toBe(200)
    expect(packInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ game_type: 'not_a_real_game' }))
  })

  it('surfaces a database rejection of the insert as a 500', async () => {
    state.packInsert = { data: null, error: { message: 'violates check constraint' } }
    const res = await post({ ...VALID, game_type: 'not_a_real_game' })
    expect(res.status).toBe(500)
  })

  // THE BUG. Pin moved deliberately: pre-fix these were inserted verbatim into a
  // `text NOT NULL CHECK (game_type IN (...))` column, where the coerced text ('5', 'true',
  // '{}', '["trivia"]') fails the check constraint and the route answered 500. Now a clean 400,
  // decided before the write — the same 500 → 400 change PR #1179 made for wst-quotes.
  it.each([...TRUTHY_NON_STRING, ['an array holding a valid type', ['trivia']] as [string, unknown]])(
    'rejects game_type = %s with 400 "Missing required fields" and no DB write',
    async (_label, value) => {
      const res = await post({ ...VALID, game_type: value })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
      expect(fromSpy).not.toHaveBeenCalled()
    }
  )
})

// ---------------------------------------------------------------------------------------------
// Gate precedence when two gates fail at once.
// ---------------------------------------------------------------------------------------------

describe('POST /api/library — combined gates', () => {
  it('answers the required-fields gate before any type or length gate', async () => {
    const res = await post({ ...VALID, title: 5, questions: 'not-an-array' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('answers the title gates before the author_name gates', async () => {
    const res = await post({ ...VALID, title: 'x'.repeat(101), author_name: 'y'.repeat(61) })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Title too long' })
  })

  // Pin moved deliberately: pre-fix a non-string title cleared its (bypassed) cap, so the
  // author_name cap answered. The title type gate now sits where the title cap sits, so it
  // answers first. Every gate here is a 400 either way; only the message moved.
  it('answers the title type gate before the author_name length gate', async () => {
    const res = await post({ ...VALID, title: 5, author_name: 'y'.repeat(61) })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
  })

  it('answers the title length gate before anything description-related', async () => {
    const res = await post({ ...VALID, title: 'x'.repeat(101), description: 5 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Title too long' })
  })

  it('answers the description length gate before anything game_type-related', async () => {
    const res = await post({ ...VALID, game_type: 5, description: 'x'.repeat(501) })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Description too long' })
  })
})

// ---------------------------------------------------------------------------------------------
// collection_ids: the post-insert branch. It already has the guard the fields above lacked —
// `Array.isArray` plus a `typeof c === 'string'` filter — so there is no equivalent gap, and
// this PR does not touch it. Pinned so that stays true.
// ---------------------------------------------------------------------------------------------

describe('POST /api/library — collection_ids', () => {
  it('looks up only the string ids in a mixed array and links the ones that exist', async () => {
    state.validCollections = [{ id: 'coll-1' }]
    const res = await post({ ...VALID, collection_ids: [5, 'coll-1', {}, null, 'coll-missing'] })
    expect(res.status).toBe(200)
    expect(collectionLookupSpy).toHaveBeenCalledWith(['coll-1', 'coll-missing'])
    expect(membershipInsertSpy).toHaveBeenCalledWith([{ collection_id: 'coll-1', pack_id: 'pack-1', sort_order: 0 }])
  })

  it('caps the lookup at 20 ids', async () => {
    const res = await post({ ...VALID, collection_ids: Array.from({ length: 25 }, (_, i) => `coll-${i}`) })
    expect(res.status).toBe(200)
    expect(collectionLookupSpy).toHaveBeenCalledWith(Array.from({ length: 20 }, (_, i) => `coll-${i}`))
  })

  it.each([
    ['a non-array', 'coll-1'],
    ['an empty array', []],
    ['an array with no string ids', [5, {}, null]],
  ])('does no collection lookup for %s collection_ids, and still creates the pack', async (_label, value) => {
    const res = await post({ ...VALID, collection_ids: value })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, id: 'pack-1' })
    expect(collectionLookupSpy).not.toHaveBeenCalled()
    expect(membershipInsertSpy).not.toHaveBeenCalled()
  })

  it('ignores collection_ids entirely when the pack insert failed', async () => {
    state.packInsert = { data: null, error: { message: 'boom' } }
    const res = await post({ ...VALID, collection_ids: ['coll-1'] })
    expect(res.status).toBe(500)
    expect(collectionLookupSpy).not.toHaveBeenCalled()
  })
})
