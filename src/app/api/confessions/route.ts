import { NextRequest, NextResponse } from 'next/server'
import { createConfessionSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, createConfessionSchema)
  if (bodyError) return bodyError

  const { gameId, roundId, text, resumeToken } = body

  const supabase = getSupabaseAdmin()

  // Authorize by the secret resume_token: confessions stay anonymous to other players,
  // but the poster must be a real player in this game. The resolved player id is NOT
  // persisted on the confession.
  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // A confession may only attach to a round in THIS game (the service role would otherwise
  // accept any roundId).
  const normalizedRoundId = roundId || null
  if (normalizedRoundId) {
    const { data: round } = await supabase
      .from('rounds')
      .select('id')
      .eq('id', normalizedRoundId)
      .eq('game_id', auth.id)
      .maybeSingle()
    if (!round) {
      return NextResponse.json({ error: 'Round does not belong to this game' }, { status: 400 })
    }
  }

  const { error } = await supabase.from('confessions').insert({
    game_id: auth.id,
    round_id: normalizedRoundId,
    text,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
