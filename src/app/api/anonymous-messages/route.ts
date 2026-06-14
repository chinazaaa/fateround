import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAnonymousMessageSchema, deleteAnonymousMessageSchema } from '@/lib/validation'
import { parseGameType, isAnonymousMessagesGame } from '@/lib/game-types'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = createAnonymousMessageSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, text } = parsed.data
  const gameCode = gameId.toUpperCase()

  const { data: game } = await supabase
    .from('games')
    .select('status, game_type')
    .eq('id', gameCode)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isAnonymousMessagesGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an anonymous room' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 400 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('game_id', gameCode)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Player not in this game' }, { status: 403 })

  const { error } = await supabase.from('anonymous_messages').insert({
    game_id: gameCode,
    player_id: playerId,
    text,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const raw = await req.json()
  const parsed = deleteAnonymousMessageSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, messageId, hostToken } = parsed.data
  const gameCode = gameId.toUpperCase()

  const { data: game } = await supabase.from('games').select('host_token, status, game_type').eq('id', gameCode).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isAnonymousMessagesGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an anonymous room' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ error: 'Messages can only be removed during an active session' }, { status: 400 })
  }

  const { data: message } = await supabase
    .from('anonymous_messages')
    .select('id')
    .eq('id', messageId)
    .eq('game_id', gameCode)
    .maybeSingle()

  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

  const { error } = await supabase.from('anonymous_messages').delete().eq('id', messageId).eq('game_id', gameCode)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
