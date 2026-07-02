import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { h2hGroupSize, tournamentHostActionSchema } from '@/lib/tournament-validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { initializeChessGame } from '@/lib/chess'
import { initializeWhotGame } from '@/lib/whot'
import { initializeScrabbleGame } from '@/lib/scrabble'
import { startKnockoutRoundGame } from '@/lib/tournament-knockout'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Deal + start the right group game for a Whot/Scrabble bracket room. */
function initializeGroupGame(
  admin: SupabaseClient,
  gameType: string | null,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  if (gameType === 'whot') return initializeWhotGame(admin, gameId, playerIds)
  if (gameType === 'scrabble') return initializeScrabbleGame(admin, gameId, playerIds)
  return Promise.resolve({ error: `Unsupported group game type: ${gameType ?? 'unknown'}` })
}

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
    .select('host_token, format, status, game_type, game_config')
    .eq('id', tournamentId)
    .maybeSingle()
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (tournament.format !== 'head-to-head' && tournament.format !== 'knockout') {
    return NextResponse.json({ error: 'This tournament does not run bracket rounds' }, { status: 400 })
  }
  if (tournament.status === 'finished') return NextResponse.json({ error: 'Tournament has ended' }, { status: 400 })

  const { data: pendingRows } = await admin
    .from('tournament_games')
    .select('id, game_id, round_number, is_bye, player_a_id, player_b_id, member_ids')
    .eq('tournament_id', tournamentId)
    .eq('status', 'pending')
  if (!pendingRows?.length) return NextResponse.json({ error: 'No staged round to start' }, { status: 400 })

  // Start the latest staged round only.
  const roundNumber = Math.max(...pendingRows.map((r) => r.round_number ?? 0))

  // Knockout: the round is a single group game — start it server-side (pick
  // questions + activate). It then runs and finishes on its own.
  if (tournament.format === 'knockout') {
    const groupRow = pendingRows.find((r) => r.round_number === roundNumber && r.game_id)
    if (!groupRow?.game_id) return NextResponse.json({ error: 'No game to start' }, { status: 400 })

    const { data: gamePlayers } = await admin.from('players').select('id, spectator').eq('game_id', groupRow.game_id)
    const playing = (gamePlayers ?? []).filter((p) => p.spectator !== true)
    if (playing.length < 2) {
      return NextResponse.json(
        { error: 'Waiting for at least 2 players to be in the room before you can start.', started: 0 },
        { status: 400 }
      )
    }

    const { error: startError } = await startKnockoutRoundGame(admin, groupRow.game_id)
    if (startError) return NextResponse.json({ error: startError }, { status: 500 })

    const { error: tgError } = await admin.from('tournament_games').update({ status: 'active' }).eq('id', groupRow.id)
    if (tgError) {
      return NextResponse.json(
        { error: internalErrorMessage('tournaments/code/rounds/start', tgError) },
        { status: 500 }
      )
    }
    return NextResponse.json({ started: 1, players: playing.length })
  }

  const groupSize =
    Number((tournament.game_config as { groupSize?: number } | null)?.groupSize) || h2hGroupSize(tournament.game_type)

  // Group bracket (Whot/Scrabble): each staged room holds the group's members,
  // who auto-join from the lobby. Seat the members who are present (≥ 2), deal the
  // game, and flip the room live. A room without enough members stays pending so
  // the host can retry once stragglers arrive (or remove a no-show for a walkover).
  if (groupSize > 2) {
    const roundRooms = pendingRows.filter((r) => r.round_number === roundNumber && !r.is_bye && r.game_id)
    const memberIds = [
      ...new Set(roundRooms.flatMap((r) => (r.member_ids ?? []) as string[]).filter((id): id is string => Boolean(id))),
    ]
    const { data: rosterRows } = await admin
      .from('tournament_players')
      .select('id, player_name')
      .in('id', memberIds.length ? memberIds : ['__none__'])
    const nameById = new Map((rosterRows ?? []).map((p) => [p.id, p.player_name.toLowerCase()]))

    const sessionStartedAt = new Date().toISOString()
    let started = 0
    let waiting = 0

    for (const room of roundRooms) {
      const gameId = room.game_id as string
      const expectedNames = new Set(
        ((room.member_ids ?? []) as string[]).map((id) => nameById.get(id)).filter((n): n is string => Boolean(n))
      )
      const { data: gamePlayers } = await admin.from('players').select('id, name, spectator').eq('game_id', gameId)
      const seated = (gamePlayers ?? []).filter((p) => p.spectator !== true)
      // Seat only this room's expected members (never a stray joiner). A game needs
      // at least 2; a no-show member is simply absent and gets eliminated as a
      // non-winner when the room resolves.
      const memberSeats = seated.filter((p) => expectedNames.has(p.name.toLowerCase()))
      if (memberSeats.length < 2) {
        waiting++
        continue
      }

      const { error: initError } = await initializeGroupGame(
        admin,
        tournament.game_type,
        gameId,
        memberSeats.map((p) => p.id)
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

      const { error: tgError } = await admin.from('tournament_games').update({ status: 'active' }).eq('id', room.id)
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
