import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * PATCH /api/admin/library/[id] — the `questions` matrix.
 *
 * The admin edit path already required a non-empty array and capped it at 500, but it did not
 * look at *elements*: any JSON value could sit in the array, be written to the `questions`
 * JSONB column, and be counted by `question_count`. Play-time consumers skip what they cannot
 * use (`parseStoredCodewordsWords` / `parseStoredDescribeItWords` `continue` on non-strings;
 * `parseStoredMltQuestions` keeps only strings and objects with a non-empty `question`), so an
 * admin could approve a pack advertising N questions that plays with fewer — or none.
 *
 * The matrix is driven past the handler's real gates: `assertAdminRequest` with a genuinely
 * signed `admin_session` cookie (not a stubbed gate), and the `action` fork — 'approve' and
 * 'reject' short-circuit before any field handling, while an absent `action` and a
 * non-matching `action` both fall into the field-edit branch that reaches the `questions`
 * lines. Both of the latter are exercised so the matrix cannot be passing through only one.
 *
 * Unchanged pins: the two existing messages and their exact wording, the 1- and 500-element
 * accepts, and the `updates` payload shape (`questions` verbatim + `question_count`). Rows this
 * PR moves are marked MOVED PIN.
 *
 * `libraryPatchSchema` stays untouched (`questions: z.unknown().optional()`), as in #1179–#1182
 * and #1187 — a schema-level array type is the #1163 / #1153 regression shape.
 */

vi.mock('server-only', () => ({}))

const { fromSpy, updateSpy, state } = vi.hoisted(() => {
  const state = { updateError: null as unknown }
  const updateSpy = vi.fn()
  const fromSpy = vi.fn((table: string) => {
    if (table !== 'question_packs') throw new Error(`Unexpected table: ${table}`)
    return {
      update: (row: unknown) => {
        updateSpy(row)
        return { eq: async () => ({ error: state.updateError }) }
      },
    }
  })
  return { fromSpy, updateSpy, state }
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))

process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret'
process.env.ADMIN_EMAIL = 'admin@test.local'

type Patch = typeof import('./route').PATCH
let PATCH: Patch
let adminCookie: string

beforeAll(async () => {
  const { createAdminSessionToken } = await import('@/lib/admin-session')
  adminCookie = `admin_session=${await createAdminSessionToken('admin@test.local')}`
  PATCH = (await import('./route')).PATCH
}, 60_000)

beforeEach(() => {
  fromSpy.mockClear()
  updateSpy.mockClear()
  state.updateError = null
})

const PACK_ID = 'pack-1'

// The cookie is supplied as a thunk, not a plain optional argument: a default parameter is
// applied on an explicit `undefined`, so `patch(body, undefined)` would silently send the valid
// cookie and pin a 200 as if it were the no-cookie case.
function patch(body: unknown, { cookie = () => adminCookie }: { cookie?: () => string | undefined } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const value = cookie()
  if (value !== undefined) headers.cookie = value
  return PATCH(
    new NextRequest(`https://test.local/api/admin/library/${PACK_ID}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PACK_ID }) }
  )
}

async function result(body: unknown) {
  const res = await patch(body)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

function lastUpdate(): Record<string, unknown> {
  expect(updateSpy).toHaveBeenCalledTimes(1)
  return updateSpy.mock.calls[0][0] as Record<string, unknown>
}

function strings(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `q${i + 1}`)
}

/** The two bodies that reach the field-edit branch: `action` absent, and a non-matching one. */
const EDIT_FORKS: [string, Record<string, unknown>][] = [
  ['action absent', {}],
  ['a non-matching action', { action: 'edit' }],
]

describe('PATCH /api/admin/library/[id] — gates', () => {
  it('rejects a missing admin cookie before touching the DB', async () => {
    const res = await patch({ questions: ['q1'] }, { cookie: () => undefined })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it.each<[string, string]>([
    ['approve', 'approved'],
    ['reject', 'rejected'],
  ])('short-circuits on action=%s and never looks at questions', async (action, status) => {
    expect(await result({ action, questions: [5, null, ''] })).toEqual({ status: 200, body: { success: true } })
    const row = lastUpdate()
    expect(row.status).toBe(status)
    expect(row).not.toHaveProperty('questions')
    expect(row).not.toHaveProperty('question_count')
  })
})

describe.each(EDIT_FORKS)('PATCH /api/admin/library/[id] — questions with %s', (_label, fork) => {
  const send = (questions: unknown) => result({ ...fork, questions })

  it.each<[string, unknown]>([
    ['a string', 'q1'],
    ['a number', 5],
    ['true', true],
    ['an object', { question: 'q1' }],
    ['null', null],
  ])('rejects a non-array questions (%s)', async (_l, value) => {
    expect(await send(value)).toEqual({ status: 400, body: { error: 'questions must be a non-empty array' } })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects an empty array', async () => {
    expect(await send([])).toEqual({ status: 400, body: { error: 'questions must be a non-empty array' } })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('accepts a 1-element array and counts it', async () => {
    expect(await send(['q1'])).toEqual({ status: 200, body: { success: true } })
    expect(lastUpdate()).toMatchObject({ questions: ['q1'], question_count: 1 })
  })

  it('accepts a 500-element array and counts it', async () => {
    const qs = strings(500)
    expect(await send(qs)).toEqual({ status: 200, body: { success: true } })
    expect(lastUpdate()).toMatchObject({ questions: qs, question_count: 500 })
  })

  it('rejects a 501-element array', async () => {
    expect(await send(strings(501))).toEqual({ status: 400, body: { error: 'Too many questions (max 500)' } })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it.each<[string, unknown[]]>([
    ['an object', [{ question: 'q1' }]],
    ['a mix of strings and objects', ['q1', { question: 'q2' }]],
    ['a string with surrounding whitespace', ['  q1  ']],
  ])('accepts %s verbatim', async (_l, questions) => {
    expect(await send(questions)).toEqual({ status: 200, body: { success: true } })
    expect(lastUpdate()).toMatchObject({ questions, question_count: questions.length })
  })

  // MOVED PINS: each of these was { status: 200 } with the element written verbatim and counted.
  it.each<[string, unknown[]]>([
    ['an empty string', ['']],
    ['a whitespace-only string', ['   ']],
    ['null', [null]],
    ['a number', [5]],
    ['a boolean', [true]],
    ['a nested array', [['q1']]],
    ['one bad element among good ones', ['q1', 5, 'q3']],
    ['one blank element among good ones', ['q1', '   ', 'q3']],
  ])('rejects %s', async (_l, questions) => {
    expect(await send(questions)).toEqual({
      status: 400,
      body: { error: 'questions must contain only non-empty strings or objects' },
    })
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
