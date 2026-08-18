import type { SupabaseClient } from '@supabase/supabase-js'
import type { WhotCard } from '@/types'
import { whotHandSum } from '@/lib/whot'
import type { FactsContext } from './index'

/**
 * Whot's per-game facts, read at finish from the in-play accumulator the engine folded forward on
 * every turn (see foldWhotPlayStats / foldWhotDrawStats / foldWhotChooseStats in src/lib/whot.ts).
 *
 * WHY AN ACCUMULATOR. Whot is a POSITION game — the session holds the top card and the piles, each
 * hand holds only what a player is holding right now, and a finished hand is empty. "Played three
 * Pick Twos", "went to market five times", "won on a WHOT" don't survive to the end, so the engine
 * counts them as they happen and stashes them on `whot_player_hands.stats`. This builder is the read
 * side. It touches no gameplay route and adds no live tracking.
 *
 * WHY FLAGS AND NOT VALUES (mostly). Counters are lifetime sums (`bump_player_stats` adds deltas)
 * and the rule DSL only asks `counter >= n`, so a per-game achievement ("drew five times in a game")
 * cannot be a summable value — it is a 0/1 flag counted once, and the rule reads `>= 1`. A handful
 * of counters ARE genuine lifetime tallies — cards of a kind a player has ever played
 * (`whot_pick_twos`, `whot_hold_ons`, …) — emitted as the round's real total, which sums correctly.
 *
 * ONCE PER ROUND. Every player's bag is read in one query and judged on its own row, keyed by player
 * id; an empty bag gets no entry. Wins come from `ctx.winners`, never from re-reading the session,
 * and an empty `ctx.winners` means "draw OR unknown" — never "everyone lost".
 */

/** The raw accumulator the engine writes (src/lib/whot.ts). Every key is optional. */
type RoundStats = {
  whot_turns_taken?: number
  whot_market_visits?: number
  whot_cards_drawn?: number
  whot_penalty_hits?: number
  whot_penalty_cards?: number
  whot_peak_hand_size?: number
  whot_hold_ons?: number
  whot_pick_twos?: number
  whot_pick_twos_stacked?: number
  whot_pick_threes?: number
  whot_pick_threes_stacked?: number
  whot_suspensions?: number
  whot_general_markets?: number
  whot_cards_inflicted?: number
  whot_whots?: number
  whot_shape_calls?: number
  whot_shapes_mask?: number
  whot_max_shape_run?: number
  whot_max_holdon_run?: number
  whot_max_pick2_cards?: number
  whot_two_whots?: number
  whot_out_number?: number
  whot_out_star?: number
  whot_out_whot?: number
}

type HandRow = { player_id: string; stats: RoundStats | null; cards: WhotCard[] | null }

/** All five real shape bits set (circle|cross|triangle|square|star). The WHOT card sets no bit. */
const ALL_SHAPES_MASK = 1 | 2 | 4 | 8 | 16

/** #2 To Market: go to market five times in one game. */
const MARKET_VISITS_TARGET = 5
/** #11 Chain Gang: three Hold Ons in a single turn chain. */
const HOLDON_CHAIN_TARGET = 3
/** #12 Shape Lock: four same-shape plays in a row. */
const SHAPE_RUN_TARGET = 4
/** #13 Market Crash: play General Market twice in one game. */
const TWO_MARKETS_TARGET = 2
/** #18 Stack Attack: a Pick Two chain reaching three-plus twos (6 cards). */
const STACK_ATTACK_CARDS = 6
/** #14 Survivor: draw five-plus penalty cards and still win. */
const SURVIVOR_PENALTY = 5
/** #17 Fast Deal: win in ten turns or fewer. */
const FAST_TURNS = 10
/** #23 Comeback: win having held ten-plus cards at some point. */
const COMEBACK_PEAK = 10
/** #22 Full Table: win a six-player game. */
const FULL_TABLE_SEATS = 6
/** #25 Light Hand: win a blocked/timed game still holding five points or fewer. */
const LIGHT_HAND_POINTS = 5
/** #29 Market Forces: make opponents draw fifteen-plus cards (via General Market). */
const MARKET_FORCES_TARGET = 15
/** #19 Untouched / #27 Untouchable / #29 gated to real multiplayer (the brief's 3+). */
const MULTIPLAYER_MIN = 3

export async function whotFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data } = await supabase.from('whot_player_hands').select('player_id, stats, cards').eq('game_id', gameId)
  const rows = (data ?? []) as HandRow[]

  for (const row of rows) {
    const facts = playerFacts(row.stats ?? {}, row.cards ?? [], ctx, ctx.winners.includes(row.player_id))
    if (Object.keys(facts).length > 0) out.set(row.player_id, facts)
  }

  return out
}

