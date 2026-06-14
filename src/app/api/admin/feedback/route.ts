import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      {
        error: 'SUPABASE_SERVICE_ROLE_KEY is required to read feedback. Add it to your server environment.',
      },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const gameType = searchParams.get('gameType')
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('app_feedback')
    .select('id, game_type, category, message, page_url, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (category) query = query.eq('category', category)
  if (gameType) query = query.eq('game_type', gameType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ feedback: data ?? [] })
}
