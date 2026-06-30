import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const VALID_GAME_TYPES = [
  'trivia',
  'would_you_rather',
  'most_likely_to',
  'this_or_that',
  'never_have_i_ever',
  'describe_it',
  'codewords',
  'pick_a_number',
]
const VALID_STATUSES = ['pending', 'approved', 'rejected']
const VALID_TAGS = ['easy', 'intermediate', 'advanced', 'family-friendly', '18+', 'party', 'spicy']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { action, title, game_type, author_name, description, tags, status } = body

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
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase.from('question_packs').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
