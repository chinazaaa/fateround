import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  watToday,
  getDailyChallengeNumber,
  DAILY_GAME_PRIMARY_METRIC,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { computeDailyRank } from '@/lib/daily-rank'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const today = watToday()
  const admin = getSupabaseAdmin()
  const profileId = await getProfileFromRequest(req)

  // Load all today's challenges
  const { data: challenges } = await admin
    .from('daily_challenges')
    .select('id, game_type, challenge_date')
    .eq('challenge_date', today)
    .in('game_type', [...DAILY_CHALLENGE_GAME_TYPES])

  const challengeMap = new Map((challenges ?? []).map((c) => [c.game_type as DailyChallengeGameType, c]))

  // Load scores for this player if authenticated
  let scoreMap = new Map<
    string,
    {
      normalized_score: number
      raw_points: number
      items_solved: number
      time_seconds: number
      hints_used: number
      submitted_at: string
    }
  >()
  if (profileId && challenges?.length) {
    const challengeIds = challenges.map((c) => c.id)
    const { data: scores } = await admin
      .from('daily_scores')
      .select('challenge_id, normalized_score, raw_points, items_solved, time_seconds, hints_used, submitted_at')
      .eq('profile_id', profileId)
      .in('challenge_id', challengeIds)

    scoreMap = new Map((scores ?? []).map((s) => [s.challenge_id, s]))
  }

  // Compute ranks in parallel for every game the player has completed.
  const rankPromises = new Map<DailyChallengeGameType, Promise<number | null>>()
  for (const gameType of DAILY_CHALLENGE_GAME_TYPES) {
    const challenge = challengeMap.get(gameType)
    const entry = challenge ? scoreMap.get(challenge.id) : undefined
    if (!challenge || !entry) continue
    rankPromises.set(gameType, computeDailyRank(admin, gameType, challenge.id, entry).catch(() => null))
  }

  const rankResults = new Map<DailyChallengeGameType, number | null>()
  await Promise.all(
    [...rankPromises.entries()].map(async ([gt, p]) => {
      rankResults.set(gt, await p.catch(() => null))
    })
  )

  // Total players for today's first challenge (approximate; not cross-game distinct).
  const firstChallenge = challenges?.[0]
  let totalPlayers: number | null = null
  if (firstChallenge) {
    const { count } = await admin
      .from('daily_scores')
      .select('profile_id', { count: 'exact', head: true })
      .eq('challenge_id', firstChallenge.id)
      .gt('normalized_score', 0)
    totalPlayers = count
  }

  const games = DAILY_CHALLENGE_GAME_TYPES.map((gameType) => {
    const challenge = challengeMap.get(gameType)
    const score = challenge ? scoreMap.get(challenge.id) : undefined

    return {
      gameType,
      available: !!challenge,
      played: !!score,
      score: score
        ? DAILY_GAME_PRIMARY_METRIC[gameType] === 'score'
          ? score.raw_points
          : score.normalized_score
        : null,
      rank: rankResults.get(gameType) ?? null,
      challengeId: challenge?.id ?? null,
    }
  })

  return NextResponse.json({
    date: today,
    challengeNumber: getDailyChallengeNumber(today),
    games,
    totalPlayers,
  })
}
