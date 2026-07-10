import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { normalizeResumeToken } from '@/lib/utils'
import { internalErrorMessage } from '@/lib/api-errors'

const subscribeSchema = z.object({
  resumeToken: z.string().min(4),
  expoPushToken: z.string().min(1),
  platform: z.enum(['ios', 'android', 'unknown']).default('unknown'),
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

  const { data: player } = await admin
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .eq('resume_token', resumeToken)
    .maybeSingle()

  if (!player) {
    return NextResponse.json({ error: 'Player not found for this game' }, { status: 404 })
  }

  const { error } = await admin.from('mobile_push_tokens').upsert(
    {
      game_id: gameId,
      player_id: player.id,
      expo_push_token: data.expoPushToken,
      platform: data.platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token' }
  )

  if (error) {
    return NextResponse.json({ error: internalErrorMessage('games/code/push/expo-subscribe', error) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
