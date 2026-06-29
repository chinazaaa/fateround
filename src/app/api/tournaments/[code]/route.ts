import { NextRequest, NextResponse } from 'next/server'
import { parseJsonBody } from '@/lib/parse-body'
import { createClient } from '@supabase/supabase-js'
import { updateTournamentSchema } from '@/lib/tournament-validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

  const [playersRes, gamesRes] = await Promise.all([
    supabase
      .from('tournament_players')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('total_points', { ascending: false }),
    supabase
      .from('tournament_games')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('game_order', { ascending: true }),
  ])

  return NextResponse.json({
    tournament,
    players: playersRes.data ?? [],
    games: gamesRes.data ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, updateTournamentSchema)
  if (bodyError) return bodyError

  const { hostToken, title, placementPoints, targetGameCount, maxPlayers, eliminationConfig } = body

  const admin = getSupabaseAdmin()
  const { data: tournament } = await admin
    .from('tournaments')
    .select('host_token, status')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Lives settings can only change before the first game — afterwards players
  // already hold live counts and changing the rule mid-run would desync them.
  const editingLives = eliminationConfig !== undefined
  if (editingLives && tournament.status !== 'waiting') {
    return NextResponse.json(
      { error: 'Lives settings can only be changed before the first game starts' },
      { status: 400 }
    )
  }

  // Don't let the cap drop below the players already in the tournament.
  if (maxPlayers != null) {
    const { count } = await admin
      .from('tournament_players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
    if (count != null && maxPlayers < count) {
      return NextResponse.json(
        { error: `Max players can't be below the ${count} player${count === 1 ? '' : 's'} already joined` },
        { status: 400 }
      )
    }
  }

  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title
  if (placementPoints !== undefined) updates.placement_points = placementPoints
  if (targetGameCount !== undefined) updates.target_game_count = targetGameCount
  if (maxPlayers !== undefined) updates.max_players = maxPlayers

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('tournaments').update(updates).eq('id', tournamentId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Write the elimination config and re-sync players' lives atomically, so a
  // failed resync can never leave new rules paired with stale lives.
  if (editingLives) {
    const { error } = await admin.rpc('apply_tournament_lives', {
      p_tournament_id: tournamentId,
      p_config: eliminationConfig ?? null,
    })
    if (error) return NextResponse.json({ error: 'Failed to update lives settings' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
