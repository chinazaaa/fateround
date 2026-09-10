import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { whotAdmitSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { isWhotGame, parseGameType } from '@/lib/game-types'
import { admitWhotPlayer, whotGameSessionExpired } from '@/lib/whot'
import { fetchGamePlayerLimits, lobbyMaxPlayersFromGame } from '@/lib/game-limits'
import { assertHostAny } from '@/lib/game-admin'

// Host-initiated: deal a spectator into an ACTIVE Whot game. Host-authed (host_token),
// whot-only, active-only. The game-state work (seat + deal, CAS, guards) lives in
// admitWhotPlayer; this route only authorizes and resolves the seat cap.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data: body, error: bodyError } = await parseJsonBody(req, whotAdmitSchema)
  if (bodyError) return bodyError

  const { hostToken, playerId } = body
  const gameCode = code.toUpperCase()
  const admin = getSupabaseAdmin()

  // 404/403 only: the game-TYPE gate below has to stay AHEAD of the status gate, so the
  // status-gated wrappers can't be used here without changing which 400 a caller sees.
  const { game, error: authError, status: authStatus } = await assertHostAny(admin, gameCode, hostToken)
  if (!game) return NextResponse.json({ error: authError }, { status: authStatus })
  if (!isWhotGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Whot game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Players can only be dealt in while the game is in progress' }, { status: 400 })
  }
  if (whotGameSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    return NextResponse.json({ error: 'This game has already ended' }, { status: 400 })
  }

  const limits = await fetchGamePlayerLimits(admin)
  const maxPlayers = lobbyMaxPlayersFromGame('whot', game, limits)

  const { error, status } = await admitWhotPlayer(admin, gameCode, playerId, maxPlayers)
  if (error) return NextResponse.json({ error }, { status })
  return NextResponse.json({ success: true })
}
