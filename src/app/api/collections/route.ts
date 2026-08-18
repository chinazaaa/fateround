import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'

// Public list of active collections (metadata only — never pack questions). Backs the create-page
// collection filter and the /collections browse index. RLS already limits anon to is_active rows.
export async function GET(_req: NextRequest) {
  const supabase = getSupabaseAnon()
  const { data, error } = await supabase
    .from('content_collections')
    .select('id, slug, name, description, audience, icon, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: internalErrorMessage('collections', error) }, { status: 500 })
  return NextResponse.json({ collections: data ?? [] })
}
