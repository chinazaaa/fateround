import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { platformGameDef, PLATFORM_CONTENT_MAX_LABEL } from '@/lib/platform-content'

// List batches (metadata only — never the entries, which can be answer-bearing).
export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gameType = new URL(req.url).searchParams.get('game_type')
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('platform_content')
    .select('id, game_type, variant, label, entry_count, is_active, sort_order, builtin_key, created_at, updated_at')
    .order('game_type', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (gameType) query = query.eq('game_type', gameType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/platform-content', error) }, { status: 500 })
  return NextResponse.json({ batches: data })
}

// Create a batch from admin editor text.
export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { game_type, variant, label, content } = (body ?? {}) as Record<string, unknown>

  if (typeof game_type !== 'string') return NextResponse.json({ error: 'game_type required' }, { status: 400 })
  const def = platformGameDef(game_type, typeof variant === 'string' ? variant : null)
  if (!def) return NextResponse.json({ error: 'Unsupported game_type' }, { status: 400 })
  if (typeof label !== 'string' || !label.trim()) return NextResponse.json({ error: 'Label required' }, { status: 400 })
  if (label.trim().length > PLATFORM_CONTENT_MAX_LABEL)
    return NextResponse.json({ error: 'Label too long' }, { status: 400 })
  if (typeof content !== 'string') return NextResponse.json({ error: 'Content required' }, { status: 400 })

  const parsed = def.parse(content)
  if (parsed.entries.length < def.minEntries)
    return NextResponse.json({ error: `Need at least ${def.minEntries} entries`, stats: parsed }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('platform_content')
    .insert({
      game_type: def.gameType,
      variant: def.variant ?? null,
      label: label.trim(),
      entries: parsed.entries,
      entry_count: parsed.entries.length,
    })
    .select('id, game_type, variant, label, entry_count, is_active, sort_order, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: internalErrorMessage('admin/platform-content', error) }, { status: 500 })
  return NextResponse.json({
    batch: data,
    stats: { totalRows: parsed.totalRows, skippedRows: parsed.skippedRows, duplicateRows: parsed.duplicateRows },
  })
}
