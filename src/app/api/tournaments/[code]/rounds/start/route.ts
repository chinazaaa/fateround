import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { tournamentHostActionSchema } from '@/lib/tournament-validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { initializeChessGame } from '@/lib/chess'

/**
 * Start every staged match in the current head-to-head round at once. Each match
 * is a chess room the two paired players have auto-joined from the lobby; we seat
 * the two present players and flip the room live, so all clocks begin together.
 * A match without both players seated stays `pending` and is reported back as
 * waiting (the host can retry once stragglers arrive).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, tournamentHostActionSchema)
  if (bodyError) return bodyError

  const { hostToken } = body
  const admin = getSupabaseAdmin()

  const { data: tournament } = await admin
    .from('tournaments')
    .select('host_token, format, status')
    .eq('id', tournamentId)
    .maybeSingle()
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (tournament.format !== 'head-to-head') {
    return NextResponse.json({ error: 'Not a head-to-head tournament' }, { status: 400 })
  }
  if (tournament.status === 'finished') return NextResponse.json({ error: 'Tournament has ended' }, { status: 400 })

  const { data: pendingRows } = await admin
    .from('tournament_games')
    .select('id, game_id, round_number, is_bye, player_a_id, player_b_id')
    .eq('tournament_id', tournamentId)
    .eq('status', 'pending')
  if (!pendingRows?.length) return NextResponse.json({ error: 'No staged matches to start' }, { status: 400 })

  // Start the latest staged round only.
  const roundNumber = Math.max(...pendingRows.map((r) => r.round_number ?? 0))
  const roundMatches = pendingRows.filter((r) => r.round_number === roundNumber && !r.is_bye && r.game_id)

  // The two players each match is supposed to be between. tournament_players
  // enforces unique names per tournament, so a display name pins a bracket slot
  // exactly — we use it to bind room seats to the intended pairing.
  const rosterIds = [
    ...new Set(roundMatches.flatMap((m) => [m.player_a_id, m.player_b_id]).filter((id): id is string => Boolean(id))),
  ]
  const { data: rosterRows } = await admin.from('tournament_players').select('id, player_name').in('id', rosterIds)
  const nameById = new Map((rosterRows ?? []).map((p) => [p.id, p.player_name.toLowerCase()]))

  const sessionStartedAt = new Date().toISOString()
  let started = 0
  let waiting = 0

  for (const match of roundMatches) {
    const gameId = match.game_id as string
    const expectedNames = new Set(
      [nameById.get(match.player_a_id ?? ''), nameById.get(match.player_b_id ?? '')].filter(Boolean)
    )
    const { data: gamePlayers } = await admin.from('players').select('id, name, spectator').eq('game_id', gameId)
    const seated = (gamePlayers ?? []).filter((p) => p.spectator !== true)
    // Seat only the two paired players — never let a stray joiner or the wrong
    // player decide someone else's bracket slot. If both paired players aren't
    // seated yet, leave the match staged so the host can start it on a retry.
    const pairedSeats = seated.filter((p) => expectedNames.has(p.name.toLowerCase()))
    if (expectedNames.size !== 2 || pairedSeats.length !== 2) {
      waiting++
      continue
    }

    const { error: initError } = await initializeChessGame(
      admin,
      gameId,
      pairedSeats.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await admin
      .from('games')
      .update({ status: 'active', session_started_at: sessionStartedAt, current_round_number: 1, rounds_count: 1 })
      .eq('id', gameId)
    if (gameError) {
      return NextResponse.json(
        { error: internalErrorMessage('tournaments/code/rounds/start', gameError) },
        { status: 500 }
      )
    }

    const { error: tgError } = await admin.from('tournament_games').update({ status: 'active' }).eq('id', match.id)
    if (tgError) {
      return NextResponse.json(
        { error: internalErrorMessage('tournaments/code/rounds/start', tgError) },
        { status: 500 }
      )
    }

    started++
  }

  return NextResponse.json({ started, waiting })
}
