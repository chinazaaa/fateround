import { getSupabaseAnon } from '@/lib/supabase-anon'

// Server-side reads for the public /collections pages. Anon RLS already limits these to active
// collections, active-collection membership, and approved packs — no service role needed.

export interface CollectionMeta {
  id: string
  slug: string
  name: string
  description: string | null
  audience: string | null
  icon: string | null
  sort_order: number
}

export interface CollectionDataset {
  id: string
  title: string
  game_type: string
  description: string | null
  question_count: number
}

export async function fetchActiveCollections(): Promise<CollectionMeta[]> {
  const supabase = getSupabaseAnon()
  const { data, error } = await supabase
    .from('content_collections')
    .select('id, slug, name, description, audience, icon, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as CollectionMeta[]
}

export async function fetchCollectionBySlug(slug: string): Promise<CollectionMeta | null> {
  const supabase = getSupabaseAnon()
  const { data, error } = await supabase
    .from('content_collections')
    .select('id, slug, name, description, audience, icon, sort_order')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return (data as CollectionMeta | null) ?? null
}

/** Approved datasets in a collection (metadata only — never the questions). */
export async function fetchCollectionDatasets(collectionId: string): Promise<CollectionDataset[]> {
  const supabase = getSupabaseAnon()
  const { data, error } = await supabase
    .from('question_pack_collections')
    .select('sort_order, question_packs(id, title, game_type, description, question_count, status)')
    .eq('collection_id', collectionId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? [])
    .map((row) => row.question_packs as unknown as (CollectionDataset & { status?: string }) | null)
    .filter((p): p is CollectionDataset & { status?: string } => !!p && p.status === 'approved')
    .map(({ status: _status, ...rest }) => rest)
}
