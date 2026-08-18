import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeSlug, validateCollectionInput } from '@/lib/collections'

// List all collections (active + hidden) with a member-dataset count for the admin table.
export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: collections, error } = await supabase
    .from('content_collections')
    .select('id, slug, name, description, audience, icon, is_active, sort_order, builtin_key, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/collections', error) }, { status: 500 })

  // Attach a member count per collection (one grouped read, mapped in code).
  const { data: members, error: memberErr } = await supabase.from('question_pack_collections').select('collection_id')
  if (memberErr)
    return NextResponse.json({ error: internalErrorMessage('admin/collections', memberErr) }, { status: 500 })
  const counts = new Map<string, number>()
  for (const m of members ?? []) counts.set(m.collection_id as string, (counts.get(m.collection_id as string) ?? 0) + 1)

  return NextResponse.json({
    collections: (collections ?? []).map((c) => ({ ...c, pack_count: counts.get(c.id as string) ?? 0 })),
  })
}

// Create a collection.
export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const fields = validateCollectionInput(body, { requireName: true })
  if ('error' in fields) return NextResponse.json({ error: fields.error }, { status: 400 })

  const slug = normalizeSlug((body as Record<string, unknown>).slug ?? fields.name)
  if (!slug) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('content_collections')
    .insert({
      slug,
      name: fields.name,
      description: fields.description,
      audience: fields.audience,
      icon: fields.icon,
      is_active: fields.is_active ?? true,
      sort_order: fields.sort_order ?? 0,
    })
    .select('id, slug, name, description, audience, icon, is_active, sort_order, builtin_key, created_at, updated_at')
    .single()

  if (error) {
    // 23505 = unique_violation on slug
    if ((error as { code?: string }).code === '23505')
      return NextResponse.json({ error: 'A collection with that slug already exists' }, { status: 409 })
    return NextResponse.json({ error: internalErrorMessage('admin/collections', error) }, { status: 500 })
  }
  return NextResponse.json({ collection: { ...data, pack_count: 0 } })
}
