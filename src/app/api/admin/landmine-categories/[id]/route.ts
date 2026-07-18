import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  parseLandmineCategoryWords,
  LANDMINE_CATEGORY_MIN_ENTRIES,
  LANDMINE_CATEGORY_MAX_NAME,
} from '@/lib/landmine-categories'

// Full category incl. entries (for the admin edit form). Entries are admin-only — never exposed
// on the public route, since they are the secret mine pool.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('landmine_categories')
    .select('id, name, entries, entry_count, is_active, sort_order, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/landmine-categories/[id]', error) }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  return NextResponse.json({ category: data })
}

// Edit name / active / order and optionally replace the word pool with a new list.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { name, words, is_active, sort_order } = (body ?? {}) as Record<string, unknown>

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (name !== undefined) {
    const cleanName = typeof name === 'string' ? name.trim() : ''
    if (!cleanName) return NextResponse.json({ error: 'A category name is required' }, { status: 400 })
    if (cleanName.length > LANDMINE_CATEGORY_MAX_NAME) {
      return NextResponse.json(
        { error: `Category name must be ${LANDMINE_CATEGORY_MAX_NAME} characters or fewer` },
        { status: 400 }
      )
    }
    update.name = cleanName
  }

  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 })
    }
    update.is_active = is_active
  }

  if (sort_order !== undefined) {
    if (typeof sort_order !== 'number' || !Number.isFinite(sort_order)) {
      return NextResponse.json({ error: 'sort_order must be a number' }, { status: 400 })
    }
    update.sort_order = Math.trunc(sort_order)
  }

  let stats: ReturnType<typeof parseLandmineCategoryWords> | null = null
  if (words !== undefined) {
    if (typeof words !== 'string' || !words.trim()) {
      return NextResponse.json({ error: 'Word list, when provided, must be non-empty' }, { status: 400 })
    }
    stats = parseLandmineCategoryWords(words)
    if (stats.entries.length < LANDMINE_CATEGORY_MIN_ENTRIES) {
      return NextResponse.json(
        { error: `Need at least ${LANDMINE_CATEGORY_MIN_ENTRIES} valid words (got ${stats.entries.length}).`, stats },
        { status: 400 }
      )
    }
    update.entries = stats.entries
    update.entry_count = stats.entries.length
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('landmine_categories')
    .update(update)
    .eq('id', id)
    .select('id, name, entry_count, is_active, sort_order')
    .single()

  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/landmine-categories/[id]', error) }, { status: 500 })
  return NextResponse.json({
    category: data,
    stats: stats
      ? { totalRows: stats.totalRows, skippedRows: stats.skippedRows, duplicateRows: stats.duplicateRows }
      : null,
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('landmine_categories').delete().eq('id', id)
  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/landmine-categories/[id]', error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
