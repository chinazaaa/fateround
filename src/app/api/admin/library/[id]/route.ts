import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { MAX_PRICE_COINS } from '@/lib/coins/pricing'
import { QUESTION_PACK_GAME_TYPES } from '@/lib/question-pack-game-types'

// Permissive shape: fields the handler runtime-checks stay `unknown` so its
// typeof/Array.isArray guards remain live (identical messages); game_type/status are
// typed string only because they go straight to `.includes()`. The schema's real job is
// to turn a malformed/non-object body into a clean 400 instead of the previous 500.
const libraryPatchSchema = z.object({
  action: z.unknown().optional(),
  title: z.unknown().optional(),
  game_type: z.string().optional(),
  author_name: z.unknown().optional(),
  description: z.unknown().optional(),
  tags: z.unknown().optional(),
  status: z.string().optional(),
  questions: z.unknown().optional(),
  price_coins: z.unknown().optional(),
})

/** A plain decimal integer, padding aside. Leading zeros are fine; nothing else is. */
const DECIMAL_INTEGER = /^\d+$/

/**
 * `price_coins` off the wire -> the number the route's range guard judges, or NaN for anything
 * that is not one. Numbers pass through untouched so the existing `Number.isFinite` /
 * `Number.isInteger` / range guards stay the only gate on them; every other type is NaN, which
 * those same guards already turned into the price 400 (they do not coerce, so `true`/`{}`/`[]`/
 * `null` failed `Number.isFinite` before this existed).
 */
function toPriceCoins(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return NaN
  const trimmed = value.trim()
  return DECIMAL_INTEGER.test(trimmed) ? Number(trimmed) : NaN
}

const VALID_STATUSES = ['pending', 'approved', 'rejected']
const VALID_TAGS = ['easy', 'intermediate', 'advanced', 'family-friendly', '18+', 'party', 'spicy']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: body, error: bodyError } = await parseJsonBody(req, libraryPatchSchema)
  if (bodyError) return bodyError
  const { action, title, game_type, author_name, description, tags, status, questions, price_coins } = body

  const supabase = getSupabaseAdmin()
  const updates: Record<string, unknown> = {}

  if (action === 'approve') {
    updates.status = 'approved'
    updates.approved_at = new Date().toISOString()
  } else if (action === 'reject') {
    updates.status = 'rejected'
  } else {
    // Full field edit
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0)
        return NextResponse.json({ error: 'Invalid title' }, { status: 400 })
      if (title.trim().length > 100) return NextResponse.json({ error: 'Title too long' }, { status: 400 })
      updates.title = title.trim()
    }
    if (game_type !== undefined) {
      // The list itself lives in @/lib/question-pack-game-types, pinned set-equal to the
      // question_packs_game_type_check constraint in route.field-types.test.ts. It is consulted
      // directly rather than aliased to a local const: a local copy is a place for the route to
      // drift from the pinned list again, which is the whole bug this fixes.
      if (!QUESTION_PACK_GAME_TYPES.includes(game_type))
        return NextResponse.json({ error: 'Invalid game_type' }, { status: 400 })
      updates.game_type = game_type
    }
    if (author_name !== undefined) {
      if (typeof author_name !== 'string' || author_name.trim().length === 0)
        return NextResponse.json({ error: 'Invalid author_name' }, { status: 400 })
      if (author_name.trim().length > 60) return NextResponse.json({ error: 'Author name too long' }, { status: 400 })
      updates.author_name = author_name.trim()
    }
    if (description !== undefined) {
      // `description` arrives as `unknown` off the shape-only schema, and the `typeof
      // description === 'string'` conjunct this replaces meant a non-string did not merely
      // escape the cap below — it *bypassed* it, and the raw JSON value was written into the
      // `description text` column, where PostgREST's json_populate_recordset coerces it
      // (5 -> '5', {"a":1} -> '{"a":1}', ["a","b"] -> '["a","b"]') instead of erroring.
      //
      // null stays "clear the field" and is checked first, exactly as before — a schema-level
      // `z.string().optional()` would 400 a null this route accepts today (#1163 / #1153).
      if (description !== null && typeof description !== 'string')
        return NextResponse.json({ error: 'Invalid description' }, { status: 400 })
      if (description !== null && description.length > 500)
        return NextResponse.json({ error: 'Description too long' }, { status: 400 })
      updates.description = description === '' ? null : (description ?? null)
    }
    if (tags !== undefined) {
      if (!Array.isArray(tags)) return NextResponse.json({ error: 'tags must be an array' }, { status: 400 })
      updates.tags = tags.filter((t: unknown) => typeof t === 'string' && VALID_TAGS.includes(t))
    }
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      updates.status = status
      if (status === 'approved') updates.approved_at = new Date().toISOString()
    }
    if (questions !== undefined) {
      if (!Array.isArray(questions) || questions.length === 0)
        return NextResponse.json({ error: 'questions must be a non-empty array' }, { status: 400 })
      if (questions.length > 500) return NextResponse.json({ error: 'Too many questions (max 500)' }, { status: 400 })
      updates.questions = questions
      updates.question_count = questions.length
    }
    if (price_coins !== undefined) {
      // Coerce number-like inputs but reject anything that isn't a non-negative integer within
      // the shop's pricing bounds. 0 is allowed — it flips a paid pack back to free without
      // needing a separate "unpublish price" endpoint.
      //
      // A string is only coerced when it is a plain decimal integer (padding trimmed). Bare
      // `Number()` was not that: `Number('')` and `Number('   ')` are both 0 — finite, integer,
      // in range — so a blank value silently re-priced a paid pack to free. It also read every
      // other numeric notation JS knows, so a mistyped price was written rather than reported:
      // `'0x10'` -> 16, `'1e3'` -> 1000, `'2.5e2'`/`'250.'` -> 250, `'0b101'` -> 5, `'-0'` -> 0.
      // The admin form already resolves a cleared price to the *number* 0
      // before it posts (`priceCoins === '' ? 0 : Number(priceCoins)` in
      // src/app/admin/library/page.tsx) and cannot express "leave the price alone", so a blank
      // string is never this client and its intent is unknowable — it gets a 400 rather than a
      // guess. An explicit 0 (or '0') still means free.
      //
      // Point-of-use, as in #1179/#1180/#1181: the schema stays `z.unknown().optional()`, since
      // a schema-level `z.number()` would 400 the numeric strings this route accepts today
      // (the #1163 / #1153 class of regression).
      const n = toPriceCoins(price_coins)
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_PRICE_COINS) {
        return NextResponse.json(
          { error: `price_coins must be an integer between 0 and ${MAX_PRICE_COINS}` },
          { status: 400 }
        )
      }
      updates.price_coins = n
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase.from('question_packs').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/library/id', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
