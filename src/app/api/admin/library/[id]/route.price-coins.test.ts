import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { MAX_PRICE_COINS } from '@/lib/coins/pricing'

/**
 * PATCH /api/admin/library/[id] — the `price_coins` value matrix.
 *
 * This is the money-adjacent field: `price_coins` is what the coin shop charges players to
 * unlock a pack, and `purchase_item()` reads the same column. Getting it wrong does not throw,
 * it silently re-prices a pack — so every input shape is pinned here with both the
 * `{status, body}` the route answers AND the exact update payload handed to Supabase.
 *
 * The bug this file was written for: the block coerced with bare `Number()` —
 *
 *     const n = typeof price_coins === 'string' ? Number(price_coins) : (price_coins as number)
 *     if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_PRICE_COINS) ...
 *
 * `Number('')` is 0. Finite, an integer, in range — so an empty string passed every guard and
 * wrote `price_coins = 0`, turning a paid pack free. `Number('   ')` is 0 too. And because bare
 * `Number()` reads every numeric notation JS knows, a mistyped price was written rather than
 * reported: `'0x10'` -> 16, `'1e3'` -> 1000, `'2.5e2'` / `'250.'` -> 250, `'0b101'` -> 5,
 * `'-0'` -> 0 (`-0 < 0` is false, so it passed the range guard too).
 *
 * What the only first-party client actually posts, from `src/app/admin/library/page.tsx`:
 *
 *     const parsedPrice = priceCoins === '' ? 0 : Number(priceCoins)   // line 246
 *     ...
 *     body: JSON.stringify({ ..., price_coins: parsedPrice })           // line 267
 *
 * It resolves a cleared input to the NUMBER 0 before the request is built, and posts a number
 * for every other value too — this client never sends a string at all, and it cannot express
 * "leave the price alone" (it always sends the whole pack). So "cleared means free" is already
 * expressed as an explicit `0`, and a `''` arriving at this route is never the admin form: it
 * is some other caller whose intent is unknowable. It gets a 400.
 *
 * `0` itself stays valid — it is the documented way to flip a paid pack back to free — so the
 * fix is emphatically NOT "reject falsy". The distinction drawn is between an explicit zero
 * (the number `0`, or the string `'0'`) and a blank/ambiguous string.
 *
 * Strings stay accepted, but only as a plain decimal integer after trimming: `' 250 '` is still
 * 250 (padding is not ambiguity) and leading zeros still parse, while every other string shape —
 * blank, hex, binary, octal, exponent, signed, fractional — now gets the route's existing price
 * 400. The rows below are a sample of that set, not an exhaustive list of it.
 *
 * Per-field validation is point-of-use, exactly as in PRs #1179/#1180/#1181; the schema keeps
 * `price_coins: z.unknown().optional()`. A schema-level `z.number()` would turn requests this
 * route handles today into "expected number, received string" 400s — the #1163 / #1153 class of
 * regression called out in CONTRIBUTING.md.
 *
 * Path coverage: the handler's only gate is `assertAdminRequest` (an `admin_session` cookie
 * verified by `verifyAdminSessionToken`), driven here with a REAL signed cookie rather than a
 * stubbed-away gate. Past it the handler forks on `action`: `'approve'` and `'reject'`
 * short-circuit into the status-only branch and never read `price_coins`; every other value —
 * including an absent `action` — falls through to the field-edit branch, the single path that
 * reaches the price block. The whole matrix runs on BOTH of those shapes, and the two
 * short-circuits are pinned so a future edit cannot quietly start pricing on them.
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

function patch(body: unknown) {
  return PATCH(
    new NextRequest(`https://test.local/api/admin/library/${PACK_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PACK_ID }) }
  )
}

/** The single update payload handed to `.update()`. */
function lastUpdate(): Record<string, unknown> {
  expect(updateSpy).toHaveBeenCalledTimes(1)
  return updateSpy.mock.calls[0][0] as Record<string, unknown>
}

const PRICE_ERROR = `price_coins must be an integer between 0 and ${MAX_PRICE_COINS}`

/**
 * The two request shapes that reach the field-edit branch. `action` absent is what the admin
 * form sends; an `action` the handler does not recognise falls through to the same branch, and
 * both are exercised so the matrix cannot be passing through only one of them.
 */
const EDIT_SHAPES: [string, Record<string, unknown>][] = [
  ['action absent', {}],
  ['a non-matching action', { action: 'edit' }],
]

/** Inputs the route accepts, with the number they must land in the update payload as. */
const ACCEPTED: [string, unknown, number][] = [
  ['the number 0', 0, 0],
  ['the string "0"', '0', 0],
  ['a positive number', 250, 250],
  ['a numeric string', '250', 250],
  ['a padded numeric string', ' 250 ', 250],
  ['MAX_PRICE_COINS', MAX_PRICE_COINS, MAX_PRICE_COINS],
  ['MAX_PRICE_COINS as a string', String(MAX_PRICE_COINS), MAX_PRICE_COINS],
]

/**
 * Inputs the route rejects. Every one of these was already a 400 before the empty-string fix, so
 * nothing in this list moved. What the fix newly rejects is *strings that are not plain decimal
 * integers*; the MOVED PINS block at the bottom samples that set.
 */
const REJECTED: [string, unknown][] = [
  ['a non-numeric string', 'abc'],
  ['the string "Infinity"', 'Infinity'],
  ['null', null],
  ['true', true],
  ['an object', {}],
  ['an array', []],
  ['a negative number', -1],
  ['a negative numeric string', '-1'],
  ['a fractional number', 1.5],
  ['a fractional numeric string', '1.5'],
  ['MAX_PRICE_COINS + 1', MAX_PRICE_COINS + 1],
  ['MAX_PRICE_COINS + 1 as a string', String(MAX_PRICE_COINS + 1)],
  ['NaN (JSON-serialised to null)', NaN],
]

