import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { MAX_PRICE_COINS } from '@/lib/coins/pricing'

/**
 * PATCH /api/admin/library/[id] — per-field type matrix.
 *
 * `libraryPatchSchema` is deliberately permissive (`z.unknown().optional()` for the fields the
 * handler runtime-checks), so every such field arrives as whatever JSON value the admin client
 * sent and the route's own guards are the only gate. `title`, `author_name`, `tags` and
 * `questions` each guard the *type* before they use it; `game_type` and `status` are typed
 * `z.string().optional()` in the schema, so zod turns a non-string away before the handler runs;
 * `price_coins` reaches the DB through a coercion rather than a type check (its full value
 * matrix lives in route.price-coins.test.ts). `description` did neither:
 *
 *     if (description !== null && typeof description === 'string' && description.length > 500)
 *
 * The `typeof description === 'string'` conjunct means a non-string never reaches the length
 * check — the guard passed and the next line wrote the value through. PostgREST's
 * `json_populate_recordset` then coerces the JSON value into the `description text` column
 * (5 -> '5', {"a":1} -> '{"a":1}', ["a","b"] -> '["a","b"]') rather than erroring, so this was a
 * silent data-integrity bug, not a 500: an admin edit could overwrite an approved pack's
 * description with array text, past the 500-character cap.
 *
 * The `null` / absent / `''` rows must never move. This route has real semantics there:
 * `description === '' ? null : (description ?? null)` means an empty string *clears* the field
 * and an explicit null writes null. A schema-level `z.string().optional()` would turn
 * `{"description": null}` into an "expected string, received null" 400 on a request the route
 * handles today — the #1163 / #1153 regressions in CONTRIBUTING.md — which is why the fix is a
 * point-of-use `typeof` check and the schema is untouched, exactly as in PR #1179 and #1180.
 *
 * Coverage of the paths that reach those lines: the handler's only gate is `assertAdminRequest`
 * (an `admin_session` cookie verified by `verifyAdminSessionToken` — no second role check), and
 * these tests drive it with a *real* signed cookie rather than stubbing the gate away. Past it,
 * the handler forks three ways on `action`: 'approve' and 'reject' short-circuit and never look
 * at `description`; every other value — including an absent `action` — falls into the field-edit
 * branch, which is the single path that reaches the description lines. All three are pinned,
 * and the field-edit branch is driven both with `action` absent and with `action` set to a
 * non-matching value so the matrix cannot be passing through only one of them.
 */

vi.mock('server-only', () => ({}))

const { fromSpy, updateSpy, eqSpy, state } = vi.hoisted(() => {
  const state = { updateError: null as unknown }
  const updateSpy = vi.fn()
  const eqSpy = vi.fn()
  const fromSpy = vi.fn((table: string) => {
    if (table !== 'question_packs') throw new Error(`Unexpected table: ${table}`)
    return {
      update: (row: unknown) => {
        updateSpy(row)
        return {
          eq: async (col: string, value: unknown) => {
            eqSpy(col, value)
            return { error: state.updateError }
          },
        }
      },
    }
  })
  return { fromSpy, updateSpy, eqSpy, state }
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
  eqSpy.mockClear()
  state.updateError = null
})

const PACK_ID = 'pack-1'

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

/** The value the update payload must carry for a given description input. */
function lastUpdate(): Record<string, unknown> {
  expect(updateSpy).toHaveBeenCalledTimes(1)
  return updateSpy.mock.calls[0][0] as Record<string, unknown>
}

/** Truthy non-strings. */
const TRUTHY_NON_STRING: [string, unknown][] = [
  ['a number', 5],
  ['true', true],
  ['an object', {}],
  ['a short array', ['a', 'b']],
]

/** Falsy non-strings. */
const FALSY_NON_STRING: [string, unknown][] = [
  ['0', 0],
  ['false', false],
]

// ---------------------------------------------------------------------------------------------
// The gate in front of every case below. UNCHANGED by this PR.
// ---------------------------------------------------------------------------------------------

