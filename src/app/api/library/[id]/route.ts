import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = getSupabaseAnon()

  const { data, error } = await supabase
    .from('question_packs')
    .select('id, title, game_type, author_name, description, question_count, questions, approved_at')
    .eq('id', id)
    .eq('status', 'approved')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ pack: data })
}
