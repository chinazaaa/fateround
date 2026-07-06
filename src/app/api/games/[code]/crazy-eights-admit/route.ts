import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { crazyEightsAdmitSchema } from '@/lib/validation'
import { isCrazyEightsGame, parseGameType } from '@/lib/game-types'
import { admitCrazyEightsPlayer, crazyEightsGameSessionExpired } from '@/lib/crazy-eights'
import { fetchGamePlayerLimits, lobbyMaxPlayersFromGame } from '@/lib/game-limits'

// Host-initiated: deal a spectator into an ACTIVE Crazy Eights game. Host-authed (host_token),
// crazy-eights-only, active-only. The game-state work (seat + deal, CAS, guards) lives in
// admitCrazyEightsPlayer; this route only authorizes and resolves the seat cap.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = crazyEightsAdmitSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken, playerId } = parsed.data
  const gameCode = code.toUpperCase()
  const admin = getSupabaseAdmin()

  const { data: game } = await admin.from('games').select('*').eq('id', gameCode).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isCrazyEightsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Crazy Eights game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Players can only be dealt in while the game is in progress' }, { status: 400 })
  }
  if (crazyEightsGameSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    return NextResponse.json({ error: 'This game has already ended' }, { status: 400 })
  }

  const limits = await fetchGamePlayerLimits(admin)
  const maxPlayers = lobbyMaxPlayersFromGame('crazy_eights', game, limits)

  const { error, status } = await admitCrazyEightsPlayer(admin, gameCode, playerId, maxPlayers)
  if (error) return NextResponse.json({ error }, { status })
  return NextResponse.json({ success: true })
}
