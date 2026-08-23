import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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

// Shop-tile prices are bounded so a stray typo can't publish a 10-million-coin
// pack. Same ceiling as `purchase_item` uses server-side.
const MAX_PRICE_COINS = 10_000

const VALID_GAME_TYPES = [
  'trivia',
  'would_you_rather',
  'most_likely_to',
  'this_or_that',
  'never_have_i_ever',
  'describe_it',
  'quick_draw',
  'codewords',
  'pick_a_number',
  'who_said_this',
]
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
      if (!VALID_GAME_TYPES.includes(game_type))
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
      if (description !== null && typeof description === 'string' && description.length > 500)
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
      // Coerce number-like inputs (the admin form ships strings from a number
      // input) but reject anything that isn't a non-negative integer within
      // the shop's pricing bounds. 0 is allowed — it flips a paid pack back
      // to free without needing a separate "unpublish price" endpoint.
      const n = typeof price_coins === 'string' ? Number(price_coins) : (price_coins as number)
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
