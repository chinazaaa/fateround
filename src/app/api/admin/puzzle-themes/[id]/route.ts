import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  isPuzzleThemeDifficulty,
  parsePuzzleThemeCsv,
  PUZZLE_THEME_MIN_ENTRIES,
  PUZZLE_THEME_MAX_NAME,
  type PuzzleThemeGameType,
} from '@/lib/puzzle-themes'

// Full theme incl. entries (for the admin edit form). Entries are admin-only — never exposed
// on the public route, since they hold crossword/scramble answers.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('puzzle_themes')
    .select('id, game_type, name, difficulty, entries, entry_count, is_builtin, created_at, updated_at, price_coins')
    .eq('id', id)
    .maybeSingle()

  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/puzzle-themes/[id]', error) }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Theme not found' }, { status: 404 })
  return NextResponse.json({ theme: data })
}

// Edit name / difficulty and optionally replace the word pool with a new CSV.
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
  const { name, difficulty, csv, price_coins } = (body ?? {}) as Record<string, unknown>

  const supabase = getSupabaseAdmin()
  // Need the game_type to parse a replacement CSV against the right item shape.
  const { data: existing, error: readErr } = await supabase
    .from('puzzle_themes')
    .select('game_type')
    .eq('id', id)
    .maybeSingle()
  if (readErr)
    return NextResponse.json({ error: internalErrorMessage('admin/puzzle-themes/[id]', readErr) }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Theme not found' }, { status: 404 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (name !== undefined) {
    const cleanName = typeof name === 'string' ? name.trim() : ''
    if (!cleanName) return NextResponse.json({ error: 'A theme name is required' }, { status: 400 })
    if (cleanName.length > PUZZLE_THEME_MAX_NAME) {
      return NextResponse.json(
        { error: `Theme name must be ${PUZZLE_THEME_MAX_NAME} characters or fewer` },
        { status: 400 }
      )
    }
    update.name = cleanName
  }

  if (difficulty !== undefined) {
    const diff = difficulty == null || difficulty === '' ? null : difficulty
    if (diff !== null && !isPuzzleThemeDifficulty(diff)) {
      return NextResponse.json({ error: 'difficulty must be easy, medium, hard, or empty' }, { status: 400 })
    }
    update.difficulty = diff
  }

  if (price_coins !== undefined) {
    // Same coerce + bounds check as the create route. 0 is allowed to flip a
    // paid theme back to free without needing a dedicated "unpublish" call.
    const MAX_PRICE_COINS = 10_000
    const n = typeof price_coins === 'string' ? Number(price_coins) : (price_coins as number)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_PRICE_COINS) {
      return NextResponse.json(
        { error: `price_coins must be an integer between 0 and ${MAX_PRICE_COINS}` },
        { status: 400 }
      )
    }
    update.price_coins = n
  }

  let stats: ReturnType<typeof parsePuzzleThemeCsv> | null = null
  if (csv !== undefined) {
    if (typeof csv !== 'string' || !csv.trim()) {
      return NextResponse.json({ error: 'CSV, when provided, must be a non-empty word list' }, { status: 400 })
    }
    stats = parsePuzzleThemeCsv(existing.game_type as PuzzleThemeGameType, csv)
    if (stats.entries.length < PUZZLE_THEME_MIN_ENTRIES) {
      return NextResponse.json(
        { error: `Need at least ${PUZZLE_THEME_MIN_ENTRIES} valid words (got ${stats.entries.length}).`, stats },
        { status: 400 }
      )
    }
    update.entries = stats.entries
    update.entry_count = stats.entries.length
  }

  const { data, error } = await supabase
    .from('puzzle_themes')
    .update(update)
    .eq('id', id)
    .select('id, game_type, name, difficulty, entry_count')
    .single()

  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/puzzle-themes/[id]', error) }, { status: 500 })
  return NextResponse.json({
    theme: data,
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
  const { error } = await supabase.from('puzzle_themes').delete().eq('id', id)
  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/puzzle-themes/[id]', error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
