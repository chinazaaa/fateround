import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { platformGameDef, PLATFORM_CONTENT_MAX_LABEL } from '@/lib/platform-content'

// Full row including entries (admin-only) — powers the edit form's line editor.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data, error } = await getSupabaseAdmin()
    .from('platform_content')
    .select('id, game_type, variant, label, entries, entry_count, is_active, sort_order, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/platform-content/[id]', error) }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  const def = platformGameDef(data.game_type as string, (data.variant as string | null) ?? null)
  const text = def ? def.toText(Array.isArray(data.entries) ? data.entries : []) : ''
  return NextResponse.json({ batch: data, text })
}

// Edit label / active / sort_order, and optionally replace entries from new editor text.
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
  const { label, content, is_active, sort_order } = (body ?? {}) as Record<string, unknown>

  const supabase = getSupabaseAdmin()

  // Look up the batch's game_type/variant so a replacement is parsed against the right shape.
  const { data: existing, error: findError } = await supabase
    .from('platform_content')
    .select('game_type, variant')
    .eq('id', id)
    .maybeSingle()
  if (findError)
    return NextResponse.json({ error: internalErrorMessage('admin/platform-content/[id]', findError) }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let stats: { totalRows: number; skippedRows: number; duplicateRows: number } | null = null

  if (label !== undefined) {
    if (typeof label !== 'string' || !label.trim())
      return NextResponse.json({ error: 'Invalid label' }, { status: 400 })
    if (label.trim().length > PLATFORM_CONTENT_MAX_LABEL)
      return NextResponse.json({ error: 'Label too long' }, { status: 400 })
    updates.label = label.trim()
  }
  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') return NextResponse.json({ error: 'Invalid is_active' }, { status: 400 })
    updates.is_active = is_active
  }
  if (sort_order !== undefined) {
    if (typeof sort_order !== 'number') return NextResponse.json({ error: 'Invalid sort_order' }, { status: 400 })
    updates.sort_order = sort_order
  }
  if (content !== undefined) {
    if (typeof content !== 'string') return NextResponse.json({ error: 'Invalid content' }, { status: 400 })
    const def = platformGameDef(existing.game_type as string, (existing.variant as string | null) ?? null)
    if (!def) return NextResponse.json({ error: 'Unsupported game_type' }, { status: 400 })
    const parsed = def.parse(content)
    if (parsed.entries.length < def.minEntries)
      return NextResponse.json({ error: `Need at least ${def.minEntries} entries`, stats: parsed }, { status: 400 })
    updates.entries = parsed.entries
    updates.entry_count = parsed.entries.length
    stats = { totalRows: parsed.totalRows, skippedRows: parsed.skippedRows, duplicateRows: parsed.duplicateRows }
  }

  const { data, error } = await supabase
    .from('platform_content')
    .update(updates)
    .eq('id', id)
    .select('id, game_type, variant, label, entry_count, is_active, sort_order, created_at, updated_at')
    .single()
  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/platform-content/[id]', error) }, { status: 500 })
  return NextResponse.json({ batch: data, stats })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await getSupabaseAdmin().from('platform_content').delete().eq('id', id)
  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/platform-content/[id]', error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
