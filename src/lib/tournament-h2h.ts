import type { SupabaseClient } from '@supabase/supabase-js'
import { initializeChessGame } from '@/lib/chess'

/**
 * Resolve a finished head-to-head chess match: record the winner, eliminate the
 * loser, and finish the tournament once a single champion remains. A drawn match
 * auto-rematches in the same room (initializeChessGame swaps colors) so the
 * pairing replays until it's decisive.
 *
 * Called from markGameFinished, so every chess finish path — checkmate, timeout,
 * resignation, forfeit — funnels through here. It's a no-op (one small lookup)
 * for games that aren't part of a head-to-head bracket, and idempotent if a
 * match somehow resolves twice.
 */
export async function resolveHeadToHeadMatch(supabase: SupabaseClient, gameId: string): Promise<void> {
  const { data: match } = await supabase
    .from('tournament_games')
    .select('id, tournament_id, player_a_id, player_b_id, status, is_bye')
    .eq('game_id', gameId)
    .maybeSingle()
  if (!match || match.is_bye || match.status === 'finished') return

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format, status')
    .eq('id', match.tournament_id)
    .maybeSingle()
  if (!tournament || tournament.format !== 'head-to-head' || tournament.status === 'finished') return

  const { data: session } = await supabase
    .from('chess_sessions')
    .select('winner_player_id, is_draw, player_white_id, player_black_id')
    .eq('game_id', gameId)
    .maybeSingle()
  if (!session) return

  // Draw → auto-rematch in the same room; the pairing replays until decisive.
  if (session.is_draw || !session.winner_player_id) {
    if (session.is_draw && session.player_white_id && session.player_black_id) {
      await initializeChessGame(supabase, gameId, [session.player_white_id, session.player_black_id])
      await supabase.from('games').update({ status: 'active', finished_at: null }).eq('id', gameId)
    }
    return
  }

  // Map the winning chess player (a players.id) to its tournament player by name.
  const { data: winnerRow } = await supabase
    .from('players')
    .select('name')
    .eq('id', session.winner_player_id)
    .maybeSingle()
  const winnerName = winnerRow?.name?.toLowerCase() ?? null

  const rosterIds = [match.player_a_id, match.player_b_id].filter((id): id is string => Boolean(id))
  const { data: tps } = await supabase.from('tournament_players').select('id, player_name').in('id', rosterIds)
  const roster = tps ?? []
  const winnerTP = roster.find((p) => p.player_name.toLowerCase() === winnerName)
  const loserTP = roster.find((p) => p.id !== winnerTP?.id)
  // Couldn't map the winner to a rostered player — leave the match unresolved
  // rather than eliminate the wrong person.
  if (!winnerTP) return

  await supabase
    .from('tournament_games')
    .update({ status: 'finished', winner_player_id: winnerTP.id })
    .eq('id', match.id)
    .neq('status', 'finished')

  if (loserTP) {
    await supabase
      .from('tournament_players')
      .update({ is_eliminated: true, eliminated_at: new Date().toISOString() })
      .eq('id', loserTP.id)
  }

  // Last player standing → champion; end the tournament.
  const { count } = await supabase
    .from('tournament_players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', match.tournament_id)
    .eq('is_eliminated', false)
  if (count != null && count <= 1) {
    await supabase.from('tournaments').update({ status: 'finished' }).eq('id', match.tournament_id)
  }
}
