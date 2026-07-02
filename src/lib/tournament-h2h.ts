import type { SupabaseClient } from '@supabase/supabase-js'
import { initializeChessGame } from '@/lib/chess'
import { resolveGroupSize } from '@/lib/tournament-bracket'

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
    .select('id, tournament_id, player_a_id, player_b_id, member_ids, status, is_bye')
    .eq('game_id', gameId)
    .maybeSingle()
  if (!match || match.is_bye || match.status === 'finished') return

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format, status, game_type, game_config')
    .eq('id', match.tournament_id)
    .maybeSingle()
  if (!tournament || tournament.format !== 'head-to-head' || tournament.status === 'finished') return

  // Group bracket (Whot/Scrabble, rooms of 4): the room's single winner advances
  // and the rest are eliminated — a different resolution from the chess duel below.
  const groupSize = resolveGroupSize(tournament.game_config, tournament.game_type)
  if (groupSize > 2) {
    await resolveGroupRoom(supabase, match, tournament.game_type, gameId)
    return
  }

  const { data: session } = await supabase
    .from('chess_sessions')
    .select('winner_player_id, is_draw, player_white_id, player_black_id, result_reason')
    .eq('game_id', gameId)
    .maybeSingle()
  if (!session) return

  // Draw → auto-rematch in the same room; the pairing replays until decisive.
  if (session.is_draw || !session.winner_player_id) {
    if (session.is_draw && session.player_white_id && session.player_black_id) {
      const { error: rematchError } = await initializeChessGame(supabase, gameId, [
        session.player_white_id,
        session.player_black_id,
      ])
      // Only reopen the room once the fresh session is in place; otherwise the
      // game would read "active" while its session is still the finished draw.
      if (!rematchError) {
        await supabase.from('games').update({ status: 'active', finished_at: null }).eq('id', gameId)
      }
    }
    return
  }

  // Map the winning chess player (a players.id) to its tournament player by name.
  // tournament_players enforces unique (tournament_id, player_name), so a name is
  // unambiguous across a match's two rostered players.
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

  // Record the result, winning the active→finished race. Only the request that
  // actually flips the row goes on to eliminate the loser and check for a
  // champion, so a lost CAS (or failed update) can't half-resolve the match.
  const { data: claimed, error: claimError } = await supabase
    .from('tournament_games')
    .update({ status: 'finished', winner_player_id: winnerTP.id, win_reason: session.result_reason ?? null })
    .eq('id', match.id)
    .neq('status', 'finished')
    .select('id')
  if (claimError || !claimed?.length) return

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

interface GroupMatchRow {
  id: string
  tournament_id: string
  member_ids: string[] | null
}

/**
 * The single winning game-player id (a players.id) of a finished Whot/Scrabble
 * room. Whot always names a winner (first to empty, tiebroken by hand). Scrabble
 * names one too, except on an exact score tie — which we break deterministically
 * here (highest final score, then earliest seat) so a room always yields exactly
 * one advancer rather than stalling.
 */
async function groupGameWinner(
  supabase: SupabaseClient,
  gameType: string | null,
  gameId: string
): Promise<string | null> {
  if (gameType === 'whot') {
    const { data } = await supabase.from('whot_sessions').select('winner_player_id').eq('game_id', gameId).maybeSingle()
    return data?.winner_player_id ?? null
  }
  if (gameType === 'scrabble') {
    const { data } = await supabase
      .from('scrabble_sessions')
      .select('winner_player_id')
      .eq('game_id', gameId)
      .maybeSingle()
    if (data?.winner_player_id) return data.winner_player_id
    // Tie (no single winner recorded): rank by the final penalised score (written
    // back into `score` when the game finalises), then earliest seat, and pick one.
    const { data: states } = await supabase
      .from('scrabble_player_state')
      .select('player_id, score, player_order')
      .eq('game_id', gameId)
    const ranked = [...(states ?? [])].sort((a, b) => {
      const as = (a.score ?? 0) as number
      const bs = (b.score ?? 0) as number
      if (bs !== as) return bs - as
      return ((a.player_order ?? 0) as number) - ((b.player_order ?? 0) as number)
    })
    return (ranked[0]?.player_id as string | undefined) ?? null
  }
  return null
}

/**
 * Resolve a finished group-bracket room: the winner advances, every other seated
 * (and no-show) member is eliminated, and the tournament ends once one survivor
 * remains. Idempotent via the same active→finished CAS the chess path uses.
 */
async function resolveGroupRoom(
  supabase: SupabaseClient,
  match: GroupMatchRow,
  gameType: string | null,
  gameId: string
): Promise<void> {
  const winnerGamePlayerId = await groupGameWinner(supabase, gameType, gameId)
  if (!winnerGamePlayerId) return // undecided — leave the room for the host to sort out

  // Map the winning game player to its tournament roster slot by name (unique per
  // tournament), restricted to this room's members.
  const { data: winnerRow } = await supabase.from('players').select('name').eq('id', winnerGamePlayerId).maybeSingle()
  const winnerName = winnerRow?.name?.toLowerCase() ?? null

  const memberIds = (match.member_ids ?? []).filter((id): id is string => Boolean(id))
  const { data: tps } = await supabase
    .from('tournament_players')
    .select('id, player_name')
    .in('id', memberIds.length ? memberIds : ['__none__'])
  const roster = tps ?? []
  const winnerTP = roster.find((p) => p.player_name.toLowerCase() === winnerName)
  if (!winnerTP) return // couldn't map the winner — don't eliminate the wrong people

  // Claim the room (winning the active→finished race); only the request that flips
  // the row goes on to eliminate the losers and check for a champion.
  const { data: claimed, error: claimError } = await supabase
    .from('tournament_games')
    .update({ status: 'finished', winner_player_id: winnerTP.id })
    .eq('id', match.id)
    .neq('status', 'finished')
    .select('id')
  if (claimError || !claimed?.length) return

  const loserIds = roster.filter((p) => p.id !== winnerTP.id).map((p) => p.id)
  if (loserIds.length) {
    await supabase
      .from('tournament_players')
      .update({ is_eliminated: true, eliminated_at: new Date().toISOString() })
      .in('id', loserIds)
  }

  const { count } = await supabase
    .from('tournament_players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', match.tournament_id)
    .eq('is_eliminated', false)
  if (count != null && count <= 1) {
    await supabase.from('tournaments').update({ status: 'finished' }).eq('id', match.tournament_id)
  }
}
