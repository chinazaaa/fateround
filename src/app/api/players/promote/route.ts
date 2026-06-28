import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { promotePlayerSchema } from '@/lib/validation'
import { parseGameType, isBingoGame, isCodewordsGame } from '@/lib/game-types'
import { createBingoCardForPlayer } from '@/lib/bingo'
import { assignCodewordsLateJoinOperative } from '@/lib/codewords'
import { allowLatePlayers, playerIsViewer } from '@/lib/viewers'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { Game } from '@/types'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const parsed = promotePlayerSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameCode, playerId } = parsed.data
  const gameId = gameCode.toUpperCase()

  const { data: gameRow } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!gameRow) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const game = gameRow as Game
  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Game is not in progress' }, { status: 400 })
  }

  if (!allowLatePlayers(game)) {
    return NextResponse.json({ error: 'This game only allows late joiners to watch' }, { status: 400 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .eq('game_id', gameId)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  if (!playerIsViewer(player, game)) {
    return NextResponse.json({ error: 'You are already playing' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('id', playerId)
    .eq('game_id', gameId)
    .select()
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Failed to update player' }, { status: 500 })
  }

  const gameType = parseGameType(game.game_type)
  const extra: Record<string, unknown> = {}

  if (isBingoGame(gameType)) {
    const { data: existingCard } = await supabase
      .from('bingo_cards')
      .select('id')
      .eq('player_id', playerId)
      .maybeSingle()

    if (!existingCard) {
      const { error: cardError } = await createBingoCardForPlayer(getSupabaseAdmin(), gameId, playerId)
      if (cardError) {
        await supabase.from('players').update({ spectator: true }).eq('id', playerId)
        return NextResponse.json({ error: cardError }, { status: 500 })
      }
    }
  }

  if (isCodewordsGame(gameType)) {
    const { role, error: assignError } = await assignCodewordsLateJoinOperative(getSupabaseAdmin(), gameId, playerId)
    if (assignError) {
      await supabase.from('players').update({ spectator: true }).eq('id', playerId)
      return NextResponse.json({ error: assignError }, { status: 500 })
    }
    if (role) extra.codewordsRole = role
  }

  return NextResponse.json({
    playerId: updated.id,
    playerName: updated.name,
    playerGender: updated.gender,
    playerIdentityGender: updated.identity_gender,
    isViewer: false,
    ...extra,
  })
}
