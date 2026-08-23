import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  isPuzzleThemeGameType,
  isPuzzleThemeDifficulty,
  parsePuzzleThemeCsv,
  PUZZLE_THEME_MIN_ENTRIES,
  PUZZLE_THEME_MAX_NAME,
} from '@/lib/puzzle-themes'

// List every admin theme (all game types, or one) with metadata + counts, newest first.
// Entries are omitted here (large + secret); GET /[id] returns them for editing.
export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const gameType = searchParams.get('game_type')

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('puzzle_themes')
    .select('id, game_type, name, difficulty, entry_count, is_builtin, sort_order, created_at, updated_at, price_coins')
    .order('game_type', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (gameType) query = query.eq('game_type', gameType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/puzzle-themes', error) }, { status: 500 })

  return NextResponse.json({ themes: data })
}

// Create a theme from a CSV. Body: { game_type, name, difficulty|null, csv }.
export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { game_type, name, difficulty, csv, price_coins } = (body ?? {}) as Record<string, unknown>

  if (!isPuzzleThemeGameType(game_type)) {
    return NextResponse.json({ error: 'game_type must be crossword, word_search, or word_scramble' }, { status: 400 })
  }
  const cleanName = typeof name === 'string' ? name.trim() : ''
  if (!cleanName) return NextResponse.json({ error: 'A theme name is required' }, { status: 400 })
  if (cleanName.length > PUZZLE_THEME_MAX_NAME) {
    return NextResponse.json(
      { error: `Theme name must be ${PUZZLE_THEME_MAX_NAME} characters or fewer` },
      { status: 400 }
    )
  }
  // difficulty is optional: null/'' => host chooses; otherwise it locks the game to that level.
  const diff = difficulty == null || difficulty === '' ? null : difficulty
  if (diff !== null && !isPuzzleThemeDifficulty(diff)) {
    return NextResponse.json({ error: 'difficulty must be easy, medium, hard, or empty' }, { status: 400 })
  }
  if (typeof csv !== 'string' || !csv.trim()) {
    return NextResponse.json({ error: 'A CSV of words is required' }, { status: 400 })
  }

  const parsed = parsePuzzleThemeCsv(game_type, csv)
  if (parsed.entries.length < PUZZLE_THEME_MIN_ENTRIES) {
    return NextResponse.json(
      {
        error: `Need at least ${PUZZLE_THEME_MIN_ENTRIES} valid words (got ${parsed.entries.length}).`,
        stats: parsed,
      },
      { status: 400 }
    )
  }

  // Coerce/validate shop price. 0 stays free; > 0 makes the theme premium.
  // Bounded so a typo can't publish an absurd price. Same ceiling as
  // purchase_item and the library edit route.
  const MAX_PRICE_COINS = 10_000
  let priceCoins = 0
  if (price_coins !== undefined && price_coins !== null && price_coins !== '') {
    const n = typeof price_coins === 'string' ? Number(price_coins) : (price_coins as number)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_PRICE_COINS) {
      return NextResponse.json(
        { error: `price_coins must be an integer between 0 and ${MAX_PRICE_COINS}` },
        { status: 400 }
      )
    }
    priceCoins = n
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('puzzle_themes')
    .insert({
      game_type,
      name: cleanName,
      difficulty: diff,
      entries: parsed.entries,
      entry_count: parsed.entries.length,
      price_coins: priceCoins,
    })
    .select('id, game_type, name, difficulty, entry_count, price_coins')
    .single()

  if (error) return NextResponse.json({ error: internalErrorMessage('admin/puzzle-themes', error) }, { status: 500 })

  return NextResponse.json({
    theme: data,
    stats: { totalRows: parsed.totalRows, skippedRows: parsed.skippedRows, duplicateRows: parsed.duplicateRows },
  })
}
