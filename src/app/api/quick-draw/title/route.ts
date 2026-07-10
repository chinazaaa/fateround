import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { quickDrawTitleSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { parseGameType, isQuickDrawGame } from '@/lib/game-types'
import { QUICK_DRAW_MAX_TITLE_LENGTH } from '@/lib/quick-draw'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, quickDrawTitleSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, drawingId, text } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isQuickDrawGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Quick Draw game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: session } = await supabase.from('quick_draw_sessions').select('phase').eq('game_id', code).maybeSingle()
  if (!session || session.phase !== 'titling') {
    return NextResponse.json({ error: 'Not accepting titles right now' }, { status: 400 })
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
    return NextResponse.json({ error: 'Spectators cannot submit titles' }, { status: 403 })
  }

  if (drawing.player_id === playerId) {
    return NextResponse.json({ error: 'Artists cannot submit fake titles for their own drawing' }, { status: 400 })
  }

  const trimmed = text.trim().slice(0, QUICK_DRAW_MAX_TITLE_LENGTH)
  if (!trimmed) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })

  const { data: existing } = await supabase
    .from('quick_draw_titles')
    .select('id')
    .eq('player_id', playerId)
    .eq('drawing_id', drawingId)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: 'Already submitted a title for this drawing' }, { status: 400 })

  const { error } = await supabase.from('quick_draw_titles').insert({
    game_id: code,
    drawing_id: drawingId,
    player_id: playerId,
    text: trimmed,
    is_real: false,
  })

  if (error) return NextResponse.json({ error: internalErrorMessage('quick-draw/title', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