/** One player's counters, from their own accumulator, their final hand, and whether they won. */
function playerFacts(
  stats: RoundStats,
  finalHand: WhotCard[],
  ctx: FactsContext,
  won: boolean
): Record<string, number> {
  const facts: Record<string, number> = {}

  const turns = stats.whot_turns_taken ?? 0
  const marketVisits = stats.whot_market_visits ?? 0
  const cardsDrawn = stats.whot_cards_drawn ?? 0
  const penaltyHits = stats.whot_penalty_hits ?? 0
  const penaltyCards = stats.whot_penalty_cards ?? 0
  const peak = stats.whot_peak_hand_size ?? 0
  const holdOns = stats.whot_hold_ons ?? 0
  const pickTwos = stats.whot_pick_twos ?? 0
  const pickTwosStacked = stats.whot_pick_twos_stacked ?? 0
  const pickThrees = stats.whot_pick_threes ?? 0
  const pickThreesStacked = stats.whot_pick_threes_stacked ?? 0
  const suspensions = stats.whot_suspensions ?? 0
  const generalMarkets = stats.whot_general_markets ?? 0
  const cardsInflicted = stats.whot_cards_inflicted ?? 0
  const shapeCalls = stats.whot_shape_calls ?? 0
  const allShapes = (stats.whot_shapes_mask ?? 0) === ALL_SHAPES_MASK
  const seats = ctx.seated.length

  // ── Lifetime tallies (sum correctly across games) ─────────────────────────────────────────
  if (pickTwos > 0) facts.whot_pick_twos = pickTwos
  if (shapeCalls > 0) facts.whot_shape_calls = shapeCalls
  if (holdOns > 0) facts.whot_hold_ons = holdOns
  if (suspensions > 0) facts.whot_suspensions = suspensions
  if (generalMarkets > 0) facts.whot_general_markets = generalMarkets
  if (pickThrees > 0) facts.whot_pick_threes = pickThrees
  if (pickTwosStacked > 0) facts.whot_pick_twos_stacked = pickTwosStacked
  if (pickThreesStacked > 0) facts.whot_pick_threes_stacked = pickThreesStacked

  // ── Per-game flags (0/1, counted once) ────────────────────────────────────────────────────
  if (marketVisits >= MARKET_VISITS_TARGET) facts.whot_market_visits_5_games = 1
  if ((stats.whot_max_holdon_run ?? 0) >= HOLDON_CHAIN_TARGET) facts.whot_holdon_chain_3_games = 1
  if ((stats.whot_max_shape_run ?? 0) >= SHAPE_RUN_TARGET) facts.whot_shape_run_4_games = 1
  if (generalMarkets >= TWO_MARKETS_TARGET) facts.whot_two_markets_games = 1
  if (stats.whot_two_whots === 1) facts.whot_two_whots_games = 1
  if ((stats.whot_max_pick2_cards ?? 0) >= STACK_ATTACK_CARDS) facts.whot_stack_attack_games = 1
  // #19 Untouched: finish a real multiplayer game never hit by a Pick Two or Pick Three. Gated to
  // a player who actually took a turn (an empty bag never reaches here).
  if (seats >= MULTIPLAYER_MIN && penaltyHits === 0 && turns > 0) facts.whot_untouched_games = 1
  if (pickTwos > 0 && pickThrees > 0 && generalMarkets > 0) facts.whot_no_mercy_games = 1
  if (seats >= MULTIPLAYER_MIN && cardsInflicted >= MARKET_FORCES_TARGET) facts.whot_market_forces_games = 1

  // ── Win flags (only ever emitted for a named winner) ──────────────────────────────────────
  if (won) {
    if (penaltyCards >= SURVIVOR_PENALTY) facts.whot_survivor_wins = 1
    if (turns > 0 && turns <= FAST_TURNS) facts.whot_fast_wins = 1
    if (allShapes) facts.whot_shape_master_wins = 1
    if (seats >= FULL_TABLE_SEATS) facts.whot_full_table_wins = 1
    if (peak >= COMEBACK_PEAK) facts.whot_comeback_wins = 1
    if (seats === 2 && marketVisits === 0) facts.whot_head_to_head_wins = 1
    if (cardsDrawn === 0 && seats >= MULTIPLAYER_MIN) facts.whot_untouchable_wins = 1
    // Won by playing the last card. `whot_out_*` is set only when a play emptied the hand, so a
    // timed lowest-hand win (which leaves cards in hand) never trips these.
    if (stats.whot_out_star === 1) facts.whot_star_finish_wins = 1
    if (stats.whot_out_whot === 1) facts.whot_wildcard_finish_wins = 1
    // #25 Light Hand: a blocked/timed win still holds cards; a normal empty-hand win holds none,
    // so `cardCount > 0` restricts this to the timed path (and never fires on an ordinary win).
    if (finalHand.length > 0 && whotHandSum(finalHand) <= LIGHT_HAND_POINTS) facts.whot_light_hand_wins = 1
    // #28 Naija Legend: win a game at each player count from 2 to 6. A distinct set keyed by the
    // room size, unioned in `player_distinct`; the trophy asks for five distinct members.
    facts[`distinct:whot_win_counts:${seats}`] = 1
  }

  return facts
}
