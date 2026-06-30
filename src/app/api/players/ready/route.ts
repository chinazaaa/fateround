import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { fetchGamePlayerLimits, isLobbyLimitGameType, lobbyMaxPlayersFromGame } from '@/lib/game-limits'

const schema = z.object({
  gameId: z.string().min(2).max(12),
  // Self-action: the player marks themselves ready — authorized by their resume_token.
  resumeToken: z.string().min(4),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, schema)
  if (bodyError) return bodyError

  const { gameId, resumeToken } = body
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

  // Enforce the seat cap so a player can't take a seat past the game's max — e.g.
  // re-readying after Play Again, when more people are in the lobby than the game
  // seats. Spectators may exceed the cap as watchers; un-spectatoring into an
  // already-full table is refused. Only board-style games carry a seat limit;
  // poll games (not in the lobby-limit set) have none, so they're never blocked.
  if (isLobbyLimitGameType(game.game_type)) {
    const limits = await fetchGamePlayerLimits(supabase)
    const maxPlayers = lobbyMaxPlayersFromGame(game.game_type, game, limits)
    const { count: seatedCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameCode)
      .eq('spectator', false)
      .neq('id', auth.player.id)
    if ((seatedCount ?? 0) >= maxPlayers) {
      return NextResponse.json(
        { error: `This game is full (${maxPlayers} players max) — you can keep watching` },
        { status: 400 }
      )
    }
  }

  const { error } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('id', auth.player.id)
    .eq('game_id', gameCode)

  if (error) return NextResponse.json({ error: internalErrorMessage('players/ready', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
