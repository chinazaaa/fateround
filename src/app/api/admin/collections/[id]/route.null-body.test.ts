import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * PATCH /api/admin/collections/[id] parses its body inside a try/catch but reads
 * properties OUTSIDE — and does so one step later than the sibling routes:
 *
 *   try { body = await req.json() } catch { return 400 'Invalid JSON body' }
 *   const fields = validateCollectionInput(body, { requireName: false })   // survives null
 *   const b = body as Record<string, unknown>
 *   if (b.name !== undefined) ...                                          // TypeError here
 *
 * `req.json()` parses a literal `null` body SUCCESSFULLY, so the `catch` never fires.
 * `validateCollectionInput` does its own `(body ?? {})`, so it does NOT throw on null and
 * returns a valid (empty) field set — the throw happens on the very next property read,
 * from OUTSIDE the try, so the handler's returned promise REJECTS (an unhandled rejection
 * → 500 in prod) instead of answering a status. `@/lib/collections` is therefore NOT
 * mocked: its null-tolerance is exactly what makes this bug subtle.
 *
 * `assertAdminRequest` runs BEFORE the parse, so the body matrix only reaches the parse
 * with a valid admin session; gate precedence is pinned separately (null body, no session
 * → 401, not a crash).
 *
 * Every non-null scalar (5, "str", []) survives the read because property access on a
 * primitive boxes it and yields `undefined` — only `null` (and `undefined`) throw. Note
 * that a body with no recognised fields still reaches a real UPDATE carrying only
 * `updated_at`; that is pinned below rather than assumed.
 *
 * This suite pins the exact status/body for every body shape so the `?? {}` fix can only
 * move the `null` row.
 */

vi.mock('server-only', () => ({}))

const { assertAdminRequest, update } = vi.hoisted(() => ({
  assertAdminRequest: vi.fn(),
  update: vi.fn(),
}))

// Real signature: (req: NextRequest) => Promise<AdminSession | null>.
vi.mock('@/lib/admin-api', () => ({ assertAdminRequest }))

// Faithful to the real call chain in the PATCH path:
//   getSupabaseAdmin().from('content_collections').update(updates).eq('id', id)
//     .select('...').single() -> { data, error }
const result = { data: null as unknown, error: null as unknown }
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      update: (updates: Record<string, unknown>) => {
        update(table, updates)
        return {
          eq: () => ({ select: () => ({ single: async () => result }) }),
        }
      },
    }),
  }),
}))

type Patch = typeof import('./route').PATCH
let PATCH: Patch

const ROW = {
  id: 'col-1',
  slug: 'party-night',
  name: 'Party Night',
  description: null,
  audience: null,
  icon: null,
  is_active: true,
  sort_order: 0,
  builtin_key: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
}

beforeAll(async () => {
  PATCH = (await import('./route')).PATCH
}, 60_000)

beforeEach(() => {
  assertAdminRequest.mockReset()
  assertAdminRequest.mockResolvedValue({ email: 'admin@example.com' })
  update.mockReset()
  result.data = ROW
  result.error = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function patch(body: string) {
  return PATCH(
    new NextRequest('https://test.local/api/admin/collections/col-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ id: 'col-1' }) }
  )
}

describe('PATCH /api/admin/collections/[id] — null JSON body', () => {
  it('answers 200 with the updated collection for a literal null body, exactly like {}', async () => {
    const res = await patch('null')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ collection: ROW })
    // Same as `{}`: nothing recognised, so only updated_at is written.
    expect(update).toHaveBeenCalledWith('content_collections', { updated_at: expect.any(String) })
  })

  // A body with no recognised fields is NOT rejected — it reaches a real UPDATE that
  // writes only `updated_at` and echoes the row back.
  it.each([
    ['an empty object body', '{}'],
    ['a numeric scalar body', '5'],
    ['a string scalar body', '"str"'],
    ['an array body', '[]'],
  ])('answers 200 and updates only updated_at for %s', async (_label, body) => {
    const res = await patch(body)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ collection: ROW })
    expect(update).toHaveBeenCalledWith('content_collections', { updated_at: expect.any(String) })
  })

  it.each([
    ['a malformed body', '{"name":'],
    ['an empty body', ''],
  ])('answers 400 "Invalid JSON body" for %s', async (_label, body) => {
    const res = await patch(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON body' })
    expect(update).not.toHaveBeenCalled()
  })

  // Gate precedence: the auth check runs BEFORE the body is read, so an unauthenticated
  // null body must answer 401 rather than crash on the property read.
  it('answers 401 for a null body with no admin session, before the body is read', async () => {
    assertAdminRequest.mockResolvedValue(null)
    const res = await patch('null')
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(update).not.toHaveBeenCalled()
  })

  it('answers 401 for a fully valid body with no admin session', async () => {
    assertAdminRequest.mockResolvedValue(null)
    const res = await patch('{"name":"Party Night","slug":"Party Night"}')
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(update).not.toHaveBeenCalled()
  })

  // Past every gate, into the terminal success response.
  it('answers 200 and writes every supplied field for a fully valid body', async () => {
    const res = await patch(
      '{"name":"Party Night","slug":"Party Night","description":"Loud ones","audience":"adults","icon":"🎉","is_active":false,"sort_order":3}'
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ collection: ROW })
    expect(update).toHaveBeenCalledWith('content_collections', {
      updated_at: expect.any(String),
      name: 'Party Night',
      description: 'Loud ones',
      audience: 'adults',
      icon: '🎉',
      is_active: false,
      sort_order: 3,
      slug: 'party-night',
    })
  })

  // Validation failures — a supplied-but-invalid field, including the empty name that
  // `requireName: false` still rejects once `name` is present at all.
  it.each([
    ['an empty name', '{"name":"   "}', 'Name required'],
    ['a non-string name', '{"name":5}', 'Name required'],
    ['a non-boolean is_active', '{"is_active":"yes"}', 'Invalid is_active'],
    ['a non-numeric sort_order', '{"sort_order":"3"}', 'Invalid sort_order'],
    ['a slug that normalizes to nothing', '{"slug":"!!!"}', 'Invalid slug'],
  ])('answers 400 for %s', async (_label, body, error) => {
    const res = await patch(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error })
    expect(update).not.toHaveBeenCalled()
  })

  it('answers 409 on a unique-slug violation', async () => {
    result.data = null
    result.error = { code: '23505', message: 'duplicate key' }
    const res = await patch('{"slug":"party-night"}')
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'A collection with that slug already exists' })
  })
})
