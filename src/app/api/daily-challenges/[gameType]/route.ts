import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import { internalErrorMessage } from '@/lib/api-errors'
import {
  isDailyChallengeGameType,
  getDailyChallengeSeed,
  stripSolution,
  watToday,
  getDailyChallengeNumber,
  isDailyChallengeLive,
  DAILY_CHALLENGE_LAUNCH,
  DAILY_GAME_TIMER,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import { generateDailyPuzzle, generateDailyPuzzleFromContent } from '@/lib/daily-challenge-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ gameType: string }> }) {
  const { gameType: rawGameType } = await params
  if (!isDailyChallengeGameType(rawGameType)) {
    return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
  }
  const gameType: DailyChallengeGameType = rawGameType

  const today = watToday()

  // Before launch: report dormant and do NOT create a challenge row (keeps pre-launch days off the
  // board). The client shows a "starts on <date>" screen.
  if (!isDailyChallengeLive(today)) {
    return NextResponse.json({ notLive: true, launchDate: DAILY_CHALLENGE_LAUNCH }, { status: 200 })
  }

  const admin = getSupabaseAdmin()

  // Try to load today's challenge (maybeSingle: a missing row is expected before lazy creation,
  // and avoids the noisy 406 that `.single()` returns on zero rows).
  let { data: challenge } = await admin
    .from('daily_challenges')
    .select('id, game_type, challenge_date, puzzle_data, config')
    .eq('game_type', gameType)
    .eq('challenge_date', today)
    .maybeSingle()

  // Lazy creation on first request of the day
  if (!challenge) {
    const seed = getDailyChallengeSeed(gameType, today)

    // Check for admin-curated content first; fall back to hardcoded banks.
    let generated: { puzzleData: Record<string, unknown>; config: Record<string, unknown> } | null = null
    const { data: adminRow } = await admin
      .from('daily_challenge_content')
      .select('content')
      .eq('game_type', gameType)
      .eq('challenge_date', today)
      .maybeSingle()
    if (adminRow?.content) {
      generated = await generateDailyPuzzleFromContent(gameType, seed, adminRow.content)
    }
    if (!generated) {
      if (gameType === 'trivia') {
        return NextResponse.json(
          { error: 'No trivia content for today — ask an admin to add questions' },
          { status: 404 }
        )
      }
      generated = await generateDailyPuzzle(gameType, seed)
    }
    const { puzzleData, config } = generated

    // Ignore a duplicate-key error (another request created it first — the re-read handles it),
    // but surface any other insert failure instead of silently returning a generic 500.
    const { error: insertError } = await admin.from('daily_challenges').insert({
      game_type: gameType,
      challenge_date: today,
      seed,
      puzzle_data: puzzleData,
      config,
    })
    if (insertError && insertError.code !== '23505') {
      return NextResponse.json({ error: internalErrorMessage('daily/[gameType]', insertError) }, { status: 500 })
    }
    // Re-read (handles race where another request created it first)
    const { data: created } = await admin
      .from('daily_challenges')
      .select('id, game_type, challenge_date, puzzle_data, config')
      .eq('game_type', gameType)
      .eq('challenge_date', today)
      .maybeSingle()

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
      .maybeSingle()

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
