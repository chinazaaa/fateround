import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Crazy Eights' per-game facts, read at finish from the in-play accumulator the engine folded
 * forward on every turn.
 *
 * WHY AN ACCUMULATOR AND NOT A DERIVATION. Crazy Eights is a POSITION game — the session holds
 * only the current top card and the piles, each hand holds only the cards a player is holding
 * RIGHT NOW, and a finished hand is empty. None of "played three 8s", "drew ten cards", "changed
 * the suit three times", "played four spades in a row" survives to the end the way Chess's full
 * PGN or Yahtzee's whole scorecard does. So the engine counts these as they happen, inside the
 * atomic hand write it already does once it wins the turn's session CAS (see
 * `foldPlayStats`/`foldDrawStats`/`foldChooseStats` in src/lib/crazy-eights.ts), and stashes them
 * on `crazy_eights_player_hands.stats`. This builder is the read side: it turns that raw bag into
 * the counters the trophies name. It touches no gameplay route and adds no live tracking.
 *
 * WHY FLAGS AND NOT VALUES (mostly). Counters are lifetime sums (`bump_player_stats` adds deltas)
 * and the rule DSL only asks `counter >= n`, so a per-game achievement ("drew 5 cards in a game")
 * cannot be a value — summed across games it is nonsense. Each such achievement is a 0/1 flag
 * counted once, and the rule reads `>= 1`. A handful of counters ARE genuine lifetime tallies —
 * cards a player has ever played of a kind (`c8_eights_played`, `c8_pick_twos_played`, …) — and
 * those are emitted as the round's real total, which sums correctly.
 *
 * ONCE PER ROUND. Every player's bag is read in one query and each is judged on its own row; the
 * result is keyed by player id, and a player with an empty bag simply gets no entry. Wins are the
 * only cross-cutting input and they come from `ctx.winners`, never from re-reading the session.
 *
 * A NOTE ON `ctx.winners`. Empty means "a draw OR the winner is unknown" — never "everyone lost".
 * So a win flag is only ever emitted for a player the context names as a winner; absence from it
 * withholds the win flags and asserts nothing.
 */

/** The raw accumulator the engine writes (src/lib/crazy-eights.ts). Every key is optional. */
type RoundStats = {
  c8_turns_taken?: number
  c8_cards_drawn?: number
  c8_pick_twos_received?: number
  c8_peak_hand_size?: number
  c8_suit_changes?: number
  c8_eights_played?: number
  c8_jokers_played?: number
  c8_pick_twos_played?: number
  c8_pick_twos_stacked?: number
  c8_skips_played?: number
  c8_reverses_played?: number
  c8_suits_mask?: number
  c8_max_suit_run?: number
  c8_max_rank_run?: number
  c8_out_rank?: number
  c8_out_joker?: number
}

type HandRow = { player_id: string; stats: RoundStats | null }

/** All four suit bits set: the player has played a card of every suit this game. */
const ALL_SUITS_MASK = 1 | 2 | 4 | 8

/** #6 Suit Yourself: name a suit three times in one game. */
const SUIT_CHANGES_TARGET = 3
/** #7 To the Pile: draw five cards in one game. */
const DRAW_TARGET = 5
/** #9 Eight Ball: play three 8s in one game. */
const EIGHTS_TARGET = 3
/** #11 Suit Run: four same-suit plays in a row. */
const SUIT_RUN_TARGET = 4
/** #12 Rank Run: three same-rank plays in a row. */
const RANK_RUN_TARGET = 3
/** #17 Skip to the End: play three Skips in one game. */
const SKIPS_TARGET = 3
/** #18 Round Trip: play two Queens in one game. */
const REVERSES_TARGET = 2
/** #13 Quickfire: win in eight turns or fewer. */
const QUICKFIRE_TURNS = 8
/** #14 Survivor: draw ten-plus and still win. */
const SURVIVOR_DRAWS = 10
/** #21 Comeback: win having held twelve-plus cards at some point. */
const COMEBACK_PEAK = 12
/** #22 Full Table: win a six-player game. */
const FULL_TABLE_SEATS = 6
/** #19 Untouched / #27 Flawless are gated to real multiplayer (the brief's 3+). */
const MULTIPLAYER_MIN = 3

