import { NextRequest, NextResponse } from 'next/server'
import { promotePlayerSchema } from '@/lib/validation'
import { parseGameType, isBingoGame, isCodewordsGame } from '@/lib/game-types'
import { createBingoCardForPlayer } from '@/lib/bingo'
import { assignCodewordsLateJoinOperative } from '@/lib/codewords'
import { allowLatePlayers, playerIsViewer } from '@/lib/viewers'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { Game } from '@/types'

export async function POST(req: NextRequest) {
  const parsed = promotePlayerSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameCode, resumeToken } = parsed.data
  const gameId = gameCode.toUpperCase()

  const supabase = getSupabaseAdmin()

  // Authorize by the secret resume_token; the resolved player is the (self) actor — a caller
  // can only ever promote themselves.
  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const authPlayerId = auth.player.id

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
    .eq('id', authPlayerId)
    .eq('game_id', gameId)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  if (!playerIsViewer(player, game)) {
    return NextResponse.json({ error: 'You are already playing' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('players')
    .update({ spectator: false })
    .eq('id', authPlayerId)
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
      .eq('player_id', authPlayerId)
      .maybeSingle()

    if (!existingCard) {
      const { error: cardError } = await createBingoCardForPlayer(supabase, gameId, authPlayerId)
      if (cardError) {
        await supabase.from('players').update({ spectator: true }).eq('id', authPlayerId)
        return NextResponse.json({ error: cardError }, { status: 500 })
      }
    }
  }

  if (isCodewordsGame(gameType)) {
    const { role, error: assignError } = await assignCodewordsLateJoinOperative(supabase, gameId, authPlayerId)
    if (assignError) {
      await supabase.from('players').update({ spectator: true }).eq('id', authPlayerId)
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
