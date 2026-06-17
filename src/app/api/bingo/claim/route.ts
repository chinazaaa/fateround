import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bingoClaimSchema } from '@/lib/validation'
import { parseGameType, isBingoGame } from '@/lib/game-types'
import { hasBingoWin } from '@/lib/bingo'
import { markGameFinished } from '@/lib/game-finish'
import { playerIsViewer } from '@/lib/viewers'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = bingoClaimSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId } = parsed.data
  const code = gameId.toUpperCase()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isBingoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a bingo game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: player } = await supabase
    .from('players')
    .select('id, joined_at, spectator')
    .eq('id', playerId)
    .eq('game_id', code)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (playerIsViewer(player, game)) {
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
