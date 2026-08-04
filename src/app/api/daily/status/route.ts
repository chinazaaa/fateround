import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import {
  DAILY_CHALLENGE_GAME_TYPES,
  watToday,
  getDailyChallengeNumber,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'

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
  let scoreMap = new Map<string, { normalized_score: number }>()
  if (profileId && challenges?.length) {
    const challengeIds = challenges.map((c) => c.id)
    const { data: scores } = await admin
      .from('daily_scores')
      .select('challenge_id, normalized_score')
      .eq('profile_id', profileId)
      .in('challenge_id', challengeIds)

    scoreMap = new Map((scores ?? []).map((s) => [s.challenge_id, s]))
  }

  const games = DAILY_CHALLENGE_GAME_TYPES.map((gameType) => {
    const challenge = challengeMap.get(gameType)
    const score = challenge ? scoreMap.get(challenge.id) : undefined

    return {
      gameType,
      available: !!challenge,
      played: !!score,
      score: score?.normalized_score ?? null,
      // Lets the client show "Continue" when there's saved local progress for this challenge.
      challengeId: challenge?.id ?? null,
    }
  })

  return NextResponse.json({
    date: today,
    challengeNumber: getDailyChallengeNumber(today),
    games,
  })
}
