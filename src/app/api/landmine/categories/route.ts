import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Public list for the caller's category picker. Returns metadata ONLY (id, name, count) —
// never the answer entries, so the mine pool stays secret. Reads via the service role
// because landmine_categories has RLS on with no client policy.
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('landmine_categories')
    .select('id, name, entry_count')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  // Surface read failures as a 500 so the caller's client shows Retry instead of an
  // empty "no categories" list that silently strands the round.
  if (error) return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })

  const categories = (data ?? []).map((c) => ({ id: c.id, name: c.name, entryCount: c.entry_count }))
  return NextResponse.json({ categories })
}
