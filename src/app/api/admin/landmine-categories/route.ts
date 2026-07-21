import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  parseLandmineCategoryWords,
  LANDMINE_CATEGORY_MIN_ENTRIES,
  LANDMINE_CATEGORY_MAX_NAME,
} from '@/lib/landmine-categories'

// List every Landmine category with metadata + counts. Entries are omitted here (they're the
// secret mine pool); GET /[id] returns them for editing.
export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('landmine_categories')
    .select('id, name, entry_count, is_active, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/landmine-categories', error) }, { status: 500 })

  return NextResponse.json({ categories: data })
}

// Create a category from a word list. Body: { name, words, is_active?, sort_order? }.
export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { name, words, is_active, sort_order } = (body ?? {}) as Record<string, unknown>

  const cleanName = typeof name === 'string' ? name.trim() : ''
  if (!cleanName) return NextResponse.json({ error: 'A category name is required' }, { status: 400 })
  if (cleanName.length > LANDMINE_CATEGORY_MAX_NAME) {
    return NextResponse.json(
      { error: `Category name must be ${LANDMINE_CATEGORY_MAX_NAME} characters or fewer` },
      { status: 400 }
    )
  }
  if (typeof words !== 'string' || !words.trim()) {
    return NextResponse.json({ error: 'A list of words is required' }, { status: 400 })
  }

  const parsed = parseLandmineCategoryWords(words)
  if (parsed.entries.length < LANDMINE_CATEGORY_MIN_ENTRIES) {
    return NextResponse.json(
      {
        error: `Need at least ${LANDMINE_CATEGORY_MIN_ENTRIES} valid words (got ${parsed.entries.length}).`,
        stats: parsed,
      },
      { status: 400 }
    )
  }

  const insert: Record<string, unknown> = {
    name: cleanName,
    entries: parsed.entries,
    entry_count: parsed.entries.length,
  }
  if (typeof is_active === 'boolean') insert.is_active = is_active
  if (typeof sort_order === 'number' && Number.isFinite(sort_order)) insert.sort_order = Math.trunc(sort_order)

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('landmine_categories')
    .insert(insert)
    .select('id, name, entry_count, is_active, sort_order')
    .single()

  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/landmine-categories', error) }, { status: 500 })

  return NextResponse.json({
    category: data,
    stats: { totalRows: parsed.totalRows, skippedRows: parsed.skippedRows, duplicateRows: parsed.duplicateRows },
  })
}
