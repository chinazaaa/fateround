import { NextRequest, NextResponse } from 'next/server'
import { computeTypicalPlayTime } from '@/lib/admin-play-time'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import { addDays, monthBounds, watRangeToUtc, watToday } from '@/lib/community-dates'
import type { GameType } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'

async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  pageSize = 1000
): Promise<{ data: T[]; count: number }> {
  const rows: T[] = []
  let from = 0
  let totalCount = 0
  while (true) {
    const { data, count, error } = await supabase
      .from(table)
      .select(select, { count: 'exact', head: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (count !== null) totalCount = count
    if (!data || data.length === 0) break
    rows.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return { data: rows, count: totalCount }
}

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const today = watToday()
  const todayRange = watRangeToUtc(today, today)
  const month = monthBounds(today)
  const monthRange = watRangeToUtc(month.start, month.end)

  // Previous month for MoM growth — compare equivalent period (first N days)
  const dayOfMonth = Number(today.slice(8, 10))
  const prevMonthEnd = addDays(month.start, -1)
  const prevMonth = monthBounds(prevMonthEnd)
  const prevMonthSamePeriodEnd = addDays(prevMonth.start, dayOfMonth - 1)
  const prevMonthRange = watRangeToUtc(prevMonth.start, prevMonthSamePeriodEnd)

  // Previous 7 days (8-14 days ago) for WoW growth
  const prev7DaysStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const prev7DaysEnd = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Paginated fetches — bypass Supabase's max_rows cap (default 1000)
  type GameRow = { id: string; game_type: string; status: string; created_at: string; sessions_played: number }
  type PlayerGameRow = { game_id: string; country: string | null; is_bot?: boolean | null }
  type ProfileRow = {
    id: string
    created_at: string
    current_streak: number
    trophy_points: number
    last_active_date: string | null
    country: string | null
  }

  async function fetchAllSafe<T>(
    table: string,
    selectWithCountry: string,
    selectWithout: string
  ): Promise<{ data: T[]; count: number }> {
    try {
      return await fetchAll<T>(supabase, table, selectWithCountry)
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && 'message' in e
            ? String((e as { message: unknown }).message)
            : ''
      if (msg.includes('country')) {
        return fetchAll<T>(supabase, table, selectWithout)
      }
      throw e
    }
  }

  // players: try the full select (country + is_bot), then peel off is_bot on
  // older schemas that predate 20260925120000_players_is_bot, then peel off
  // country on the even older schemas fetchAllSafe already handled. Also
  // reports which columns actually made it into the select so bot stats can
  // distinguish "no bot rooms" (supported, count 0) from "not tracked yet"
  // (column missing, hint the admin to run the migration).
  async function fetchPlayers(): Promise<{
    data: PlayerGameRow[]
    count: number
    hasBotColumn: boolean
  }> {
    const attempts: { select: string; hasBotColumn: boolean }[] = [
      { select: 'game_id, country, is_bot', hasBotColumn: true },
      { select: 'game_id, country', hasBotColumn: false },
      { select: 'game_id', hasBotColumn: false },
    ]
    let lastErr: unknown = null
    for (const { select, hasBotColumn } of attempts) {
      try {
        const res = await fetchAll<PlayerGameRow>(supabase, 'players', select)
        return { ...res, hasBotColumn }
      } catch (e: unknown) {
        lastErr = e
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === 'object' && e !== null && 'message' in e
              ? String((e as { message: unknown }).message)
              : ''
        if (!msg.includes('is_bot') && !msg.includes('country')) throw e
      }
    }
    throw lastErr
  }

  const [gamesAll, playersAll, profilesAll] = await Promise.all([
    fetchAll<GameRow>(supabase, 'games', 'id, game_type, status, created_at, sessions_played'),
    fetchPlayers(),
    fetchAllSafe<ProfileRow>(
      'profiles',
      'id, created_at, current_streak, trophy_points, last_active_date, country',
      'id, created_at, current_streak, trophy_points, last_active_date'
    ),
  ])

  const [
    playersRes,
    votesRes,
    finishedGamesRes,
    activeGamesRes,
    gamesLast7DaysRes,
    gamesPrev7DaysRes,
    playSessionsRes,
    roomsRes,
    gamesTodayRes,
    gamesThisMonthRes,
    gamesLastMonthRes,
    tournamentsRes,
    uniqueProfilesRes,
  ] = await Promise.all([
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
      .select('id', { count: 'exact', head: true })
      .gte('created_at', prev7DaysStart)
      .lt('created_at', prev7DaysEnd),
    supabase
      .from('games')
      .select('id, session_started_at, finished_at')
      .eq('status', 'finished')
      .not('session_started_at', 'is', null)
      .limit(5000),
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
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', prevMonthRange.gte)
      .lt('created_at', prevMonthRange.lt),
    supabase.from('tournaments').select('id, status', { count: 'exact', head: false }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
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

  const queryError =
    playersRes.error ??
    votesRes.error ??
    finishedGamesRes.error ??
    activeGamesRes.error ??
    gamesLast7DaysRes.error ??
    gamesPrev7DaysRes.error ??
    playSessionsRes.error ??
    roomsRes.error ??
    gamesTodayRes.error ??
    gamesThisMonthRes.error ??
    gamesLastMonthRes.error ??
    tournamentsRes.error ??
    uniqueProfilesRes.error
  if (queryError) {
    console.error('[admin/stats] query failed', queryError)
    return NextResponse.json({ error: 'Failed to load statistics' }, { status: 500 })
  }

  const games = gamesAll.data
  const gamesByStatus: Record<string, number> = {}
  const gamesByType: Record<string, number> = {}
  const gamesByType7d: Record<string, number> = {}
  const gamesByType30d: Record<string, number> = {}
  const sessionsByType: Record<string, number> = {}

  // Poll/vote games inflate player counts — every viewer becomes a "player" row.
  // Exclude them from avg-players and total-player-joins stats.
  const POLL_GAME_TYPES = new Set([
    'smash_marry_kill',
    'red_flag_green_flag',
    'smash_or_pass',
    'parent_approval',
    'custom',
    'most_likely_to',
    'would_you_rather',
    'never_have_i_ever',
    'who_said_this',
    'hot_seat',
    'anonymous_messages',
    'secret_message',
    'pick_a_number',
    'this_or_that',
  ])
  const gameTypeById = new Map<string, string>()
  const pollGameIds = new Set<string>()

  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  let totalSessions = 0
  let totalReplays = 0
  const mostReplayedGames: { id: string; type: string; sessions: number }[] = []

  for (const game of games) {
    gameTypeById.set(game.id, game.game_type)
    if (POLL_GAME_TYPES.has(game.game_type)) pollGameIds.add(game.id)

    gamesByStatus[game.status] = (gamesByStatus[game.status] ?? 0) + 1
    gamesByType[game.game_type] = (gamesByType[game.game_type] ?? 0) + 1

    if (game.created_at >= cutoff7d) {
      gamesByType7d[game.game_type] = (gamesByType7d[game.game_type] ?? 0) + 1
    }
    if (game.created_at >= cutoff30d) {
      gamesByType30d[game.game_type] = (gamesByType30d[game.game_type] ?? 0) + 1
    }

    const sp = game.sessions_played ?? 1
    totalSessions += sp
    sessionsByType[game.game_type] = (sessionsByType[game.game_type] ?? 0) + sp

    if (sp > 1) {
      totalReplays += sp - 1
      mostReplayedGames.push({ id: game.id, type: game.game_type, sessions: sp })
    }
  }

  mostReplayedGames.sort((a, b) => b.sessions - a.sessions)
  const topReplayed = mostReplayedGames.slice(0, 10)

  const tournaments = tournamentsRes.data ?? []
  const tournamentsByStatus: Record<string, number> = {}
  for (const tournament of tournaments) {
    tournamentsByStatus[tournament.status] = (tournamentsByStatus[tournament.status] ?? 0) + 1
  }

  // Average players per game (excluding poll/vote games which inflate counts)
  const playerRows = playersAll.data
  let totalPlayerJoins = 0
  const playersPerGame = new Map<string, number>()
  for (const row of playerRows) {
    if (pollGameIds.has(row.game_id)) continue
    totalPlayerJoins++
    playersPerGame.set(row.game_id, (playersPerGame.get(row.game_id) ?? 0) + 1)
  }
  const gamePlayerCounts = Array.from(playersPerGame.values())
  const avgPlayersPerGame =
    gamePlayerCounts.length > 0
      ? Math.round((gamePlayerCounts.reduce((s, n) => s + n, 0) / gamePlayerCounts.length) * 10) / 10
      : 0

  // Country breakdown from player joins
  const playersByCountry: Record<string, number> = {}
  for (const row of playerRows) {
    if (row.country) {
      playersByCountry[row.country] = (playersByCountry[row.country] ?? 0) + 1
    }
  }

  // Rooms-with-bots stats — a real game room that had at least one bot seat.
  // `is_bot` was added in 20260925120000_players_is_bot; if the field isn't
  // present on the fetched rows (older schema), hasBotColumn stays false and
  // we surface null so the admin card renders a "not tracked yet" hint rather
  // than a misleading zero.
  const hasBotColumn = playersAll.hasBotColumn
  const gamesWithBots = new Set<string>()
  let totalBotSeats = 0
  if (hasBotColumn) {
    for (const row of playerRows) {
      if (row.is_bot) {
        gamesWithBots.add(row.game_id)
        totalBotSeats++
      }
    }
  }
  const roomsWithBotsByType: Record<string, number> = {}
  const roomsWithBotsByType7d: Record<string, number> = {}
  let roomsWithBotsLast7d = 0
  let roomsWithBotsLast30d = 0
  for (const game of games) {
    if (!gamesWithBots.has(game.id)) continue
    roomsWithBotsByType[game.game_type] = (roomsWithBotsByType[game.game_type] ?? 0) + 1
    if (game.created_at >= cutoff7d) {
      roomsWithBotsLast7d++
      roomsWithBotsByType7d[game.game_type] = (roomsWithBotsByType7d[game.game_type] ?? 0) + 1
    }
    if (game.created_at >= cutoff30d) roomsWithBotsLast30d++
  }
  const roomsWithBotsStats = hasBotColumn
    ? {
        supported: true as const,
        total: gamesWithBots.size,
        last7Days: roomsWithBotsLast7d,
        last30Days: roomsWithBotsLast30d,
        totalBotSeats,
        byGameType: roomsWithBotsByType,
        byGameType7d: roomsWithBotsByType7d,
      }
    : { supported: false as const }

  // Growth rates
  const gamesLast7 = gamesLast7DaysRes.count ?? 0
  const gamesPrev7 = gamesPrev7DaysRes.count ?? 0
  const weekOverWeekGrowth = gamesPrev7 > 0 ? Math.round(((gamesLast7 - gamesPrev7) / gamesPrev7) * 100) : null

  const gamesThisMonth = gamesThisMonthRes.count ?? 0
  const gamesLastMonth = gamesLastMonthRes.count ?? 0
  const monthOverMonthGrowth =
    gamesLastMonth > 0 ? Math.round(((gamesThisMonth - gamesLastMonth) / gamesLastMonth) * 100) : null

  // Active profiles and engagement
  const profiles = profilesAll.data
  const sevenDaysAgo = addDays(today, -7)
  const thirtyDaysAgo = addDays(today, -30)
  const activeProfiles = profiles.filter((p) => p.last_active_date && p.last_active_date >= sevenDaysAgo).length
  const profilesWithTrophies = profiles.filter((p) => p.trophy_points > 0).length

  // Country breakdown from registered users (profiles)
  const usersByCountry: Record<string, number> = {}
  for (const p of profiles) {
    if (p.country) {
      usersByCountry[p.country] = (usersByCountry[p.country] ?? 0) + 1
    }
  }
  const uniqueCountries = Object.keys(usersByCountry).length

  // DAU / WAU / MAU from last_active_date
  const dau = profiles.filter((p) => p.last_active_date === today).length
  const wau = activeProfiles
  const mau = profiles.filter((p) => p.last_active_date && p.last_active_date >= thirtyDaysAgo).length

  // User growth: cumulative signups over the last 12 weeks (weekly buckets)
  const userGrowth: { week: string; cumulative: number; newUsers: number }[] = []
  const toWatDate = (ts: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ts))

  const profilesByDate = new Map<string, number>()
  for (const p of profiles) {
    if (!p.created_at) continue
    const d = toWatDate(p.created_at)
    profilesByDate.set(d, (profilesByDate.get(d) ?? 0) + 1)
  }

  // Build 4 weekly buckets ending on today's week
  const weekCount = 4
  for (let w = weekCount - 1; w >= 0; w--) {
    const weekEnd = addDays(today, -w * 7)
    const weekStart = addDays(weekEnd, -6)
    let newInWeek = 0
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d)
      newInWeek += profilesByDate.get(date) ?? 0
    }
    // Cumulative = all profiles created on or before weekEnd
    const cumulative = profiles.filter((p) => p.created_at && toWatDate(p.created_at) <= weekEnd).length
    const label = `${weekStart.slice(5)} – ${weekEnd.slice(5)}`
    userGrowth.push({ week: label, cumulative, newUsers: newInWeek })
  }

  // DAU trend (last 30 days) from last_active_date
  const dauTrend: { date: string; dau: number }[] = []
  const activeByDate = new Map<string, number>()
  for (const p of profiles) {
    if (p.last_active_date) {
      activeByDate.set(p.last_active_date, (activeByDate.get(p.last_active_date) ?? 0) + 1)
    }
  }
  for (let i = 29; i >= 0; i--) {
    const date = addDays(today, -i)
    dauTrend.push({ date, dau: activeByDate.get(date) ?? 0 })
  }

  // Daily activity trend (last 30 days)
  const dailyActivity: { date: string; games: number }[] = []
  const gameDateCounts = new Map<string, number>()
  for (const game of games) {
    if (!game.created_at) continue
    const d = new Date(game.created_at)
    const watDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
    gameDateCounts.set(watDate, (gameDateCounts.get(watDate) ?? 0) + 1)
  }

  for (let i = 29; i >= 0; i--) {
    const date = addDays(today, -i)
    dailyActivity.push({ date, games: gameDateCounts.get(date) ?? 0 })
  }

  // Typical play time
  const playSessions = playSessionsRes.data ?? []
  const sessionsMissingFinishedAt = playSessions.filter((s) => !s.finished_at).map((s) => s.id)
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

  // Solo (vs bot) practice stats — one row per game STARTED in solo_plays.
  // Client-side games have no games/players row, so this is the only signal
  // of solo adoption. See migration 20260927120000_solo_plays.sql.
  const soloPlayStats = {
    total: 0,
    last7Days: 0,
    last30Days: 0,
    byGameType: {} as Record<string, number>,
    byGameType7d: {} as Record<string, number>,
  }
  try {
    type SoloPlayRow = { game_type: string; created_at: string }
    const soloAll = await fetchAll<SoloPlayRow>(supabase, 'solo_plays', 'game_type, created_at')
    soloPlayStats.total = soloAll.count
    for (const row of soloAll.data) {
      soloPlayStats.byGameType[row.game_type] = (soloPlayStats.byGameType[row.game_type] ?? 0) + 1
      if (row.created_at >= cutoff7d) {
        soloPlayStats.last7Days++
        soloPlayStats.byGameType7d[row.game_type] = (soloPlayStats.byGameType7d[row.game_type] ?? 0) + 1
      }
      if (row.created_at >= cutoff30d) soloPlayStats.last30Days++
    }
  } catch {
    // solo_plays table might not exist yet (pre-migration) — silently skip
  }

  // Daily challenge stats (service-role tables — safe here)
  const dailyChallengeStats = {
    challenges: 0,
    submissions: 0,
    uniquePlayers: 0,
    submissionsToday: 0,
    avgScore: 0,
    byGameType: {} as Record<string, { challenges: number; submissions: number }>,
  }
  try {
    const [challengesRes, scoresRes, scoresTodayRes, uniquePlayersRes] = await Promise.all([
      supabase.from('daily_challenges').select('game_type', { count: 'exact' }),
      supabase.from('daily_scores').select('normalized_score', { count: 'exact' }),
      supabase
        .from('daily_scores')
        .select('challenge_id', { count: 'exact', head: true })
        .gte('submitted_at', todayRange.gte)
        .lt('submitted_at', todayRange.lt),
      supabase.from('daily_scores').select('profile_id', { count: 'exact', head: true }),
    ])

    dailyChallengeStats.challenges = challengesRes.count ?? 0
    dailyChallengeStats.submissions = scoresRes.count ?? 0
    dailyChallengeStats.submissionsToday = scoresTodayRes.count ?? 0

    if (scoresRes.data && scoresRes.data.length > 0) {
      const totalScore = scoresRes.data.reduce((s, r) => s + (Number(r.normalized_score) || 0), 0)
      dailyChallengeStats.avgScore = Math.round(totalScore / scoresRes.data.length)
    }

    // Unique players — distinct profile_ids from daily_scores
    // head:true count gives total rows, not distinct. Fetch profile_ids and dedupe.
    const { data: playerIds } = await supabase.from('daily_scores').select('profile_id')
    if (playerIds) {
      dailyChallengeStats.uniquePlayers = new Set(playerIds.map((r) => r.profile_id)).size
    }

    // Breakdown by game type
    const challengesByType: Record<string, number> = {}
    for (const row of challengesRes.data ?? []) {
      challengesByType[row.game_type as string] = (challengesByType[row.game_type as string] ?? 0) + 1
    }

    // Get submissions per game type via challenge join
    const { data: scoresByChallenge } = await supabase.from('daily_scores').select('challenge_id')
    const challengeIdToType = new Map<string, string>()
    const { data: challengeRows } = await supabase.from('daily_challenges').select('id, game_type')
    for (const c of challengeRows ?? []) {
      challengeIdToType.set(c.id, c.game_type as string)
    }
    const submissionsByType: Record<string, number> = {}
    for (const s of scoresByChallenge ?? []) {
      const gt = challengeIdToType.get(s.challenge_id as string)
      if (gt) submissionsByType[gt] = (submissionsByType[gt] ?? 0) + 1
    }

    for (const gt of new Set([...Object.keys(challengesByType), ...Object.keys(submissionsByType)])) {
      dailyChallengeStats.byGameType[gt] = {
        challenges: challengesByType[gt] ?? 0,
        submissions: submissionsByType[gt] ?? 0,
      }
    }
  } catch {
    // daily_challenges tables might not exist yet — silently skip
  }

  return NextResponse.json({
    totals: {
      games: gamesAll.count,
      sessions: totalSessions,
      replays: totalReplays,
      gamesToday: gamesTodayRes.count ?? 0,
      gamesThisMonth,
      gamesLastMonth,
      tournaments: tournamentsRes.count ?? tournaments.length,
      activeTournaments: tournamentsByStatus['active'] ?? 0,
      finishedTournaments: tournamentsByStatus['finished'] ?? 0,
      rooms: roomsRes.count ?? 0,
      players: totalPlayerJoins,
      uniqueProfiles: uniqueProfilesRes.count ?? 0,
      activeProfiles,
      profilesWithTrophies,
      dau,
      wau,
      mau,
      avgPlayersPerGame,
      votes: votesRes.count ?? 0,
      feedback: feedbackCount,
      finishedGames: finishedGamesRes.count ?? 0,
      activeGames: activeGamesRes.count ?? 0,
      gamesLast7Days: gamesLast7,
      gamesPrev7Days: gamesPrev7,
      weekOverWeekGrowth,
      monthOverMonthGrowth,
      typicalPlayTimeSeconds: typicalPlayTime.typicalSeconds,
      typicalPlayTimeSampleCount: typicalPlayTime.sampleCount,
    },
    gamesByStatus,
    gamesByType: gamesByType as Partial<Record<GameType | string, number>>,
    gamesByType7d: gamesByType7d as Partial<Record<GameType | string, number>>,
    gamesByType30d: gamesByType30d as Partial<Record<GameType | string, number>>,
    sessionsByType: sessionsByType as Partial<Record<GameType | string, number>>,
    tournamentsByStatus,
    feedbackByCategory,
    topReplayed,
    dailyActivity,
    userGrowth,
    dauTrend,
    playersByCountry,
    usersByCountry,
    uniqueCountries,
    dailyChallengeStats,
    soloPlayStats,
    roomsWithBotsStats,
  })
}
