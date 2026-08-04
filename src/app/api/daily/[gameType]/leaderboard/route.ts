import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import { isDailyChallengeGameType, watToday } from '@/lib/daily-challenge'
import { isValidDateStr } from '@/lib/community-dates'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ gameType: string }> }) {
  const { gameType } = await params
  if (!isDailyChallengeGameType(gameType)) {
    return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
  }

  const url = new URL(req.url)
  const dateParam = url.searchParams.get('date')
  const date = dateParam && isValidDateStr(dateParam) ? dateParam : watToday()
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
  const tab = url.searchParams.get('tab') === 'alltime' ? 'alltime' : 'today'

  const admin = getSupabaseAdmin()

  if (tab === 'today') {
    // Load challenge for the given date
    const { data: challenge } = await admin
      .from('daily_challenges')
      .select('id')
      .eq('game_type', gameType)
      .eq('challenge_date', date)
      .single()

    if (!challenge) {
      return NextResponse.json({ entries: [], total: 0, date })
    }

    // Leaderboard query
    const { data: entries, count: total } = await admin
      .from('daily_scores')
      .select('profile_id, normalized_score, items_solved, items_total, time_seconds, hints_used, submitted_at', {
        count: 'exact',
      })
      .eq('challenge_id', challenge.id)
      .order('normalized_score', { ascending: false })
      .order('items_solved', { ascending: false })
      .order('time_seconds', { ascending: true })
      .order('hints_used', { ascending: true })
      .order('submitted_at', { ascending: true })
      .range(offset, offset + limit - 1)

    // Fetch profile info for the entries
    const profileIds = (entries ?? []).map((e) => e.profile_id)
    const { data: profiles } = profileIds.length
      ? await admin.from('profiles').select('id, handle, avatar_url, username').in('id', profileIds)
      : { data: [] }

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

    const ranked = (entries ?? []).map((e, i) => ({
      rank: offset + i + 1,
      profileId: e.profile_id,
      handle: profileMap.get(e.profile_id)?.handle ?? 'Guest',
      username: profileMap.get(e.profile_id)?.username ?? null,
      avatarUrl: profileMap.get(e.profile_id)?.avatar_url ?? null,
      normalizedScore: e.normalized_score,
      itemsSolved: e.items_solved,
      timeSeconds: e.time_seconds,
    }))

    // Current user's rank
    let myRank: number | null = null
    let myScore: number | null = null
    const profileId = await getProfileFromRequest(req)
    if (profileId) {
      const { data: myEntry } = await admin
        .from('daily_scores')
        .select('normalized_score')
        .eq('challenge_id', challenge.id)
        .eq('profile_id', profileId)
        .single()

      if (myEntry) {
        myScore = myEntry.normalized_score
        const { count: betterCount } = await admin
          .from('daily_scores')
          .select('*', { count: 'exact', head: true })
          .eq('challenge_id', challenge.id)
          .gt('normalized_score', myEntry.normalized_score)
        myRank = (betterCount ?? 0) + 1
      }
    }

    return NextResponse.json({
      entries: ranked,
      total: total ?? 0,
      date,
      myRank,
      myScore,
    })
  }

  // All-time: best scores ever
  const { data: entries, count: total } = await admin
    .from('personal_bests')
    .select('profile_id, best_score, best_time, total_plays, best_date', { count: 'exact' })
    .eq('game_type', gameType)
    .order('best_score', { ascending: false })
    .order('best_time', { ascending: true })
    .range(offset, offset + limit - 1)

  const profileIds = (entries ?? []).map((e) => e.profile_id)
  const { data: profiles } = profileIds.length
    ? await admin.from('profiles').select('id, handle, avatar_url, username').in('id', profileIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  const ranked = (entries ?? []).map((e, i) => ({
    rank: offset + i + 1,
    profileId: e.profile_id,
    handle: profileMap.get(e.profile_id)?.handle ?? 'Guest',
    username: profileMap.get(e.profile_id)?.username ?? null,
    avatarUrl: profileMap.get(e.profile_id)?.avatar_url ?? null,
    bestScore: e.best_score,
    bestTime: e.best_time,
    totalPlays: e.total_plays,
  }))

  let myRank: number | null = null
  const profileId = await getProfileFromRequest(req)
  if (profileId) {
    const { data: myEntry } = await admin
      .from('personal_bests')
      .select('best_score')
      .eq('profile_id', profileId)
      .eq('game_type', gameType)
      .single()

    if (myEntry) {
      const { count: betterCount } = await admin
        .from('personal_bests')
        .select('*', { count: 'exact', head: true })
        .eq('game_type', gameType)
        .gt('best_score', myEntry.best_score)
      myRank = (betterCount ?? 0) + 1
    }
  }

  return NextResponse.json({
    entries: ranked,
    total: total ?? 0,
    tab: 'alltime',
    myRank,
  })
}
