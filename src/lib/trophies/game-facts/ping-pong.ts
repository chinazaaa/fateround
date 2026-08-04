import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Ping Pong per-game facts, derived at finish from `ping_pong_sessions`.
 *
 * Only cumulative scores and the winner are persisted — no rally data, no point-by-point history.
 * Facts are therefore limited to score-based achievements: shutouts, close games, match lengths.
 */

type SessionRow = {
  player_x_id: string
  player_o_id: string
  score_x: number
  score_o: number
  points_to_win: number
  winner_player_id: string | null
}

export async function pingPongFacts(
  supabase: SupabaseClient,
  gameId: string,
  _ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data } = await supabase
    .from('ping_pong_sessions')
    .select('player_x_id, player_o_id, score_x, score_o, points_to_win, winner_player_id')
    .eq('game_id', gameId)
    .maybeSingle()

  if (!data) return out
  const s = data as SessionRow

  const players = [
    { id: s.player_x_id, myScore: s.score_x, oppScore: s.score_o },
    { id: s.player_o_id, myScore: s.score_o, oppScore: s.score_x },
  ]

  for (const p of players) {
    const facts: Record<string, number> = {}
    const won = s.winner_player_id === p.id

    // Match length variants
    if (s.points_to_win === 3) facts.ping_pong_match_to_3 = 1
    if (s.points_to_win === 21) facts.ping_pong_match_to_21 = 1

    if (won) {
      facts.ping_pong_match_wins = 1

      // Shutout: opponent scored 0
      if (p.oppScore === 0) facts.ping_pong_shutout_wins = 1

      // Deuce: the match went past the target (win-by-2 rule kicked in).
      // This happens when both scores exceed points_to_win - 1.
      const wentToDeuce = p.myScore > s.points_to_win || p.oppScore >= s.points_to_win - 1
      if (wentToDeuce && p.oppScore >= s.points_to_win - 1) facts.ping_pong_deuce_wins = 1

      // Comeback: won despite opponent having scored more than half the target.
      // A meaningful comeback = opponent was within 5 points of winning.
      if (p.oppScore >= s.points_to_win - 5 && p.oppScore > 0) facts.ping_pong_comeback_wins = 1
    }

    if (Object.keys(facts).length) out.set(p.id, facts)
  }

  return out
}
