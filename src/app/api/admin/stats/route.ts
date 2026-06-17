import { NextRequest, NextResponse } from 'next/server'
import { computeAveragePlayTime } from '@/lib/admin-play-time'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import type { GameType } from '@/types'

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const [gamesRes, playersRes, votesRes, finishedGamesRes, activeGamesRes, gamesLast7DaysRes, playSessionsRes] =
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
      supabase
        .from('games')
        .select('id, session_started_at, finished_at')
        .eq('status', 'finished')
        .not('session_started_at', 'is', null),
    ])

  let feedbackCount = 0
  const feedbackByCategory: Record<string, number> = {}
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

  const playSessions = playSessionsRes.data ?? []
  const sessionsMissingFinishedAt = playSessions.filter((session) => !session.finished_at).map((session) => session.id)
  const latestRoundEndedAtByGame = new Map<string, string>()

  if (sessionsMissingFinishedAt.length > 0) {
    const { data: roundEnds } = await supabase
      .from('rounds')
      .select('game_id, ended_at')
      .in('game_id', sessionsMissingFinishedAt)
      .not('ended_at', 'is', null)

    for (const round of roundEnds ?? []) {
      const current = latestRoundEndedAtByGame.get(round.game_id)
      if (!current || new Date(round.ended_at).getTime() > new Date(current).getTime()) {
        latestRoundEndedAtByGame.set(round.game_id, round.ended_at)
      }
    }
  }

  const averagePlayTime = computeAveragePlayTime(playSessions, latestRoundEndedAtByGame)

  return NextResponse.json({
    totals: {
      games: gamesRes.count ?? games.length,
      players: playersRes.count ?? 0,
      votes: votesRes.count ?? 0,
      feedback: feedbackCount,
      finishedGames: finishedGamesRes.count ?? 0,
      activeGames: activeGamesRes.count ?? 0,
      gamesLast7Days: gamesLast7DaysRes.count ?? 0,
      averagePlayTimeSeconds: averagePlayTime.averageSeconds,
      averagePlayTimeSampleCount: averagePlayTime.sampleCount,
    },
    gamesByStatus,
    gamesByType: gamesByType as Partial<Record<GameType | string, number>>,
    feedbackByCategory,
  })
}
