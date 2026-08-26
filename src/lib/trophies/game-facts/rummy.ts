import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'
import type { RummyMeld } from '@/types'

/**
 * Rummy's per-game facts, derived at finish from `rummy_sessions.winning_melds` and the
 * hand rows. No live accumulator: the engine keeps only the current draw/discard piles
 * and each player's current hand, and the finishing move persists the winner's lay-down
 * as `winning_melds` — everything we need for winner-side trophies is on that row.
 *
 * OMISSIONS (documented here per the checklist convention). We do NOT track per-round:
 *  - turns taken / cards drawn / cards drawn from discard — no stats column persists them,
 *    so a "drew ten cards and still won" trophy would silently score zero forever.
 *  - which card the winner discarded to close (or whether they went out with none — the
 *    "true Rummy" bonus). Adding a column is Phase-4 material.
 * If those trophies are wanted later, add a `stats jsonb` column to `rummy_player_hands`
 * and fold small counters forward inside processRummyDraw / Discard / GoOut.
 *
 * All emitted keys are registered in `src/lib/trophies/counters.ts` — an unregistered
 * key cannot save on a rule and silently reads as zero forever.
 */

const LONG_MELD_THRESHOLD = 5
const BIG_TABLE_SEATS = 4

type SessionRow = { winner_player_id: string | null; winning_melds: RummyMeld[] | null }

export async function rummyFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data } = await supabase
    .from('rummy_sessions')
    .select('winner_player_id, winning_melds')
    .eq('game_id', gameId)
    .maybeSingle()
  const session = (data as SessionRow | null) ?? null
  const winnerId = session?.winner_player_id ?? null
  const melds = (session?.winning_melds ?? []) as RummyMeld[]

  // A recognised Rummy winner produces facts. Meld-shape flags require `winning_melds`
  // (only a lay-down produces them; a timeout win crowned by "closest to going out"
  // has no melds), but the table-size flag depends only on the seated roster — so it
  // fires for a timeout winner too.
  if (!winnerId || !ctx.winners.includes(winnerId)) return out

  const facts: Record<string, number> = {}
  if (ctx.seated.length >= BIG_TABLE_SEATS) facts.rummy_big_table_wins = 1

  if (melds.length === 0) {
    // Timeout winner — no lay-down to inspect. Emit only the seat-count fact.
    out.set(winnerId, facts)
    return out
  }

  // Lifetime tally — sums correctly across games.
  facts.rummy_melds_laid = melds.length

  // Per-game flags (0/1, counted once).
  const hasRun = melds.some((m) => m.kind === 'run')
  const hasSet = melds.some((m) => m.kind === 'set')
  const longestMeld = melds.reduce((m, x) => Math.max(m, x.cards.length), 0)

  if (hasRun) facts.rummy_run_wins = 1
  if (hasSet) facts.rummy_set_wins = 1
  if (hasRun && hasSet) facts.rummy_mixed_bag_wins = 1
  if (longestMeld >= LONG_MELD_THRESHOLD) facts.rummy_long_meld_wins = 1
  if (melds.length === 1) facts.rummy_solo_meld_wins = 1
  // Won with only one kind of meld — pure-runs or pure-sets. Awards a bit of style.
  if (melds.length >= 2 && hasRun && !hasSet) facts.rummy_pure_run_wins = 1
  if (melds.length >= 2 && hasSet && !hasRun) facts.rummy_pure_set_wins = 1

  out.set(winnerId, facts)
  return out
}
