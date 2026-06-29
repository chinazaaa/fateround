import { NextRequest, NextResponse } from 'next/server'
import { bingoClaimSchema } from '@/lib/validation'
import { parseGameType, isBingoGame } from '@/lib/game-types'
import { hasBingoWin } from '@/lib/bingo'
import { markGameFinished } from '@/lib/game-finish'
import { playerIsViewer } from '@/lib/viewers'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, bingoClaimSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isBingoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a bingo game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id
  if (playerIsViewer(auth.player, game)) {
    return NextResponse.json({ error: 'Viewers cannot claim bingo' }, { status: 403 })
  }

  const { data: existingWinner } = await supabase
    .from('bingo_claims')
    .select('id')
    .eq('game_id', code)
    .eq('status', 'approved')
    .maybeSingle()

  if (existingWinner) {
    return NextResponse.json({ error: 'Someone already won this round' }, { status: 400 })
  }

  const { data: card } = await supabase
    .from('bingo_cards')
    .select('*')
    .eq('game_id', code)
    .eq('player_id', playerId)
    .maybeSingle()

  if (!card) return NextResponse.json({ error: 'Bingo card not found' }, { status: 404 })

  const cells = card.cells as number[]
  const marked = (card.marked_indices as number[]) ?? []
  const valid = hasBingoWin(cells, marked, 'line')

  if (!valid) {
    return NextResponse.json({ error: 'No valid bingo line yet' }, { status: 400 })
  }

  const { data: claim, error: claimError } = await supabase
    .from('bingo_claims')
    .insert({
      game_id: code,
      player_id: playerId,
      pattern: 'line',
      status: 'approved',
    })
    .select()
    .single()

  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })

  const { error: gameError } = await markGameFinished(supabase, code)
  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

  return NextResponse.json({ success: true, claim })
}
