import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { quickDrawVoteSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { parseGameType, isQuickDrawGame } from '@/lib/game-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, quickDrawVoteSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, drawingId, chosenTitleId } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isQuickDrawGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Quick Draw game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: session } = await supabase.from('quick_draw_sessions').select('phase').eq('game_id', code).maybeSingle()
  if (!session || session.phase !== 'voting') {
    return NextResponse.json({ error: 'Not accepting votes right now' }, { status: 400 })
  }

  const { data: drawing } = await supabase
    .from('quick_draw_drawings')
    .select('*')
    .eq('id', drawingId)
    .eq('game_id', code)
    .maybeSingle()
  if (!drawing) return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  if (auth.player.spectator === true || auth.player.is_eliminated === true) {
    return NextResponse.json({ error: 'Spectators cannot vote' }, { status: 403 })
  }

  if (drawing.player_id === playerId) {
    return NextResponse.json({ error: 'Artists cannot vote on their own drawing' }, { status: 400 })
  }

  const { data: title } = await supabase
    .from('quick_draw_titles')
    .select('id')
    .eq('id', chosenTitleId)
    .eq('drawing_id', drawingId)
    .maybeSingle()
  if (!title) return NextResponse.json({ error: 'Invalid title choice' }, { status: 400 })

  const { data: existing } = await supabase
    .from('quick_draw_votes')
    .select('id')
    .eq('player_id', playerId)
    .eq('drawing_id', drawingId)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: 'Already voted on this drawing' }, { status: 400 })

  const { error } = await supabase.from('quick_draw_votes').insert({
    game_id: code,
    drawing_id: drawingId,
    player_id: playerId,
    chosen_title_id: chosenTitleId,
  })

  if (error) return NextResponse.json({ error: internalErrorMessage('quick-draw/vote', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
