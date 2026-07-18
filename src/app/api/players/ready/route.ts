import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertLobbyPlayerSeatAvailable } from '@/lib/game-limits'

const schema = z.object({
  gameId: z.string().min(2).max(12),
  // Self-action: the player marks themselves ready — authorized by their resume_token.
  resumeToken: z.string().min(4),
  // Whot replay ring: `false` sits the player back out (spectator) to un-ready.
  // Omitted/`true` keeps the original behaviour (take a seat / ready up).
  ready: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, schema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, ready } = body
  const wantsSeat = ready !== false
  const gameCode = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, tournament_id, game_type, max_players')
    .eq('id', gameCode)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Game is not in the lobby' }, { status: 400 })
  }
  // Tournament rosters lock when the first game starts. Watchers (and eliminated
  // players) enter later games as spectators — they must not be able to un-spectator
  // themselves into the locked roster.
  if (game.tournament_id) {
    return NextResponse.json(
      { error: "You're watching this tournament — the player roster is locked" },
      { status: 403 }
    )
  }

  const auth = await assertPlayer(supabase, gameCode, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (wantsSeat) {
    const seat = await assertLobbyPlayerSeatAvailable(supabase, game, auth.player.id)
    if (!seat.ok) {
      // `full` lets the caller (e.g. the host seat toggle) show a tailored "keep watching"
      // message and stay on the spectator seat rather than a generic failure.
      return NextResponse.json({ error: seat.error, full: true }, { status: 400 })
    }
  }

  const { error } = await supabase
    .from('players')
    .update({ spectator: !wantsSeat })
    .eq('id', auth.player.id)
    .eq('game_id', gameCode)

  if (error) return NextResponse.json({ error: internalErrorMessage('players/ready', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
