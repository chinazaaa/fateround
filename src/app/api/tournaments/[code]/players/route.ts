import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { joinTournamentSchema } from '@/lib/tournament-validation'
import type { EliminationConfig } from '@/types/elimination'

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
    .select('id, status, elimination_config, max_players')
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
    .select('id, is_eliminated')
    .eq('tournament_id', tournamentId)
    .ilike('player_name', playerName)
    .maybeSingle()

  if (existing) {
    if (existing.is_eliminated) {
      return NextResponse.json({ error: 'You have been eliminated from this tournament' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Name already taken' }, { status: 409 })
  }

  // Enforce the optional player cap (this is a new name, so it would add a slot).
  if (tournament.max_players) {
    const { count } = await supabase
      .from('tournament_players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
    if ((count ?? 0) >= tournament.max_players) {
      return NextResponse.json({ error: 'Tournament is full' }, { status: 409 })
    }
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

  // Initialize lives if tournament has lives elimination config
  if (tournament.elimination_config) {
    const elimConfig = tournament.elimination_config as EliminationConfig
    if (elimConfig.mode === 'lives' && elimConfig.startingLives && player) {
      await supabase
        .from('tournament_players')
        .update({ lives_remaining: elimConfig.startingLives })
        .eq('id', player.id)
    }
  }

  return NextResponse.json({ player })
}
