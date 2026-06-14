import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Math.max(0, Number(searchParams.get('page') ?? 0))
  const limit = Math.min(Math.max(1, Number(searchParams.get('limit') ?? DEFAULT_LIMIT)), MAX_LIMIT)
  const offset = page * limit

  const supabase = getSupabaseAdmin()
  const { data, error, count } = await supabase
    .from('games')
    .select('id, title, game_type, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total = count ?? 0
  return NextResponse.json({
    games: data ?? [],
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  })
}
