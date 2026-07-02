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
    .select('id, game_id, round_number, is_bye')
    .eq('tournament_id', tournamentId)
    .eq('status', 'pending')
  if (!pendingRows?.length) return NextResponse.json({ error: 'No staged matches to start' }, { status: 400 })

  // Start the latest staged round only.
  const roundNumber = Math.max(...pendingRows.map((r) => r.round_number ?? 0))
  const roundMatches = pendingRows.filter((r) => r.round_number === roundNumber && !r.is_bye && r.game_id)

  const sessionStartedAt = new Date().toISOString()
  let started = 0
  let waiting = 0

  for (const match of roundMatches) {
    const gameId = match.game_id as string
    const { data: gamePlayers } = await admin.from('players').select('id, spectator').eq('game_id', gameId)
    const seated = (gamePlayers ?? []).filter((p) => p.spectator !== true)

    // Chess needs exactly two seated players. If both haven't joined yet, leave
    // the match staged so the host can start it on a retry.
    if (seated.length !== 2) {
      waiting++
      continue
    }

    const { error: initError } = await initializeChessGame(
      admin,
      gameId,
      seated.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await admin
      .from('games')
      .update({ status: 'active', session_started_at: sessionStartedAt, current_round_number: 1, rounds_count: 1 })
      .eq('id', gameId)
    if (gameError) {
      return NextResponse.json({ error: internalErrorMessage('tournaments/code/rounds/start', gameError) }, { status: 500 })
    }

    const { error: tgError } = await admin.from('tournament_games').update({ status: 'active' }).eq('id', match.id)
    if (tgError) {
      return NextResponse.json({ error: internalErrorMessage('tournaments/code/rounds/start', tgError) }, { status: 500 })
    }

    started++
  }

  return NextResponse.json({ started, waiting })
}
