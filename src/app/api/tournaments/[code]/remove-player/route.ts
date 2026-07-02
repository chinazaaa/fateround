import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { removeTournamentPlayerSchema } from '@/lib/tournament-validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Host removes a player from a tournament — e.g. a no-show who never joined their
 * match room and is blocking the round from starting.
 *
 * The player is eliminated. In a head-to-head bracket their current match is then
 * resolved so the round can move on: the opponent walks over (advances), unless
 * the opponent has also been removed, in which case the match is voided (no one
 * advances). If removing a player leaves a single survivor, the tournament ends.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, removeTournamentPlayerSchema)
  if (bodyError) return bodyError

  const { hostToken, playerId } = body
  const admin = getSupabaseAdmin()

  const { data: tournament } = await admin
    .from('tournaments')
    .select('host_token, format, status')
    .eq('id', tournamentId)
    .maybeSingle()
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (tournament.status === 'finished') return NextResponse.json({ error: 'Tournament has ended' }, { status: 400 })

  const { data: player } = await admin
    .from('tournament_players')
    .select('id')
    .eq('id', playerId)
    .eq('tournament_id', tournamentId)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const { error: elimError } = await admin
    .from('tournament_players')
    .update({ is_eliminated: true, eliminated_at: new Date().toISOString() })
    .eq('id', playerId)
  if (elimError) {
    return NextResponse.json(
      { error: internalErrorMessage('tournaments/code/remove-player', elimError) },
      { status: 500 }
    )
  }

  // Head-to-head: resolve the removed player's current match so the round can move on.
  if (tournament.format === 'head-to-head') {
    const { data: rows } = await admin
      .from('tournament_games')
      .select('id, game_id, round_number, player_a_id, player_b_id, winner_player_id, status, is_bye')
      .eq('tournament_id', tournamentId)

    const roundNums = (rows ?? []).map((r) => r.round_number ?? 0)
    const currentRound = roundNums.length ? Math.max(...roundNums) : 0
    const match = (rows ?? []).find(
      (r) => r.round_number === currentRound && !r.is_bye && (r.player_a_id === playerId || r.player_b_id === playerId)
    )

    if (match) {
      const opponentId = match.player_a_id === playerId ? match.player_b_id : match.player_a_id
      // (Re)resolve only if the match isn't decided, or the removed player was its
      // winner (e.g. the host is now removing the second of two no-shows).
      const needsResolve = match.status !== 'finished' || match.winner_player_id === playerId
      if (needsResolve) {
        let opponentEliminated = true
        if (opponentId) {
          const { data: opp } = await admin
            .from('tournament_players')
            .select('is_eliminated')
            .eq('id', opponentId)
            .maybeSingle()
          opponentEliminated = opp?.is_eliminated ?? true
        }
        const winner = opponentId && !opponentEliminated ? opponentId : null
        await admin.from('tournament_games').update({ status: 'finished', winner_player_id: winner }).eq('id', match.id)
        // End the (staged or live) match room so it doesn't linger.
        if (match.game_id) await admin.from('games').update({ status: 'finished' }).eq('id', match.game_id)
      }
    }
  }

  // One player left standing → champion; end the tournament.
  const { count } = await admin
    .from('tournament_players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('is_eliminated', false)
  if (count != null && count <= 1) {
    await admin.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)
  }

  return NextResponse.json({ ok: true })
}
