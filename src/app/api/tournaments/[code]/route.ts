import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { updateTournamentSchema } from '@/lib/tournament-validation'
import { buildTournamentGameConfig, type TournamentGameConfigInput } from '@/lib/tournament-game-config'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = getSupabaseAnon()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: internalErrorMessage('tournaments/code', error) }, { status: 500 })
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

  const games = gamesRes.data ?? []

  // Surface whether a prior game's custom (CSV-uploaded) pack is available to carry
  // into the next game. The host's in-page upload state resets on reload/new tab, so
  // the lobby uses this to show the pack is still loaded and to allow Start without a
  // fresh upload. Mirrors the carry-over logic in the games POST route.
  // Also attach each game's own status so the lobby can tell a spawned-but-not-yet-
  // started game (waiting) from a running one, and start it from the lobby.
  let carriedCustomCount: number | null = null
  let gamesOut = games
  const gameIds = games.map((g) => g.game_id).filter((id): id is string => Boolean(id))
  if (gameIds.length > 0) {
    const admin = getSupabaseAdmin()
    const { data: priorGames } = await admin
      .from('games')
      .select('id, status, custom_questions, created_at')
      .in('id', gameIds)
    const statusById = new Map((priorGames ?? []).map((g) => [g.id, g.status]))
    gamesOut = games.map((g) => ({ ...g, game_status: g.game_id ? (statusById.get(g.game_id) ?? null) : null }))
    let latest: { created_at: string; count: number } | null = null
    for (const g of priorGames ?? []) {
      if (Array.isArray(g.custom_questions) && g.custom_questions.length > 0) {
        if (!latest || String(g.created_at) > latest.created_at) {
          latest = { created_at: String(g.created_at), count: g.custom_questions.length }
        }
      }
    }
    carriedCustomCount = latest?.count ?? null
  }

  return NextResponse.json({
    tournament,
    players: playersRes.data ?? [],
    games: gamesOut,
    carriedCustomCount,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, updateTournamentSchema)
  if (bodyError) return bodyError

  const { hostToken, title, placementPoints, targetGameCount, maxPlayers, eliminationConfig, gameConfig } = body

  const admin = getSupabaseAdmin()
  const { data: tournament } = await admin
    .from('tournaments')
    .select('host_token, status, format, game_type, game_config')
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

  // Game settings (house rules, dictionary, timers, ladder) can only change before
  // the first game, so an in-progress room is never re-configured mid-match.
  const editingGameConfig = gameConfig !== undefined
  if (editingGameConfig && tournament.status !== 'waiting') {
    return NextResponse.json(
      { error: 'Game settings can only be changed before the first game starts' },
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
  if (editingGameConfig) {
    // Merge over the stored config so a partial edit only changes the fields it
    // sends — omitted fields keep their prior value instead of resetting to a
    // hard-coded default in buildTournamentGameConfig.
    const merged = {
      ...((tournament.game_config as TournamentGameConfigInput | null) ?? {}),
      ...gameConfig,
    }
    updates.game_config = buildTournamentGameConfig(tournament.format, tournament.game_type, merged)
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('tournaments').update(updates).eq('id', tournamentId)
    if (error) return NextResponse.json({ error: internalErrorMessage('tournaments/code', error) }, { status: 500 })
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
