import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

const rotateResumeSchema = z.object({
  gameCode: z.string().min(4),
  resumeToken: z.string().min(4),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, rotateResumeSchema)
  if (bodyError) return bodyError

  const gameId = body.gameCode.toUpperCase()
  const oldToken = body.resumeToken.trim().toUpperCase()

  const admin = getSupabaseAdmin()

  const { data: newToken, error } = await admin.rpc('rotate_player_resume_token', {
    p_game_id: gameId,
    p_old_token: oldToken,
  })

  if (error) {
    if (error.message.includes('Player code not found')) {
      return NextResponse.json({ error: 'Player code not found — check the code and try again' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to change player code' }, { status: 500 })
  }

  return NextResponse.json({ newToken })
}
