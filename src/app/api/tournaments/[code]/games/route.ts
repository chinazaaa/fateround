import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateGameCode, generateToken } from '@/lib/utils'
import { addTournamentGameSchema, TOURNAMENT_ELIGIBLE_TYPES } from '@/lib/tournament-validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const raw = await req.json()
  const parsed = addTournamentGameSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken, gameType, gameSettings } = parsed.data

  if (!TOURNAMENT_ELIGIBLE_TYPES.includes(gameType as (typeof TOURNAMENT_ELIGIBLE_TYPES)[number])) {
    return NextResponse.json({ error: `Game type "${gameType}" is not eligible for tournaments` }, { status: 400 })
  }

  const { data: tournament } = await supabase.from('tournaments').select('*').eq('id', tournamentId).maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }
  if (tournament.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: 'Tournament has ended' }, { status: 400 })
  }

  const { data: activeGame } = await supabase
    .from('tournament_games')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('status', 'active')
    .maybeSingle()

  if (activeGame) {
    return NextResponse.json({ error: 'A game is already in progress' }, { status: 400 })
  }

  let gameCode = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateGameCode()
    const { data: existing } = await supabase.from('games').select('id').eq('id', candidate).maybeSingle()
    if (!existing) {
      gameCode = candidate
      break
    }
  }

  if (!gameCode) {
    return NextResponse.json({ error: 'Failed to generate unique game code' }, { status: 500 })
  }

  const gameHostToken = generateToken()

  const { error: gameError } = await supabase.from('games').insert({
    id: gameCode,
    host_token: gameHostToken,
    title: `${tournament.title} - Game`,
    game_type: gameType,
    rounds_count: gameSettings?.rounds_count ?? 10,
    timer_seconds: gameSettings?.timer_seconds ?? 30,
    tournament_id: tournamentId,
  })

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 })
  }

  const { data: lastGame } = await supabase
    .from('tournament_games')
    .select('game_order')
    .eq('tournament_id', tournamentId)
    .order('game_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (lastGame?.game_order ?? 0) + 1

  const { error: tgError } = await supabase.from('tournament_games').insert({
    tournament_id: tournamentId,
    game_id: gameCode,
    game_order: nextOrder,
    status: 'active',
  })

  if (tgError) {
    return NextResponse.json({ error: tgError.message }, { status: 500 })
  }

  if (tournament.status === 'waiting') {
    await supabase.from('tournaments').update({ status: 'active' }).eq('id', tournamentId)
  }

  return NextResponse.json({ gameCode, gameHostToken })
}
