import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, trophy_points, trophy_level, current_streak, longest_streak')
    .gt('trophy_points', 0)
    .order('trophy_points', { ascending: false })
    .order('trophy_level', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: 'Failed to load trophy leaderboard' }, { status: 500 })
  }

  const entries = (data ?? []).map((row, i) => ({
    rank: i + 1,
    handle: row.handle as string | null,
    trophyPoints: Number(row.trophy_points) || 0,
    trophyLevel: Number(row.trophy_level) || 1,
    currentStreak: Number(row.current_streak) || 0,
    longestStreak: Number(row.longest_streak) || 0,
  }))

  return NextResponse.json({ entries })
}
