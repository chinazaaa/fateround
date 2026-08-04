import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Snake & Ladder per-game facts, derived at finish from
 * `snake_ladder_player_state.game_counters` (accumulated in-play by processSnakeAndLadderRoll)
 * and `snake_ladder_sessions.winner_player_id`.
 */

type Counters = {
  rolls?: number
  sixes_rolled?: number
  consecutive_sixes_max?: number
  ladders_taken?: number
  snakes_hit?: number
  overshoots?: number
  busts?: number
  longest_ladder?: number
  reached_50?: number
}

type PlayerStateRow = {
  player_id: string
  game_counters: Counters
}

const LONGEST_LADDER_DISTANCE = 84 - 28 // 28 → 84

export async function snakeAndLadderFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data: statesData } = await supabase
    .from('snake_ladder_player_state')
    .select('player_id, game_counters')
    .eq('game_id', gameId)

  const states = (statesData ?? []) as PlayerStateRow[]
  if (!states.length) return out

  const seats = ctx.seated.length
  const winners = new Set(ctx.winners)

  for (const row of states) {
    const c = row.game_counters ?? {}
    const facts: Record<string, number> = {}
    const isWinner = winners.has(row.player_id)

    // Lifetime tallies
    if ((c.ladders_taken ?? 0) > 0) facts.snl_ladders_taken = c.ladders_taken!
    if ((c.snakes_hit ?? 0) > 0) facts.snl_snakes_hit = c.snakes_hit!
    if ((c.sixes_rolled ?? 0) > 0) facts.snl_sixes_rolled = c.sixes_rolled!
    if ((c.overshoots ?? 0) > 0) facts.snl_overshoots = c.overshoots!

    // Per-game flags
    if (c.reached_50) facts.snl_reached_50_games = 1
    if ((c.consecutive_sixes_max ?? 0) >= 2) facts.snl_double_six_games = 1
    if ((c.longest_ladder ?? 0) >= LONGEST_LADDER_DISTANCE) facts.snl_long_climb_games = 1
    if ((c.ladders_taken ?? 0) >= 4) facts.snl_four_ladder_games = 1
    if ((c.busts ?? 0) > 0) facts.snl_bust_games = 1

    // Win-gated flags
    if (isWinner) {
      if ((c.snakes_hit ?? 0) === 0) facts.snl_snake_free_wins = 1
      if (seats >= 6) facts.snl_full_table_wins = 1
      if ((c.rolls ?? 0) > 0 && c.rolls! <= 20) facts.snl_straight_run_wins = 1
    }

    if (Object.keys(facts).length) out.set(row.player_id, facts)
  }

  return out
}
