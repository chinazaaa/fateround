import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { whotAdmitSchema } from '@/lib/validation'
import { isWhotGame, parseGameType } from '@/lib/game-types'
import { admitWhotPlayer, whotGameSessionExpired } from '@/lib/whot'
import { fetchGamePlayerLimits, lobbyMaxPlayersFromGame } from '@/lib/game-limits'

// Host-initiated: deal a spectator into an ACTIVE Whot game. Host-authed (host_token),
// whot-only, active-only. The game-state work (seat + deal, CAS, guards) lives in
// admitWhotPlayer; this route only authorizes and resolves the seat cap.
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = whotAdmitSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken, playerId } = parsed.data
  const gameCode = code.toUpperCase()
  const admin = getSupabaseAdmin()

  const { data: game } = await admin.from('games').select('*').eq('id', gameCode).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
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
