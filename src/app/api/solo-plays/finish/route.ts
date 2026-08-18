import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import { hasSoloPlay } from '@/lib/solo-play'
import { awardForSoloFinish } from '@/lib/trophies/award'
import type { GameType } from '@/types'

/**
 * Post a finished solo (vs bot) game so wins/games-played/streaks/trophies land on the
 * signed-in profile the same way multiplayer rooms do. Guests get 401 and their local
 * scoreboard stays authoritative.
 *
 * Idempotency: the client sends a session id it minted for the specific game; the award
 * pass keys the claim on `awarded_sessions(profile_id, solo:<sessionId>)` so a retried
 * finish (network blip → replay) collapses to one award.
 */
const finishSchema = z.object({
  gameType: z.string().min(1).max(40),
  outcome: z.enum(['human', 'bot', 'draw']),
  sessionId: z.string().min(4).max(80),
  difficulty: z.string().max(32).nullish(),
  durationMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000).nullish(),
})

export async function POST(req: NextRequest) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = finishSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { gameType, outcome, sessionId } = parsed.data
  if (!hasSoloPlay(gameType as GameType)) {
    return NextResponse.json({ error: 'Unsupported game type' }, { status: 400 })
  }

  const profileId = await getProfileFromRequest(req)
  if (!profileId) {
    // Not an error — guests just don't accumulate cross-device stats. The client already
    // updated the local scoreboard before calling this, so nothing needs to change UX-side.
    return NextResponse.json({ attributed: false, reason: 'no_identity' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const result = await awardForSoloFinish(supabase, profileId, {
    gameType: gameType as GameType,
    outcome,
    sessionId,
  })

  return NextResponse.json({ attributed: result.applied, earned: result.earned, reason: result.reason ?? null })
}
