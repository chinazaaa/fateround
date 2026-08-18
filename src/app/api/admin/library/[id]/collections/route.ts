import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Pack-side view/edit of collection membership, so admins can assign a pack to collections straight
// from the /admin/library Edit panel (instead of only from the collection side). Returns the full
// list of collections (for the chip choices) plus the ids this pack currently belongs to.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const { data: collections, error: collErr } = await supabase
    .from('content_collections')
    .select('id, name, is_active')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (collErr)
    return NextResponse.json(
      { error: internalErrorMessage('admin/library/[id]/collections', collErr) },
      { status: 500 }
    )

  const { data: members, error: memberErr } = await supabase
    .from('question_pack_collections')
    .select('collection_id')
    .eq('pack_id', id)
  if (memberErr)
    return NextResponse.json(
      { error: internalErrorMessage('admin/library/[id]/collections', memberErr) },
      { status: 500 }
    )

  return NextResponse.json({
    collections: collections ?? [],
    collectionIds: (members ?? []).map((m) => m.collection_id as string),
  })
}

// Replace this pack's collection membership with the given set (diff add/remove).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const raw = (body as Record<string, unknown>)?.collection_ids
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string'))
    return NextResponse.json({ error: 'collection_ids must be an array of strings' }, { status: 400 })
  const desired = new Set(raw as string[])

  const supabase = getSupabaseAdmin()

  // Guard: the pack must exist (a clear 404 beats an opaque FK error).
  const { data: pack } = await supabase.from('question_packs').select('id').eq('id', id).maybeSingle()
  if (!pack) return NextResponse.json({ error: 'Pack not found' }, { status: 404 })

  const { data: existingRows, error: readErr } = await supabase
    .from('question_pack_collections')
    .select('collection_id')
    .eq('pack_id', id)
  if (readErr)
    return NextResponse.json(
      { error: internalErrorMessage('admin/library/[id]/collections', readErr) },
      { status: 500 }
    )
  const existing = new Set((existingRows ?? []).map((r) => r.collection_id as string))

  const toAdd = [...desired].filter((c) => !existing.has(c))
  const toRemove = [...existing].filter((c) => !desired.has(c))

  if (toAdd.length) {
    const { error } = await supabase
      .from('question_pack_collections')
      .insert(toAdd.map((collection_id) => ({ collection_id, pack_id: id, sort_order: 0 })))
    if (error)
      return NextResponse.json(
        { error: internalErrorMessage('admin/library/[id]/collections', error) },
        { status: 500 }
      )
  }
  if (toRemove.length) {
    const { error } = await supabase
      .from('question_pack_collections')
      .delete()
      .eq('pack_id', id)
      .in('collection_id', toRemove)
    if (error)
      return NextResponse.json(
        { error: internalErrorMessage('admin/library/[id]/collections', error) },
        { status: 500 }
      )
  }

  return NextResponse.json({ ok: true, added: toAdd.length, removed: toRemove.length })
}
