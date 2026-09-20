import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/library — the `questions` matrix.
 *
 * This is the public, unauthenticated submit path. Before this PR it checked only
 * `Array.isArray(questions)`: no length cap and no element validation, then the array went into
 * the `question_packs` insert verbatim as JSONB with `question_count: questions.length`. The
 * admin PATCH on the same column already required a non-empty array and capped it at 500, so
 * the two writers of one column disagreed, and neither looked at elements.
 *
 * Play-time consumers *skip* what they cannot use rather than rejecting it
 * (`parseStoredCodewordsWords` in src/lib/codewords-pool.ts and `parseStoredDescribeItWords`
 * both `continue` on a non-string; `parseStoredMltQuestions` in src/lib/custom-questions.ts
 * keeps only strings and objects with a non-empty `question`), so a stored number, boolean,
 * null, nested array or blank string is silently invisible at play time while still counting
 * toward `question_count` — a pack could pass admin review showing N and play with fewer.
 *
 * Rows pinned here that must NOT move: a non-array, absent or null `questions` answers
 * "Missing required fields" (the truthiness/`Array.isArray` gate, shared with title /
 * game_type / author_name — see route.pack-field-types.test.ts), and a valid array is inserted
 * verbatim with `question_count` equal to its length. Rows this PR deliberately moves are
 * marked MOVED PIN below.
 *
 * As in #1179–#1182 and #1187 the fix is a point-of-use check; `submitPackBodySchema` stays the
 * shape-only `z.record(z.string(), z.any())`. A schema-level array type would turn today's
 * "Missing required fields" into a zod 400 and regress the way #1163 / #1153 did.
 */

vi.mock('server-only', () => ({}))

const { fromSpy, packInsertSpy, membershipInsertSpy, state } = vi.hoisted(() => {
  const state = {
    packInsert: { data: { id: 'pack-1' } as { id: string } | null, error: null as unknown },
    validCollections: [] as { id: string }[],
  }
  const packInsertSpy = vi.fn()
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
      return { select: () => ({ in: async () => ({ data: state.validCollections, error: null }) }) }
    }
    if (table === 'question_pack_collections') {
      return { insert: membershipInsertSpy }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  return { fromSpy, packInsertSpy, membershipInsertSpy, state }
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
  membershipInsertSpy.mockClear()
  enforceRateLimit.mockClear()
  state.packInsert = { data: { id: 'pack-1' }, error: null }
  state.validCollections = []
})

const BASE = { title: 'Trivia Night', game_type: 'trivia', author_name: 'Ada' } as const

function post(body: unknown) {
  return POST(
    new NextRequest('https://test.local/api/library', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

async function submit(questions: unknown, omit = false) {
  const body: Record<string, unknown> = { ...BASE }
  if (!omit) body.questions = questions
  const res = await post(body)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** The row handed to `.insert()`, asserted to have happened exactly once. */
function insertedRow(): Record<string, unknown> {
  expect(packInsertSpy).toHaveBeenCalledTimes(1)
  return packInsertSpy.mock.calls[0][0] as Record<string, unknown>
}

function strings(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `q${i + 1}`)
}

describe('POST /api/library — questions gate (unchanged rows)', () => {
  it.each<[string, unknown]>([
    ['a string', 'q1'],
    ['a number', 5],
    ['true', true],
    ['an object', { question: 'q1' }],
    ['null', null],
  ])('rejects a non-array questions (%s) with Missing required fields', async (_label, value) => {
    expect(await submit(value)).toEqual({ status: 400, body: { error: 'Missing required fields' } })
    expect(packInsertSpy).not.toHaveBeenCalled()
  })

  it('rejects an absent questions with Missing required fields', async () => {
    expect(await submit(undefined, true)).toEqual({ status: 400, body: { error: 'Missing required fields' } })
    expect(packInsertSpy).not.toHaveBeenCalled()
  })
})

describe('POST /api/library — questions length', () => {
  it('accepts a 1-element array and counts it', async () => {
    expect(await submit(['q1'])).toEqual({ status: 200, body: { success: true, id: 'pack-1' } })
    expect(insertedRow()).toMatchObject({ questions: ['q1'], question_count: 1 })
  })

  it('accepts a 500-element array and counts it', async () => {
    const qs = strings(500)
    expect(await submit(qs)).toEqual({ status: 200, body: { success: true, id: 'pack-1' } })
    expect(insertedRow()).toMatchObject({ questions: qs, question_count: 500 })
  })

  // MOVED PIN: was { status: 200 } with a 501-element insert (no cap on the public path).
  it('rejects a 501-element array with the admin route’s cap message', async () => {
    expect(await submit(strings(501))).toEqual({ status: 400, body: { error: 'Too many questions (max 500)' } })
    expect(packInsertSpy).not.toHaveBeenCalled()
  })

  // MOVED PIN: was { status: 200 } inserting `questions: []`, `question_count: 0` — a pack that
  // passes review advertising nothing and plays nothing.
  it('rejects an empty array with the admin route’s non-empty message', async () => {
    expect(await submit([])).toEqual({ status: 400, body: { error: 'questions must be a non-empty array' } })
    expect(packInsertSpy).not.toHaveBeenCalled()
  })
})

describe('POST /api/library — questions elements', () => {
  it.each<[string, unknown[]]>([
    ['a string', ['q1']],
    ['an object', [{ question: 'q1' }]],
    ['a mix of strings and objects', ['q1', { question: 'q2' }]],
    ['a string with surrounding whitespace', ['  q1  ']],
  ])('accepts %s and inserts it verbatim', async (_label, questions) => {
    expect(await submit(questions)).toEqual({ status: 200, body: { success: true, id: 'pack-1' } })
    expect(insertedRow()).toMatchObject({ questions, question_count: questions.length })
  })

  // MOVED PINS: each of these was { status: 200 } with the element stored verbatim and counted,
  // while every play-time consumer skips it.
  it.each<[string, unknown[]]>([
    ['an empty string', ['']],
    ['a whitespace-only string', ['   ']],
    ['null', [null]],
    ['a number', [5]],
    ['a boolean', [true]],
    ['a nested array', [['q1']]],
    ['one bad element among good ones', ['q1', 5, 'q3']],
    ['one blank element among good ones', ['q1', '   ', 'q3']],
  ])('rejects %s', async (_label, questions) => {
    expect(await submit(questions)).toEqual({
      status: 400,
      body: { error: 'questions must contain only non-empty strings or objects' },
    })
    expect(packInsertSpy).not.toHaveBeenCalled()
  })
})
