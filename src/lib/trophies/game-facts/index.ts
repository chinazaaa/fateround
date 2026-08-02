import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameType } from '@/types'
import { triviaFacts } from './trivia'

/**
 * Per-game facts for the award pass.
 *
 * The award pass used to emit only two things every game type shared (`big_room_games`,
 * `late_night_games`). Anything a trophy wanted to know ABOUT a game — how many questions you
 * got right, whether you led from the first round — had nowhere to come from. This is that
 * hook: one function per game type, returning the integer facts for one player in one finished
 * game, folded into `player_stats.counters` alongside the shared ones.
 *
 * RULES FOR A FACTS BUILDER:
 *  - It must be TOTAL. A finished game is being recorded; a builder that throws would lose the
 *    player's `games_played` too. Every builder is wrapped below and falls back to `{}`.
 *  - It must return LIFETIME-SUMMABLE integers. Counters accumulate, so per-game achievements
 *    are 0/1 flags counted once ("did it in a game"), never in-game values like a best streak.
 *  - It reads only PERSISTED state. It runs after the game is over; there is nothing live left.
 *
 * Games absent from the map simply contribute no facts, which is the correct behaviour for one
 * that hasn't been built yet — no error, no invented data.
 */

export type FactsContext = {
  timerSeconds: number | null
  questionSource: string | null
  won: boolean
  seated: number
}

type FactsBuilder = (
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  ctx: FactsContext
) => Promise<Record<string, number>>

const BUILDERS: Partial<Record<GameType, FactsBuilder>> = {
  trivia: triviaFacts,
}

/** True when this game type emits per-game facts, for the admin UI's benefit. */
export function hasGameFacts(gameType: GameType): boolean {
  return Boolean(BUILDERS[gameType])
}

export async function buildGameFacts(
  supabase: SupabaseClient,
  gameType: GameType,
  gameId: string,
  playerId: string,
  ctx: FactsContext
): Promise<Record<string, number>> {
  const builder = BUILDERS[gameType]
  if (!builder) return {}
  try {
    return await builder(supabase, gameId, playerId, ctx)
  } catch {
    // A fact we couldn't derive is a missing trophy; a throw here would cost the player the
    // whole finished game. Losing the extras is always the better failure.
    return {}
  }
}
