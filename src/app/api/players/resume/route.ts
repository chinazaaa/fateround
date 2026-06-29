import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { normalizeResumeToken } from '@/lib/utils'
import { playerIsViewer } from '@/lib/viewers'
import type { Game } from '@/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const resumeSchema = z.object({
  gameCode: z.string().min(4),
  resumeToken: z.string().min(4),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, resumeSchema)
  if (bodyError) return bodyError

  const gameId = body.gameCode.toUpperCase()
  const resumeToken = normalizeResumeToken(body.resumeToken)
  if (resumeToken.length < 4) {
    return NextResponse.json({ error: 'Enter a valid player code' }, { status: 400 })
  }

  const [{ data: game }, { data: player }] = await Promise.all([
    supabase
      .from('games')
      .select('id, status, session_started_at, game_type, allow_viewers, allow_late_players, codewords_late_join')
      .eq('id', gameId)
      .maybeSingle(),
    getSupabaseAdmin()
      .from('players')
      .select('id, name, gender, identity_gender, resume_token, spectator, joined_at')
      .eq('game_id', gameId)
      .eq('resume_token', resumeToken)
      .maybeSingle(),
  ])

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!player)
    return NextResponse.json({ error: 'Player code not found — check the code and try again' }, { status: 404 })

  return NextResponse.json({
    playerId: player.id,
    playerName: player.name,
    playerGender: player.gender,
    playerIdentityGender: player.identity_gender,
    resumeToken: player.resume_token,
    isViewer: playerIsViewer(player, game as Game),
  })
}
