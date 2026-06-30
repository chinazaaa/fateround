import { NextRequest, NextResponse } from 'next/server'
import { computeTypicalPlayTime } from '@/lib/admin-play-time'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import { monthBounds, watRangeToUtc, watToday } from '@/lib/community-dates'
import type { GameType } from '@/types'

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  // WAT day/month ranges for the "today" and "this month" game-count cards.
  const today = watToday()
  const todayRange = watRangeToUtc(today, today)
  const month = monthBounds(today)
  const monthRange = watRangeToUtc(month.start, month.end)

  const [
    gamesRes,
    playersRes,
    votesRes,
    finishedGamesRes,
    activeGamesRes,
    gamesLast7DaysRes,
    playSessionsRes,
    roomsRes,
    gamesTodayRes,
    gamesThisMonthRes,
  ] = await Promise.all([
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
    supabase.from('rooms').select('id', { count: 'exact', head: true }),
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayRange.gte)
      .lt('created_at', todayRange.lt),
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthRange.gte)
      .lt('created_at', monthRange.lt),
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

  // Surface a backend failure instead of silently rendering 0/null stats when any
  // of the count queries error out.
  const queryError =
    gamesRes.error ??
    playersRes.error ??
    votesRes.error ??
    finishedGamesRes.error ??
    activeGamesRes.error ??
    gamesLast7DaysRes.error ??
    playSessionsRes.error ??
    roomsRes.error ??
    gamesTodayRes.error ??
    gamesThisMonthRes.error
  if (queryError) {
    console.error('[admin/stats] query failed', queryError)
    return NextResponse.json({ error: 'Failed to load statistics' }, { status: 500 })
  }

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

  const typicalPlayTime = computeTypicalPlayTime(playSessions, latestRoundEndedAtByGame)

  return NextResponse.json({
    totals: {
      games: gamesRes.count ?? games.length,
      gamesToday: gamesTodayRes.count ?? 0,
      gamesThisMonth: gamesThisMonthRes.count ?? 0,
      rooms: roomsRes.count ?? 0,
      players: playersRes.count ?? 0,
      votes: votesRes.count ?? 0,
      feedback: feedbackCount,
      finishedGames: finishedGamesRes.count ?? 0,
      activeGames: activeGamesRes.count ?? 0,
      gamesLast7Days: gamesLast7DaysRes.count ?? 0,
      typicalPlayTimeSeconds: typicalPlayTime.typicalSeconds,
      typicalPlayTimeSampleCount: typicalPlayTime.sampleCount,
    },
    gamesByStatus,
    gamesByType: gamesByType as Partial<Record<GameType | string, number>>,
    feedbackByCategory,
  })
}
