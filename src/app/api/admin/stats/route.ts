import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import type { GameType } from '@/types'

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const [gamesRes, playersRes, votesRes, finishedGamesRes, activeGamesRes, gamesLast7DaysRes] =
    await Promise.all([
      supabase.from('games').select('id, game_type, status, created_at', { count: 'exact', head: false }),
      supabase.from('players').select('id', { count: 'exact', head: true }),
      supabase.from('votes').select('id', { count: 'exact', head: true }),
      supabase.from('games').select('id', { count: 'exact', head: true }).eq('status', 'finished'),
      supabase.from('games').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase
        .from('games')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ])

  let feedbackCount = 0
  let feedbackByCategory: Record<string, number> = {}
  if (hasServiceRoleKey()) {
    const [feedbackRes, feedbackByCategoryRes] = await Promise.all([
      supabase.from('app_feedback').select('id', { count: 'exact', head: true }),
      supabase.from('app_feedback').select('category'),
    ])
    feedbackCount = feedbackRes.count ?? 0
    if (!feedbackByCategoryRes.error) {
      for (const row of feedbackByCategoryRes.data ?? []) {
        feedbackByCategory[row.category] = (feedbackByCategory[row.category] ?? 0) + 1
      }
    }
  }

  if (gamesRes.error) return NextResponse.json({ error: gamesRes.error.message }, { status: 500 })

  const games = gamesRes.data ?? []
  const gamesByStatus: Record<string, number> = {}
  const gamesByType: Record<string, number> = {}

  for (const game of games) {
    gamesByStatus[game.status] = (gamesByStatus[game.status] ?? 0) + 1
    gamesByType[game.game_type] = (gamesByType[game.game_type] ?? 0) + 1
  }

  return NextResponse.json({
    totals: {
      games: gamesRes.count ?? games.length,
      players: playersRes.count ?? 0,
      votes: votesRes.count ?? 0,
      feedback: feedbackCount,
      finishedGames: finishedGamesRes.count ?? 0,
      activeGames: activeGamesRes.count ?? 0,
      gamesLast7Days: gamesLast7DaysRes.count ?? 0,
    },
    gamesByStatus,
    gamesByType: gamesByType as Partial<Record<GameType | string, number>>,
    feedbackByCategory,
  })
}