describe('PATCH /api/admin/library/[id] — the admin-session gate', () => {
  it('401s with no admin_session cookie, and touches no table', async () => {
    const res = await patch({ description: 5 }, { cookie: () => undefined })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('401s on a forged admin_session cookie, and touches no table', async () => {
    const res = await patch({ description: 5 }, { cookie: () => 'admin_session=not.a-real-token' })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('lets a real signed session through to the field handling', async () => {
    const res = await patch({ description: 'ok' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(eqSpy).toHaveBeenCalledWith('id', PACK_ID)
  })
})

// ---------------------------------------------------------------------------------------------
// The `action` fork: which of the three branches reaches the description lines.
// ---------------------------------------------------------------------------------------------

describe('PATCH /api/admin/library/[id] — the action fork', () => {
  it.each([
    ['approve', 'approved'],
    ['reject', 'rejected'],
  ])('action=%s ignores every other field, description included', async (action, status) => {
    // `title` is a VALID string on purpose: a non-string title would 400 in the field-edit
    // branch, so `lastUpdate()` would throw before the assertion and the `title` pin could
    // never fail. A valid title is written in that branch, so this pin has teeth.
    const res = await patch({ action, description: ['a', 'b'], title: 'A Pack' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    const update = lastUpdate()
    expect(update.status).toBe(status)
    expect(update).not.toHaveProperty('description')
    expect(update).not.toHaveProperty('title')
  })

  it('action=approve stamps approved_at; action=reject does not', async () => {
    await patch({ action: 'approve' })
    expect(lastUpdate()).toEqual({ status: 'approved', approved_at: expect.any(String) })
    updateSpy.mockClear()
    await patch({ action: 'reject' })
    expect(lastUpdate()).toEqual({ status: 'rejected' })
  })

  it.each([
    ['absent', undefined],
    ["a non-matching string ('edit')", 'edit'],
    ['null', null],
    ['a number', 7],
  ])('action = %s falls into the field-edit branch that reaches the description lines', async (_l, action) => {
    const body: Record<string, unknown> = { description: 'from the edit branch' }
    if (action !== undefined) body.action = action
    const res = await patch(body)
    expect(res.status).toBe(200)
    expect(lastUpdate()).toEqual({ description: 'from the edit branch' })
  })
})

// ---------------------------------------------------------------------------------------------
// description — the field this PR fixes.
//
// Every case runs twice: once with `action` absent and once with `action: 'edit'`, the two ways
// into the field-edit branch, so neither route in can silently stop being exercised.
// ---------------------------------------------------------------------------------------------

describe.each([
  ['action absent', {}],
  ["action: 'edit'", { action: 'edit' }],
])('PATCH /api/admin/library/[id] — description (%s)', (_label, actionPart) => {
  const edit = (description: unknown) => patch({ ...actionPart, description })

  // ---- null / absent / '' : the semantics that must NOT move. ----

  it('writes an explicit null description through as null', async () => {
    const res = await edit(null)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(lastUpdate()).toEqual({ description: null })
  })

  it("clears the field on an empty string: '' is stored as null", async () => {
    const res = await edit('')
    expect(res.status).toBe(200)
    expect(lastUpdate()).toEqual({ description: null })
  })

  it('leaves description out of the update entirely when it is absent', async () => {
    const res = await patch({ ...actionPart, title: 'A Pack' })
    expect(res.status).toBe(200)
    const update = lastUpdate()
    expect(update).not.toHaveProperty('description')
    expect(update).toEqual({ title: 'A Pack' })
  })

  it('400s "No valid fields to update" when the body carries no updatable field at all', async () => {
    const res = await patch({ ...actionPart })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'No valid fields to update' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  // ---- strings and the 500-character cap. ----

  it('writes a valid string description through verbatim, untrimmed', async () => {
    const res = await edit('  A perfectly fine description  ')
    expect(res.status).toBe(200)
    expect(lastUpdate()).toEqual({ description: '  A perfectly fine description  ' })
  })

  it('accepts a 500-character description', async () => {
    const res = await edit('x'.repeat(500))
    expect(res.status).toBe(200)
    expect(lastUpdate()).toEqual({ description: 'x'.repeat(500) })
  })

  it('rejects a 501-character description with 400 "Description too long" and no write', async () => {
    const res = await edit('x'.repeat(501))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Description too long' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  // ---- THE BUG. PIN MOVED DELIBERATELY. Against the pre-fix route every row below returned
  // 200 {"success":true} with the raw JSON value in the update payload: the
  // `typeof description === 'string'` conjunct made the length check unreachable for a
  // non-string, so the guard passed and PostgREST's json_populate_recordset coerced the value
  // into the `description text` column instead of erroring. ----

  it.each([...TRUTHY_NON_STRING, ...FALSY_NON_STRING])(
    'rejects description = %s with 400 "Invalid description" and no write',
    async (_label, value) => {
      const res = await edit(value)
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'Invalid description' })
      expect(fromSpy).not.toHaveBeenCalled()
    }
  )

  // PIN MOVED DELIBERATELY. A 501-ELEMENT array was written through pre-fix as well:
  // `typeof [] === 'string'` is false, so not even the element-count misreading of `.length`
  // got a chance to reject it. (This differs from /api/library POST in PR #1180, where a long
  // array WAS rejected, by element count, for the wrong reason.) Both the short array above and
  // this long one are pinned so the `.length`-on-array case is covered from both sides.
  it('rejects a 501-element array description with 400 "Invalid description" and no write', async () => {
    const res = await edit(Array.from({ length: 501 }, () => 'x'))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid description' })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------
// Gate precedence. These pin that the new type gate did not move any *other* gate.
// ---------------------------------------------------------------------------------------------

describe('PATCH /api/admin/library/[id] — gate precedence', () => {
  it('answers the title gate before anything description-related', async () => {
    const res = await patch({ title: 5, description: 5 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid title' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('answers the game_type gate before anything description-related', async () => {
    const res = await patch({ game_type: 'not_a_real_game', description: 5 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid game_type' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('answers the author_name gate before anything description-related', async () => {
    const res = await patch({ author_name: 5, description: 5 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid author_name' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  // PIN MOVED DELIBERATELY. Pre-fix a non-string description raised no gate at all, so the
  // downstream tags gate answered ("tags must be an array"). The description type gate now sits
  // exactly where the description cap already sat, so description still answers before tags —
  // which is the order an over-cap *string* has always produced (pinned directly below).
  it('answers the description gates before the tags gate', async () => {
    const res = await patch({ description: 5, tags: 'easy' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid description' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('answers the description length gate for an over-cap STRING, before the tags gate', async () => {
    const res = await patch({ description: 'x'.repeat(501), tags: 'easy' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Description too long' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  // PINS MOVED DELIBERATELY. The description block sits above FOUR later gates, not just tags,
  // so a non-string description now answers ahead of each of them where it used to fall
  // through. Every one of these requests was a 400 before and is a 400 now — only the message
  // moved — but all four are listed so the change is not discovered later by an admin client
  // that branches on the error text.
  it.each([
    ['tags', { tags: 'easy' }, 'tags must be an array'],
    ['status', { status: 'bogus' }, 'Invalid status'],
    ['questions', { questions: [] }, 'questions must be a non-empty array'],
    ['price_coins', { price_coins: -1 }, `price_coins must be an integer between 0 and ${MAX_PRICE_COINS}`],
  ])('answers the description type gate ahead of the %s gate', async (_label, extra, wasMessage) => {
    const res = await patch({ description: 5, ...extra })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid description' })
    expect(fromSpy).not.toHaveBeenCalled()

    // ...and that later gate still answers on its own, unchanged, with the message it used to
    // answer this request with.
    const alone = await patch(extra)
    expect(alone.status).toBe(400)
    await expect(alone.json()).resolves.toEqual({ error: wasMessage })
  })

  it('surfaces a database rejection of the update as a 500', async () => {
    state.updateError = { message: 'boom' }
    const res = await patch({ description: 'fine' })
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------------------------
// The sibling fields, audited alongside `description`. Each already guards its type before it
// uses it, so none has the bug and NONE is changed by this PR. Pinned so that stays true.
// ---------------------------------------------------------------------------------------------

describe('PATCH /api/admin/library/[id] — the other fields are already type-gated', () => {
  it.each([...TRUTHY_NON_STRING, ...FALSY_NON_STRING, ['null', null] as [string, unknown]])(
    'rejects a non-string title (%s) with 400 "Invalid title"',
    async (_label, value) => {
      const res = await patch({ title: value })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'Invalid title' })
      expect(fromSpy).not.toHaveBeenCalled()
    }
  )

  it.each([...TRUTHY_NON_STRING, ...FALSY_NON_STRING, ['null', null] as [string, unknown]])(
    'rejects a non-string author_name (%s) with 400 "Invalid author_name"',
    async (_label, value) => {
      const res = await patch({ author_name: value })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'Invalid author_name' })
      expect(fromSpy).not.toHaveBeenCalled()
    }
  )

  it('trims title and author_name, and enforces their caps', async () => {
    await patch({ title: '  Pack  ', author_name: '  Ada  ' })
    expect(lastUpdate()).toEqual({ title: 'Pack', author_name: 'Ada' })
    expect((await patch({ title: 'x'.repeat(101) })).status).toBe(400)
    expect((await patch({ author_name: 'y'.repeat(61) })).status).toBe(400)
  })

  // `game_type` and `status` are the two fields whose type gate is NOT in the handler: the
  // schema types them `z.string().optional()`, so a non-string is turned away by zod and the
  // body carries zod's message, not this file's `Invalid game_type` / `Invalid status`. The
  // body is asserted so a schema 400 stays distinguishable from a route 400 — and so that
  // moving either gate would be visible here.
  it.each([
    ['a number', 5],
    ['true', true],
    ['an object', {}],
    ['an array holding a valid type', ['trivia']],
    ['null', null],
  ])('rejects a non-string game_type (%s) at the schema, before any write', async (_label, value) => {
    const res = await patch({ game_type: value })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: expect.stringContaining('expected string') })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('rejects an unknown STRING game_type in the handler, with "Invalid game_type"', async () => {
    const res = await patch({ game_type: 'not_a_real_game' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid game_type' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it.each([...TRUTHY_NON_STRING, ...FALSY_NON_STRING, ['null', null] as [string, unknown]])(
    'rejects a non-string status (%s) at the schema, before any write',
    async (_label, value) => {
      const res = await patch({ status: value })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: expect.stringContaining('expected string') })
      expect(fromSpy).not.toHaveBeenCalled()
    }
  )

  it('rejects an unknown STRING status in the handler, with "Invalid status"', async () => {
    const res = await patch({ status: 'bogus' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid status' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it.each([
    ...TRUTHY_NON_STRING.filter(([l]) => l !== 'a short array'),
    ...FALSY_NON_STRING,
    ['null', null] as [string, unknown],
  ])('rejects a non-array tags (%s) with 400 "tags must be an array"', async (_label, value) => {
    const res = await patch({ tags: value })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'tags must be an array' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('keeps only known string tags', async () => {
    await patch({ tags: ['easy', 'nonsense', 7, null, 'party'] })
    expect(lastUpdate()).toEqual({ tags: ['easy', 'party'] })
  })

  it.each([
    ...TRUTHY_NON_STRING.filter(([l]) => l !== 'a short array'),
    ...FALSY_NON_STRING,
    ['null', null] as [string, unknown],
  ])('rejects a non-array questions (%s) with 400 "questions must be a non-empty array"', async (_label, value) => {
    const res = await patch({ questions: value })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'questions must be a non-empty array' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('writes questions with a recomputed question_count', async () => {
    await patch({ questions: [{ prompt: 'q1' }, { prompt: 'q2' }] })
    expect(lastUpdate()).toEqual({ questions: [{ prompt: 'q1' }, { prompt: 'q2' }], question_count: 2 })
  })

  it.each([
    ['true', true],
    ['an object', {}],
    ['a short array', ['a', 'b']],
    ['null', null],
    ['a non-numeric string', 'abc'],
    ['a negative number', -1],
    ['a fractional number', 1.5],
  ])('rejects an invalid price_coins (%s) with a 400 before any write', async (_label, value) => {
    const res = await patch({ price_coins: value })
    expect(res.status).toBe(400)
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('accepts a numeric-string price_coins and 0', async () => {
    await patch({ price_coins: '250' })
    expect(lastUpdate()).toEqual({ price_coins: 250 })
    updateSpy.mockClear()
    await patch({ price_coins: 0 })
    expect(lastUpdate()).toEqual({ price_coins: 0 })
  })

  // PINS MOVED DELIBERATELY. The `TODAY:` rows this replaces recorded the unfixed coercion
  // bug the block comment above still describes: `Number('')` is 0, so a blank price wrote
  // `price_coins = 0` and silently made a paid pack free, and `Number('0x10')` was 16. The
  // price block now only coerces an unambiguous decimal-integer string (padding trimmed), so
  // '' and '0x10' are 400s; ' 250 ' is unchanged at 250. An explicit 0 still means free.
  // The full matrix, both action shapes included, lives in route.price-coins.test.ts.
  it.each([
    ['an empty string', ''],
    ['a whitespace string', '   '],
    ['a hex string', '0x10'],
  ])('rejects a blank or ambiguous price_coins string (%s) with a 400', async (_label, value) => {
    const res = await patch({ price_coins: value })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: `price_coins must be an integer between 0 and ${MAX_PRICE_COINS}`,
    })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('still coerces a padded decimal-integer string', async () => {
    await patch({ price_coins: ' 250 ' })
    expect(lastUpdate()).toEqual({ price_coins: 250 })
  })
})
