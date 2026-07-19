import { NextRequest, NextResponse } from 'next/server'
import { spectatePlayerSchema } from '@/lib/validation'
import { playerIsViewer } from '@/lib/viewers'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { Game } from '@/types'
import { parseJsonBody } from '@/lib/parse-body'

/**
 * Self sit-out during active play: the inverse of {@link ../promote/route}. A seated
 * player (in practice a host who chose "Host + play") flips their own row to
 * `spectator: true` so they drop out of gameplay/scoring while the game continues —
 * "Leave game (keep hosting)". Kept deliberately non-destructive: it updates the
 * `spectator` flag in place (never deletes the row), so the row id, resume_token and
 * any accumulated score/history survive and the caller can `promote` straight back in
 * (the mid-game ViewerModeBanner "Join as player" path).
 *
 * Auth is by the caller's own resume_token, so a caller can only ever sit *themselves*
 * out — the host token is not required here (the host keeps hosting regardless).
 */
export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, spectatePlayerSchema)
  if (bodyError) return bodyError

  const { gameCode, resumeToken } = data
  const gameId = gameCode.toUpperCase()

  const supabase = getSupabaseAdmin()

  // Authorize by the secret resume_token; the resolved player is the (self) actor.
  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const authPlayerId = auth.player.id

  const { data: gameRow } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!gameRow) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const game = gameRow as Game
  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Game is not in progress' }, { status: 400 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', authPlayerId)
    .eq('game_id', gameId)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  // Already watching — nothing to do, but report the current state so the client can settle.
  if (playerIsViewer(player, game)) {
    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
      playerIdentityGender: player.identity_gender,
      isViewer: true,
    })
  }

  const { data: updated, error: updateError } = await supabase
    .from('players')
    .update({ spectator: true })
    .eq('id', authPlayerId)
    .eq('game_id', gameId)
    .select()
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Failed to update player' }, { status: 500 })
  }

  return NextResponse.json({
    playerId: updated.id,
    playerName: updated.name,
    playerGender: updated.gender,
    playerIdentityGender: updated.identity_gender,
    isViewer: true,
  })
}
