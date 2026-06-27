import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { joinTournamentSchema } from '@/lib/tournament-validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const raw = await req.json()
  const parsed = joinTournamentSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { playerName } = parsed.data

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, status')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: 'Tournament has ended' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('tournament_players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .ilike('player_name', playerName)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Name already taken' }, { status: 409 })
  }

  const { data: player, error } = await supabase
    .from('tournament_players')
    .insert({
      tournament_id: tournamentId,
      player_name: playerName,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ player })
}
