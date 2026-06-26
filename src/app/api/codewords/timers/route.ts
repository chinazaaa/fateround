import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { clampCodewordsTimer } from '@/lib/codewords'
import { clampLobbyMaxPlayers, fetchGamePlayerLimits } from '@/lib/game-limits'
import { codewordsLobbySettingsSchema } from '@/lib/validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = codewordsLobbySettingsSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, hostToken, max_players, spymasterTimerSeconds, operativeTimerSeconds } = parsed.data
  const code = gameId.toUpperCase()

  if (max_players === undefined && spymasterTimerSeconds === undefined && operativeTimerSeconds === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: game } = await supabase
    .from('games')
    .select('host_token, game_type, status')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (game.status !== 'waiting') {
    return NextResponse.json(
      { error: 'Timers can only be changed in the lobby before the game starts' },
      { status: 400 }
    )
  }

  const gameUpdate: Record<string, number> = {}
  const boardUpdate: Record<string, number> = {}

  if (max_players !== undefined) {
    const lobbyLimits = await fetchGamePlayerLimits(supabase)
    const nextMax = clampLobbyMaxPlayers('codewords', max_players, lobbyLimits)
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', code)
    if ((playerCount ?? 0) > nextMax) {
      return NextResponse.json(
        { error: `Already have ${playerCount} players — remove someone or pick at least ${playerCount}` },
        { status: 400 }
      )
    }
    gameUpdate.max_players = nextMax
  }

  if (spymasterTimerSeconds !== undefined) {
    const value = clampCodewordsTimer(spymasterTimerSeconds)
    gameUpdate.timer_seconds = value
    boardUpdate.spymaster_timer_seconds = value
  }
  if (operativeTimerSeconds !== undefined) {
    const value = clampCodewordsTimer(operativeTimerSeconds)
    gameUpdate.operative_timer_seconds = value
    boardUpdate.operative_timer_seconds = value
  }

  const { data: updatedGame, error: gameError } = await supabase
    .from('games')
    .update(gameUpdate)
    .eq('id', code)
    .select()
    .single()
  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

  if (Object.keys(boardUpdate).length > 0) {
    const { data: board } = await supabase.from('codewords_boards').select('id').eq('game_id', code).maybeSingle()
    if (board) {
      await supabase.from('codewords_boards').update(boardUpdate).eq('id', board.id)
    }
  }

  return NextResponse.json({ success: true, game: updatedGame })
}
