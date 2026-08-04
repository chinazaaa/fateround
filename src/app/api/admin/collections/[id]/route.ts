import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeSlug, validateCollectionInput } from '@/lib/collections'

// Full collection + its member datasets (pack metadata only) for the inline editor.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const { data: collection, error } = await supabase
    .from('content_collections')
    .select('id, slug, name, description, audience, icon, is_active, sort_order, builtin_key, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/collections/[id]', error) }, { status: 500 })
  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })

  const { data: members, error: memberErr } = await supabase
    .from('question_pack_collections')
    .select('pack_id, sort_order, question_packs(id, title, game_type, author_name, question_count, status)')
    .eq('collection_id', id)
    .order('sort_order', { ascending: true })
  if (memberErr)
    return NextResponse.json({ error: internalErrorMessage('admin/collections/[id]', memberErr) }, { status: 500 })

  const packs = (members ?? [])
    .map((m) => {
      const p = m.question_packs as unknown as Record<string, unknown> | null
      return p ? { ...p, sort_order: m.sort_order } : null
    })
    .filter(Boolean)

  return NextResponse.json({ collection, packs })
}

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

  const fields = validateCollectionInput(body, { requireName: false })
  if ('error' in fields) return NextResponse.json({ error: fields.error }, { status: 400 })

  const b = body as Record<string, unknown>
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.name !== undefined) updates.name = fields.name
  if (b.description !== undefined) updates.description = fields.description
  if (b.audience !== undefined) updates.audience = fields.audience
  if (b.icon !== undefined) updates.icon = fields.icon
  if (b.is_active !== undefined) updates.is_active = fields.is_active
  if (b.sort_order !== undefined) updates.sort_order = fields.sort_order
  if (b.slug !== undefined) {
    const slug = normalizeSlug(b.slug)
    if (!slug) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
    updates.slug = slug
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('content_collections')
    .update(updates)
    .eq('id', id)
    .select('id, slug, name, description, audience, icon, is_active, sort_order, builtin_key, created_at, updated_at')
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505')
      return NextResponse.json({ error: 'A collection with that slug already exists' }, { status: 409 })
    return NextResponse.json({ error: internalErrorMessage('admin/collections/[id]', error) }, { status: 500 })
  }
  return NextResponse.json({ collection: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  // question_pack_collections rows cascade-delete via the FK; the datasets themselves stay.
  const { error } = await getSupabaseAdmin().from('content_collections').delete().eq('id', id)
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/collections/[id]', error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
