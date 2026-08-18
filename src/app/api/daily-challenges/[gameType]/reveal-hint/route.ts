import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import { isDailyChallengeGameType, watToday } from '@/lib/daily-challenge'
import { parseJsonBody } from '@/lib/parse-body'

export const dynamic = 'force-dynamic'

const revealSchema = z.object({
  challengeId: z.string().uuid(),
})

/**
 * Persist a hint reveal for a daily challenge. The submit route reads this row as the
 * authority on whether the player paid for a hint — the client-side field is only an
 * inline signal, so a modified client can't submit `hintUsed: false` to dodge the penalty
 * after seeing the hint.
 *
 * Idempotent: repeat calls with the same (challenge_id, profile_id) are no-ops. Called
 * from the daily-Wordle "Reveal hint" button before the hint text is shown.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ gameType: string }> }) {
  const { gameType } = await params
  if (!isDailyChallengeGameType(gameType)) {
    return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
  }
  const profileId = await getProfileFromRequest(req)
  if (!profileId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: body, error: bodyError } = await parseJsonBody(req, revealSchema)
  if (bodyError) return bodyError

  const admin = getSupabaseAdmin()
  // Guard: only accept a reveal for the CURRENT day's challenge on this game type — a stale
  // challengeId from a previous day can't buy hints against today's puzzle.
  const { data: challenge } = await admin
    .from('daily_challenges')
    .select('id')
    .eq('id', body.challengeId)
    .eq('game_type', gameType)
    .eq('challenge_date', watToday())
    .maybeSingle()
  if (!challenge) return NextResponse.json({ error: 'Challenge not found or expired' }, { status: 404 })

  const { error } = await admin
    .from('daily_hint_reveals')
    .insert({ challenge_id: body.challengeId, profile_id: profileId })
  // Duplicate reveal is fine — the flag stays true.
  if (error && error.code !== '23505') {
    return NextResponse.json({ error: 'Failed to record hint' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
