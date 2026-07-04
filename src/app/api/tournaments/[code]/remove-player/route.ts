import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { removeTournamentPlayerSchema } from '@/lib/tournament-validation'
import { resolveGroupSize } from '@/lib/tournament-bracket'
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
    .select('host_token, format, status, elimination_config, game_type, game_config')
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

  const groupSize = resolveGroupSize(tournament.game_config, tournament.game_type)

  // Group/room formats (Whot/Scrabble bracket rooms, and School class rooms):
  // removing one member of a larger room doesn't void it — the rest still play. Only
  // step in if the room is now down to one live member (walkover) or none (void);
  // otherwise leave the room to finish normally. Resolving here means a no-show
  // removal instantly clears a room that can no longer field two players, so the
  // round is never left blocked by a `pending` room that will never start.
  if ((tournament.format === 'head-to-head' && groupSize > 2) || tournament.format === 'school') {
    const { data: rows } = await admin
      .from('tournament_games')
      .select('id, game_id, round_number, member_ids, winner_player_id, status, is_bye')
      .eq('tournament_id', tournamentId)

    const roundNums = (rows ?? []).map((r) => r.round_number ?? 0)
    const currentRound = roundNums.length ? Math.max(...roundNums) : 0
    const room = (rows ?? []).find(
      (r) => r.round_number === currentRound && !r.is_bye && ((r.member_ids ?? []) as string[]).includes(playerId)
    )

    if (room && (room.status !== 'finished' || room.winner_player_id === playerId)) {
      const memberIds = ((room.member_ids ?? []) as string[]).filter(Boolean)
      const { data: memRows } = await admin
        .from('tournament_players')
        .select('id, is_eliminated')
        .in('id', memberIds.length ? memberIds : ['__none__'])
      const remaining = (memRows ?? []).filter((m) => !m.is_eliminated).map((m) => m.id)
      // >= 2 live members → the game continues untouched. <= 1 → resolve now.
      if (remaining.length <= 1) {
        const winner = remaining.length === 1 ? remaining[0] : null
        await admin
          .from('tournament_games')
          .update({ status: 'finished', winner_player_id: winner, win_reason: winner ? 'walkover' : null })
          .eq('id', room.id)
        if (room.game_id) await admin.from('games').update({ status: 'finished' }).eq('id', room.game_id)
      }
    }
  } else if (tournament.format === 'head-to-head') {
    // Chess (1v1): resolve the removed player's current match so the round can move on.
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
        await admin
          .from('tournament_games')
          .update({ status: 'finished', winner_player_id: winner, win_reason: winner ? 'walkover' : null })
          .eq('id', match.id)
        // End the (staged or live) match room so it doesn't linger.
        if (match.game_id) await admin.from('games').update({ status: 'finished' }).eq('id', match.game_id)
      }
    }
  }

  // End on last-survivor only where elimination decides the winner — a bracket
  // (head-to-head / knockout) or round-robin in lives mode. Plain round-robin ends
  // by points/target, so removing players there must not finish it.
  const eliminationDecides = tournament.format !== 'round-robin' || tournament.elimination_config != null
  if (eliminationDecides) {
    const { count } = await admin
      .from('tournament_players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('is_eliminated', false)
    if (count != null && count <= 1) {
      await admin.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)
    }
  }

  return NextResponse.json({ ok: true })
}
