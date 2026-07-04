import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { normalizeResumeToken } from '@/lib/utils'
import { internalErrorMessage } from '@/lib/api-errors'

const subscribeSchema = z.object({
  resumeToken: z.string().min(4),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data, error: bodyError } = await parseJsonBody(req, subscribeSchema)
  if (bodyError) return bodyError

  const gameId = code.toUpperCase()
  const resumeToken = normalizeResumeToken(data.resumeToken)
  if (resumeToken.length < 4) {
    return NextResponse.json({ error: 'Enter a valid player code' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // Authorize with the player's secret resume_token — same boundary as /api/players/resume.
  const { data: player } = await admin
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .eq('resume_token', resumeToken)
    .maybeSingle()

  if (!player) {
    return NextResponse.json({ error: 'Player not found for this game' }, { status: 404 })
  }

  // Endpoint is unique: upsert so re-subscribing (or moving to a new game) refreshes the
  // keys and re-points the row at this player rather than erroring on the conflict.
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      game_id: gameId,
      player_id: player.id,
      endpoint: data.subscription.endpoint,
      p256dh: data.subscription.keys.p256dh,
      auth: data.subscription.keys.auth,
    },
    { onConflict: 'endpoint' }
  )

  if (error) {
    return NextResponse.json({ error: internalErrorMessage('games/code/push/subscribe', error) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
