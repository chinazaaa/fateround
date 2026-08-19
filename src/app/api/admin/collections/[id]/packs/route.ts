import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Add a dataset (question_pack) to this collection.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { pack_id, sort_order } = (body ?? {}) as Record<string, unknown>
  if (typeof pack_id !== 'string' || !pack_id) return NextResponse.json({ error: 'pack_id required' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // Guard: the pack must exist (FK would also catch this, but a clear 404 is friendlier).
  const { data: pack } = await supabase.from('question_packs').select('id').eq('id', pack_id).maybeSingle()
  if (!pack) return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })

  const { error } = await supabase.from('question_pack_collections').upsert(
    {
      collection_id: id,
      pack_id,
      sort_order: typeof sort_order === 'number' ? Math.trunc(sort_order) : 0,
    },
    { onConflict: 'pack_id,collection_id' }
  )
  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/collections/[id]/packs', error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Remove a dataset from this collection.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const packId = new URL(req.url).searchParams.get('pack_id')
  if (!packId) return NextResponse.json({ error: 'pack_id required' }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from('question_pack_collections')
    .delete()
    .eq('collection_id', id)
    .eq('pack_id', packId)
  if (error)
    return NextResponse.json({ error: internalErrorMessage('admin/collections/[id]/packs', error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
