import { NextRequest, NextResponse } from 'next/server'
import { bingoSettingsSchema } from '@/lib/validation'
import { parseGameType, isBingoGame } from '@/lib/game-types'
import { parseBingoCallMode, clampBingoCallInterval } from '@/lib/bingo'
import { clampLobbyMaxPlayers, fetchGamePlayerLimits } from '@/lib/game-limits'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, bingoSettingsSchema)
  if (bodyError) return bodyError

  const { gameId, hostToken, bingo_call_mode, bingo_call_interval_seconds, max_players } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  if (bingo_call_mode === undefined && bingo_call_interval_seconds === undefined && max_players === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isBingoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a bingo game' }, { status: 400 })
  }
  if (game.status !== 'waiting') {
    return NextResponse.json(
      { error: 'Settings can only be changed in the lobby before the game starts' },
      { status: 400 }
    )
  }

  const gameUpdate: Record<string, unknown> = {}
  if (bingo_call_mode !== undefined) gameUpdate.bingo_call_mode = parseBingoCallMode(bingo_call_mode)
  if (bingo_call_interval_seconds !== undefined) {
    gameUpdate.bingo_call_interval_seconds = clampBingoCallInterval(bingo_call_interval_seconds)
  }
  if (max_players !== undefined) {
    const lobbyLimits = await fetchGamePlayerLimits(supabase)
    gameUpdate.max_players = clampLobbyMaxPlayers('bingo', max_players, lobbyLimits)
  }

  const { data: updated, error } = await supabase.from('games').update(gameUpdate).eq('id', code).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, game: updated })
}
