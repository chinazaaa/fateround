import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import {
  isDailyChallengeGameType,
  getDailyChallengeSeed,
  stripSolution,
  watToday,
  getDailyChallengeNumber,
  DAILY_GAME_TIMER,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { generateDailyPuzzle } from '@/lib/daily-challenge-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ gameType: string }> }) {
  const { gameType: rawGameType } = await params
  if (!isDailyChallengeGameType(rawGameType)) {
    return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
  }
  const gameType: DailyChallengeGameType = rawGameType

  const today = watToday()
  const admin = getSupabaseAdmin()

  // Try to load today's challenge
  let { data: challenge } = await admin
    .from('daily_challenges')
    .select('id, game_type, challenge_date, puzzle_data, config')
    .eq('game_type', gameType)
    .eq('challenge_date', today)
    .single()

  // Lazy creation on first request of the day
  if (!challenge) {
    const seed = getDailyChallengeSeed(gameType, today)
    const { puzzleData, config } = await generateDailyPuzzle(gameType, seed)

    await admin.from('daily_challenges').insert({
      game_type: gameType,
      challenge_date: today,
      seed,
      puzzle_data: puzzleData,
      config,
    })
    // Re-read (handles race where another request created it first)
    const { data: created } = await admin
      .from('daily_challenges')
      .select('id, game_type, challenge_date, puzzle_data, config')
      .eq('game_type', gameType)
      .eq('challenge_date', today)
      .single()

    if (!created) {
      return NextResponse.json({ error: 'Failed to create daily challenge' }, { status: 500 })
    }
    challenge = created
  }

  // Check if user already played
  let alreadyPlayed = false
  let previousScore: Record<string, unknown> | null = null
  const profileId = await getProfileFromRequest(req)
  if (profileId) {
    const { data: existing } = await admin
      .from('daily_scores')
      .select('normalized_score, raw_points, items_solved, items_total, time_seconds, hints_used, submitted_at')
      .eq('challenge_id', challenge.id)
      .eq('profile_id', profileId)
      .single()

    if (existing) {
      alreadyPlayed = true
      previousScore = existing
    }
  }

  const puzzleData = challenge.puzzle_data as Record<string, unknown>
  const safePuzzle = stripSolution(gameType, puzzleData)

  return NextResponse.json({
    challengeId: challenge.id,
    gameType: challenge.game_type,
    challengeDate: challenge.challenge_date,
    challengeNumber: getDailyChallengeNumber(challenge.challenge_date),
    puzzle: safePuzzle,
    config: challenge.config,
    timer: DAILY_GAME_TIMER[gameType],
    alreadyPlayed,
    previousScore,
  })
}