describe.each(EDIT_SHAPES)('PATCH price_coins — field-edit branch (%s)', (_shape, base) => {
  it.each(ACCEPTED)('accepts %s and writes price_coins = %s', async (_label, value, stored) => {
    const res = await patch({ ...base, price_coins: value })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(lastUpdate()).toEqual({ price_coins: stored })
    expect(eqSpy).toHaveBeenCalledWith('id', PACK_ID)
  })

  it.each(REJECTED)('rejects %s with a 400 and writes nothing', async (_label, value) => {
    const res = await patch({ ...base, price_coins: value })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: PRICE_ERROR })
    expect(fromSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('leaves price_coins out of the update payload entirely when it is absent', async () => {
    const res = await patch({ ...base, title: 'Renamed pack' })
    expect(res.status).toBe(200)
    const payload = lastUpdate()
    expect(payload).toEqual({ title: 'Renamed pack' })
    expect('price_coins' in payload).toBe(false)
  })

  it('writes an explicit 0 alongside the other edited fields', async () => {
    const res = await patch({ ...base, title: 'Now free', price_coins: 0 })
    expect(res.status).toBe(200)
    expect(lastUpdate()).toEqual({ title: 'Now free', price_coins: 0 })
  })

  it('answers the price gate before writing anything else in the same request', async () => {
    const res = await patch({ ...base, title: 'Renamed pack', price_coins: -1 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: PRICE_ERROR })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('surfaces a database rejection of a price write as a 500', async () => {
    state.updateError = { message: 'boom' }
    const res = await patch({ ...base, price_coins: 250 })
    expect(res.status).toBe(500)
    expect(lastUpdate()).toEqual({ price_coins: 250 })
  })
})

describe('PATCH price_coins — the approve/reject short-circuits never price', () => {
  it.each([
    ['approve', 'approved'],
    ['reject', 'rejected'],
  ])('action=%s ignores price_coins entirely', async (action, status) => {
    // An empty string here is the exact payload that used to zero a price on the field-edit
    // branch; on these branches it has never been read, and must stay unread.
    const res = await patch({ action, price_coins: '' })
    expect(res.status).toBe(200)
    const payload = lastUpdate()
    expect(payload.status).toBe(status)
    expect('price_coins' in payload).toBe(false)
  })

  it('action=approve ignores an otherwise-rejected price_coins', async () => {
    const res = await patch({ action: 'approve', price_coins: 'abc' })
    expect(res.status).toBe(200)
    expect('price_coins' in lastUpdate()).toBe(false)
  })

  it('action=reject ignores a valid price_coins', async () => {
    const res = await patch({ action: 'reject', price_coins: 250 })
    expect(res.status).toBe(200)
    expect(lastUpdate()).toEqual({ status: 'rejected' })
  })
})

describe('PATCH price_coins — blank and ambiguous strings', () => {
  // MOVED PINS. These rows previously asserted `TODAY:` behaviour — the values below the arrows
  // are what the route wrote before this PR. They are a representative sample, not the whole set:
  // any string bare `Number()` could read now 400s, including '250.0', '2.5e2', '0b101', '0o17'
  // and '-0', each of which used to be written as a price.
  //
  //   ''       ->  price_coins = 0      (a cleared field silently made a paid pack free)
  //   '   '    ->  price_coins = 0
  //   '\t\n'   ->  price_coins = 0
  //   '0x10'   ->  price_coins = 16
  //   '1e3'    ->  price_coins = 1000
  //   '+250'   ->  price_coins = 250
  //
  // They are 400s now. The corresponding `TODAY:` block in route.field-types.test.ts moved with
  // them. No numeric input, no plain decimal string, and no explicit `0` changed.
  it.each([
    ['an empty string', ''],
    ['a whitespace-only string', '   '],
    ['a tab/newline-only string', '\t\n'],
    ['a hex string', '0x10'],
    ['an exponent string', '1e3'],
    ['a plus-signed string', '+250'],
    ['a trailing-dot string', '250.'],
    ['an exponent-with-mantissa string', '2.5e2'],
    ['a binary string', '0b101'],
    ['an octal string', '0o17'],
    ['negative zero as a string', '-0'],
  ])('rejects %s with a 400 and writes nothing', async (_label, value) => {
    const res = await patch({ price_coins: value })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: PRICE_ERROR })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  // Unchanged by this PR and pinned so the "plain decimal integer" wording is not read as
  // something stricter: a leading-zero string parsed before and still parses.
  it.each([
    ['007', '007', 7],
    ['00250', '00250', 250],
    ['0000', '0000', 0],
  ])('still accepts a leading-zero string (%s) as %s', async (_label, value, stored) => {
    const res = await patch({ price_coins: value })
    expect(res.status).toBe(200)
    expect(lastUpdate()).toEqual({ price_coins: stored })
  })

  it('still treats an explicit 0 as "make this pack free"', async () => {
    const res = await patch({ price_coins: 0 })
    expect(res.status).toBe(200)
    expect(lastUpdate()).toEqual({ price_coins: 0 })
  })

  it('still treats the string "0" as "make this pack free"', async () => {
    const res = await patch({ price_coins: '0' })
    expect(res.status).toBe(200)
    expect(lastUpdate()).toEqual({ price_coins: 0 })
  })
})
