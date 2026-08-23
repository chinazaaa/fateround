import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { watToday } from '@/lib/community-dates'
import { isDailyChallengeGameType } from '@/lib/daily-challenge'
import { buildDailyAnswerReveal } from '@/lib/daily-answer-reveal'

/**
 * Answers for a PAST daily challenge.
 *
 * The whole point of the daily is that you don't get to see the answers while the puzzle is
 * still scoreable. Revealing them right after you play would let someone fail on one device,
 * read the answers, and enter a perfect score on another — the failure mode this route exists
 * to make impossible rather than merely discouraged.
 *
 * So the gate is the DATE, not the player: a requested date must be strictly before today in
 * WAT — the same calendar the challenge itself is keyed on. There is no "but I already
 * submitted" bypass, no signed-in exception, and no way to name today. That makes the rule
 * checkable in one line and impossible to hold wrong.
 *
 * Deliberately public and unauthenticated: yesterday's answers are not a secret from anyone,
 * and adding auth would imply they were.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ gameType: string }> }) {
  const { gameType } = await params
  if (!isDailyChallengeGameType(gameType)) {
    return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
  }

  const today = watToday()
  // Default to yesterday, which is what the UI asks for and keeps the common case honest.
  const requested = req.nextUrl.searchParams.get('date') ?? previousDay(today)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  // The one rule. String comparison is safe and total on YYYY-MM-DD, and both sides are WAT.
  if (requested >= today) {
    return NextResponse.json({ error: 'Answers are published the next day' }, { status: 403 })
  }

  const { data: challenge } = await getSupabaseAdmin()
    .from('daily_challenges')
    .select('id, game_type, challenge_date, puzzle_data')
    .eq('game_type', gameType)
    .eq('challenge_date', requested)
    .maybeSingle()

  if (!challenge) return NextResponse.json({ error: 'No challenge for that date' }, { status: 404 })

  const reveal = buildDailyAnswerReveal(
    gameType,
    challenge.challenge_date as string,
    (challenge.puzzle_data ?? {}) as Record<string, unknown>
  )
  if (!reveal) return NextResponse.json({ error: 'No answers available' }, { status: 404 })

  return NextResponse.json(reveal)
}

/** Previous WAT calendar day for a YYYY-MM-DD string. */
function previousDay(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`) - 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}
