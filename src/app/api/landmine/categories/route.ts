import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Public list for the caller's category picker. Returns metadata ONLY (id, name, count) —
// never the answer entries, so the mine pool stays secret. Reads via the service role
// because landmine_categories has RLS on with no client policy.
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('landmine_categories')
    .select('id, name, entry_count')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  const categories = (data ?? []).map((c) => ({ id: c.id, name: c.name, entryCount: c.entry_count }))
  return NextResponse.json({ categories })
}
