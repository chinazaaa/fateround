import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { closeStaleOpenGames, countStaleOpenGames } from '@/lib/admin-end-game'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const DEFAULT_OLDER_THAN_HOURS = 48
const MIN_OLDER_THAN_HOURS = 1
const MAX_OLDER_THAN_HOURS = 24 * 365

function parseOlderThanHours(req: NextRequest): number {
  const raw = Number(req.nextUrl.searchParams.get('hours') ?? DEFAULT_OLDER_THAN_HOURS)
  if (!Number.isFinite(raw)) return DEFAULT_OLDER_THAN_HOURS
  return Math.min(Math.max(Math.floor(raw), MIN_OLDER_THAN_HOURS), MAX_OLDER_THAN_HOURS)
}

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const olderThanHours = parseOlderThanHours(req)
  const supabase = getSupabaseAdmin()
  const { count, error } = await countStaleOpenGames(supabase, olderThanHours)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({
    count,
    olderThanHours,
  })
}

export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const olderThanHours = parseOlderThanHours(req)
  const supabase = getSupabaseAdmin()
  const result = await closeStaleOpenGames(supabase, olderThanHours)

  if (result.errors.length > 0 && result.closed === 0) {
    return NextResponse.json({ error: result.errors[0], ...result, olderThanHours }, { status: 500 })
  }

  return NextResponse.json({ ...result, olderThanHours })
}