export async function crazyEightsFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data } = await supabase.from('crazy_eights_player_hands').select('player_id, stats').eq('game_id', gameId)
  const rows = (data ?? []) as HandRow[]

  for (const row of rows) {
    const facts = playerFacts(row.stats ?? {}, ctx, ctx.winners.includes(row.player_id))
    // Only players we have something to say about; an all-zero bag is no entry.
    if (Object.keys(facts).length > 0) out.set(row.player_id, facts)
  }

  return out
}

/** One player's counters, from that player's own accumulator plus whether they won. */
function playerFacts(stats: RoundStats, ctx: FactsContext, won: boolean): Record<string, number> {
  const facts: Record<string, number> = {}

  const turns = stats.c8_turns_taken ?? 0
  const drawn = stats.c8_cards_drawn ?? 0
  const peak = stats.c8_peak_hand_size ?? 0
  const suitChanges = stats.c8_suit_changes ?? 0
  const eights = stats.c8_eights_played ?? 0
  const jokers = stats.c8_jokers_played ?? 0
  const pickTwos = stats.c8_pick_twos_played ?? 0
  const stacks = stats.c8_pick_twos_stacked ?? 0
  const skips = stats.c8_skips_played ?? 0
  const reverses = stats.c8_reverses_played ?? 0
  const mask = stats.c8_suits_mask ?? 0
  const allSuits = mask === ALL_SUITS_MASK
  const seats = ctx.seated.length

  // ── Lifetime tallies (sum correctly across games) ─────────────────────────────────────────
  // Cards this player played of each kind this round. A trophy over any of these reads `>= 1`
  // for "did it once ever" (or a higher `gte` for a milestone).
  if (eights > 0) facts.c8_eights_played = eights
  if (pickTwos > 0) facts.c8_pick_twos_played = pickTwos
  if (skips > 0) facts.c8_skips_played = skips
  if (reverses > 0) facts.c8_reverses_played = reverses
  if (jokers > 0) facts.c8_jokers_played = jokers
  if (stacks > 0) facts.c8_pick_twos_stacked = stacks
  if (drawn > 0) facts.c8_cards_drawn = drawn

  // ── Per-game flags (0/1, counted once) ────────────────────────────────────────────────────
  if (suitChanges >= SUIT_CHANGES_TARGET) facts.c8_suit_changes_3_games = 1
  if (drawn >= DRAW_TARGET) facts.c8_drew_5_games = 1
  if (eights >= EIGHTS_TARGET) facts.c8_three_eights_games = 1
  if ((stats.c8_max_suit_run ?? 0) >= SUIT_RUN_TARGET) facts.c8_suit_run_4_games = 1
  if ((stats.c8_max_rank_run ?? 0) >= RANK_RUN_TARGET) facts.c8_rank_run_3_games = 1
  if (allSuits) facts.c8_all_suits_games = 1
  if (skips >= SKIPS_TARGET) facts.c8_three_skips_games = 1
  if (reverses >= REVERSES_TARGET) facts.c8_two_queens_games = 1
  // #19 Untouched: finished a real multiplayer game without ever taking a Pick Two. Gated to a
  // player who actually took a turn (an empty bag never reaches here).
  if (seats >= MULTIPLAYER_MIN && (stats.c8_pick_twos_received ?? 0) === 0 && turns > 0) {
    facts.c8_no_pick_two_games = 1
  }

  // ── Win flags (only ever emitted for a named winner) ──────────────────────────────────────
  if (won) {
    if (turns > 0 && turns <= QUICKFIRE_TURNS) facts.c8_quickfire_wins = 1
    if (drawn >= SURVIVOR_DRAWS) facts.c8_survivor_wins = 1
    if (peak >= COMEBACK_PEAK) facts.c8_comeback_wins = 1
    if (seats >= FULL_TABLE_SEATS) facts.c8_full_table_wins = 1
    if (allSuits && eights > 0) facts.c8_suit_master_wins = 1
    if (allSuits && eights > 0 && jokers > 0) facts.c8_suit_sweep_wins = 1
    if (drawn === 0 && seats >= MULTIPLAYER_MIN) facts.c8_flawless_wins = 1
    // Won by playing the last card. `c8_out_*` is set only when a play emptied the hand, so a
    // timed lowest-hand win (which leaves cards in hand) never trips these.
    if (stats.c8_out_rank === 8) facts.c8_eight_finish_wins = 1
    if (stats.c8_out_joker === 1) facts.c8_joker_finish_wins = 1
  }

  return facts
}
