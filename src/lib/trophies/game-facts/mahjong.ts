import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Mahjong's per-game facts, folded at finish from the in-play accumulator the engine kept.
 *
 * Mahjong is the hardest per-game case on the stack. A match is MANY hands, and
 * `processMahjongNextHand` (src/lib/mahjong.ts) WIPES per-hand state every hand — melds, the
 * session winner, the score summary, the seat all reset as the next hand is dealt. So unlike
 * Chess (replay the PGN) or Yahtzee (read the final scorecard) there is nothing left at finish to
 * derive a hand's events from. The engine therefore tallies them AS THEY HAPPEN into
 * `mahjong_player_state.game_counters` — a per-MATCH scratch blob that is DELIBERATELY preserved
 * across the per-hand wipe (see migration 20260812030000 and src/lib/mahjong-hand-resolution.ts).
 * This builder reads that blob as "what happened across the whole match" and turns it into trophy
 * counters. It is served through the service-role client (the award pass), which is the only
 * reader of this server-only table.
 *
 * TWO KINDS OF COUNTER. `bump_player_stats` SUMS every counter into a lifetime total, so:
 *  - lifetime tallies (Kongs called, hands won, thirteen-orphans wins) are emitted as this
 *    match's raw count and accumulate correctly across matches — which is what "win TWO thirteen
 *    orphans hands" (a gte-2 rule) needs;
 *  - per-match achievements that cannot be a simple sum — "played from all four seats", "won
 *    three hands in a row" — are emitted as a 0/1 flag derived here from internal, NEVER-summed
 *    bookkeeping fields (`mahjong_seat_mask`, `mahjong_win_streak_max`). A bitmask or a streak
 *    high-water mark must never be emitted raw or it would sum into nonsense across matches.
 *
 * THE MATCH WINNER IS NOT NEEDED HERE. Almost every Mahjong trophy is about a HAND (a match has
 * many), counted in play, so this builder mostly just reads the blob — `ctx.winners` (the match
 * leader by cumulative score) is not consulted. That keeps the derivation self-contained.
 *
 * ONCE PER ROUND. One query returns every player's row; each player's facts come from their own
 * blob alone. A player with no state row simply gets no map entry, which is not an error.
 */

/** Raw lifetime tallies: emitted as this match's count and summed across matches. */
const TALLY_KEYS = [
  'mahjong_discards',
  'mahjong_chows_called',
  'mahjong_pungs_called',
  'mahjong_kongs_called',
  'mahjong_concealed_kongs',
  'mahjong_added_kongs',
  'mahjong_hands_as_east',
  'mahjong_exhaustive_draws_seen',
  'mahjong_hands_won',
  'mahjong_seven_pairs_wins',
  'mahjong_thirteen_orphans_wins',
  'mahjong_self_draw_wins',
  'mahjong_concealed_wins',
  'mahjong_no_call_wins',
  'mahjong_won_fate_round',
  'mahjong_won_hong_kong',
  'mahjong_won_riichi',
  'mahjong_won_mcr',
  'mahjong_triple_meld',
  'mahjong_four_melds',
  'mahjong_double_kong',
  'mahjong_grand_slam',
  'mahjong_quick_hand',
  'mahjong_high_fan',
  'mahjong_heavenly_hand',
] as const

/** All four seat bits set (east|south|west|north) == played a hand from every position. */
const ALL_SEATS_MASK = 0b1111

type StateRow = {
  player_id: string
  game_counters: Record<string, number> | null
}

export async function mahjongFacts(
  supabase: SupabaseClient,
  gameId: string,
  _ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data } = await supabase.from('mahjong_player_state').select('player_id, game_counters').eq('game_id', gameId)

  const rows = (data ?? []) as StateRow[]

  for (const row of rows) {
    const c = row.game_counters ?? {}
    const facts: Record<string, number> = {}

    // ── Lifetime tallies (this match's raw count; summed across matches) ─────────────────────
    for (const key of TALLY_KEYS) {
      const value = c[key] ?? 0
      if (value > 0) facts[key] = value
    }

    // ── Per-match flags derived from never-summed bookkeeping ────────────────────────────────
    // Full Circle: the seat bitmask this match has all four bits set.
    if (((c.mahjong_seat_mask ?? 0) & ALL_SEATS_MASK) === ALL_SEATS_MASK) facts.mahjong_all_seats = 1
    // Table Sweep: the longest run of consecutive hand wins this match reached three.
    if ((c.mahjong_win_streak_max ?? 0) >= 3) facts.mahjong_table_sweep = 1

    // A player who did nothing recordable simply gets no entry — a missing entry is not an error.
    if (Object.keys(facts).length > 0) out.set(row.player_id, facts)
  }

  return out
}
