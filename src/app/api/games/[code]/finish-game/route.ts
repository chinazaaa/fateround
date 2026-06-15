import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hostActionSchema } from '@/lib/validation'
import { finishAnonymousRoomSession, finishSecretMessageBoard } from '@/lib/anonymous-messages'
import { parseGameType, isAnonymousMessagesGame, isSecretMessageGame } from '@/lib/game-types'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = hostActionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken } = parsed.data
  const gameId = code.toUpperCase()

  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  if (isAnonymousMessagesGame(parseGameType(game.game_type))) {
    const { error } = await finishAnonymousRoomSession(supabase, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isSecretMessageGame(parseGameType(game.game_type))) {
    const { error } = await finishSecretMessageBoard(supabase, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const { data: activeRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .maybeSingle()

  if (activeRound) {
    return NextResponse.json({ error: 'Current round must be ended first' }, { status: 400 })
  }

  if (game.current_round_number < game.rounds_count) {
    return NextResponse.json({ error: 'Not all rounds have been played' }, { status: 400 })
  }

  const { data: lastRound } = await supabase
    .from('rounds')
    .select('status')
    .eq('game_id', gameId)
    .eq('round_number', game.rounds_count)
    .maybeSingle()

  if (!lastRound || lastRound.status !== 'finished') {
    return NextResponse.json({ error: 'Final round results are not ready yet' }, { status: 400 })
  }

  const { error } = await supabase.from('games').update({ status: 'finished' }).eq('id', gameId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
