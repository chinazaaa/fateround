import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  formatDayLabel,
  formatMonthLabel,
  formatRangeLabel,
  isValidDateStr,
  monthBounds,
  watRangeToUtc,
  watToday,
  weekBounds,
} from '@/lib/community-dates'

// Count games created within an inclusive WAT date range (matches the basis of
// the "Games (last 7 days)" card, which counts by created_at).
async function countGames(supabase: SupabaseClient, startDate: string, endDate: string): Promise<number> {
  const { gte, lt } = watRangeToUtc(startDate, endDate)
  const { count, error } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', gte)
    .lt('created_at', lt)
  // Don't mask a failed query as a real "0" — let the handler surface the error.
  if (error) throw error
  return count ?? 0
}

// GET ?date=YYYY-MM-DD — games played for that date's day, week, and month
// windows (WAT), so the admin page can toggle period without re-fetching.
export async function GET(req: NextRequest) {
  if (!(await assertAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required.' }, { status: 503 })
  }

  const dateParam = req.nextUrl.searchParams.get('date')
  const date = isValidDateStr(dateParam) ? dateParam : watToday()
  const week = weekBounds(date)
  const month = monthBounds(date)

  const supabase = getSupabaseAdmin()
  try {
    const [day, wk, mo] = await Promise.all([
      countGames(supabase, date, date),
      countGames(supabase, week.start, week.end),
      countGames(supabase, month.start, month.end),
    ])

    return NextResponse.json({
      date,
      day: { count: day, label: formatDayLabel(date) },
      week: { count: wk, label: formatRangeLabel(week.start, week.end) },
      month: { count: mo, label: formatMonthLabel(date) },
    })
  } catch (err) {
    console.error('[admin/stats/games] failed', err)
    return NextResponse.json({ error: 'Failed to load game counts' }, { status: 500 })
  }
}
