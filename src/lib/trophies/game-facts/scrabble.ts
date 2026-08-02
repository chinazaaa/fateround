import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Scrabble's per-game facts, read at finish from a mix of two things the game already persists:
 * the in-play accumulator the engine folds forward on every turn (`scrabble_player_state.stats`),
 * and the row's own final `score`/`rack`.
 *
 * WHY A SPLIT. Scrabble is a POSITION game — `scrabble_sessions.last_move` is overwritten every
 * turn and the final board keeps no per-play attribution — so most of what a trophy wants to know
 * (a bingo, a triple-word cover, a Q with no U, three words in one turn) does not survive to the
 * end and has to be counted as it happens (see `foldScrabblePlayStats` / `foldScrabbleScorelessStats`
 * in src/lib/scrabble.ts). But the pure score-total trophies (Half Century → Four Hundred) and the
 * empty-rack trophy ARE derivable at finish from the row the game already keeps, so they read
 * `score`/`rack` directly and cost the accumulator nothing.
 *
 * WHY FLAGS AND NOT VALUES. Counters are lifetime sums (`bump_player_stats` adds deltas) and the
 * rule DSL only asks `counter >= n`, so a per-game achievement ("scored 300 this game", "played
 * two bingos this game") cannot be a value — summed across games it is nonsense. Each is a 0/1
 * flag counted once and the rule reads `>= 1`.
 *
 * ONCE PER ROUND. Every player's row is read in one query and judged on its own state; the result
 * is keyed by player id. Wins are the only cross-cutting input and they come from `ctx.winners`.
 *
 * A NOTE ON `ctx.winners`. Empty means "a draw OR the winner is unknown" — never "everyone lost".
 * A win flag is only ever emitted for a player the context names as a winner; absence withholds
 * the win flags and asserts nothing.
 *
 * CLEAN RACK (#23). The audit flagged that an empty rack at finish is only reachable via the
 * go-out path: a player empties their rack by playing their last tile. Every other ending
 * (stalemate, the whole-game clock, chess-clock flag-outs, a host early-end) leaves tiles on
 * racks. So this trophy is, in practice, "you went out" — which is a legitimate, if narrow,
 * achievement, and is scored exactly as "finished with an empty rack".
 */

/** The raw accumulator the engine writes (src/lib/scrabble.ts). Every key is optional. */
type RoundStats = {
  scrabble_opening_move?: number
  scrabble_dl_covers?: number
  scrabble_tl_covers?: number
  scrabble_dw_covers?: number
  scrabble_tw_covers?: number
  scrabble_blanks_played?: number
  scrabble_bingos?: number
  scrabble_best_word?: number
  scrabble_max_word_len?: number
  scrabble_max_words?: number
  scrabble_hooks?: number
  scrabble_q_no_u?: number
  scrabble_high_value?: number
  scrabble_triple_triple?: number
  scrabble_max_deficit?: number
  scrabble_exchanges?: number
  scrabble_passes?: number
}

type StateRow = {
  player_id: string
  score: number | null
  rack: string[] | null
  stats: RoundStats | null
}

// ── Thresholds (the brief's) ────────────────────────────────────────────────────────────────
/** #8 / #15 / #22 / #28 — final-total milestones. */
const HALF_CENTURY = 50
const CENTURY = 200
const THREE_HUNDRED = 300
const FOUR_HUNDRED = 400
/** #11 / #20 / #29 — best single-word score. */
const BIG_PLAY = 40
const MONSTER_PLAY = 80
const CENTURY_WORD = 100
/** #14 — longest word. */
const LONG_WORD = 8
/** #24 — largest deficit faced by the eventual winner. */
const COMEBACK_DEFICIT = 60
/** #25 — Scrabble's full table is four. */
const FULL_TABLE_SEATS = 4

export async function scrabbleFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data } = await supabase
    .from('scrabble_player_state')
    .select('player_id, score, rack, stats')
    .eq('game_id', gameId)
  const rows = (data ?? []) as StateRow[]

  for (const row of rows) {
    const facts = playerFacts(row, ctx, ctx.winners.includes(row.player_id))
    // Only players we have something to say about; an unremarkable row is no entry.
    if (Object.keys(facts).length > 0) out.set(row.player_id, facts)
  }

  return out
}

/** One player's counters, from their accumulator + final score/rack + whether they won. */
function playerFacts(row: StateRow, ctx: FactsContext, won: boolean): Record<string, number> {
  const stats = row.stats ?? {}
  const facts: Record<string, number> = {}

  const bingos = stats.scrabble_bingos ?? 0
  const bestWord = stats.scrabble_best_word ?? 0
  const maxWords = stats.scrabble_max_words ?? 0
  const exchanges = stats.scrabble_exchanges ?? 0
  const passes = stats.scrabble_passes ?? 0

  // ── Placement & premium-square flags (from the accumulator) ────────────────────────────────
  if (stats.scrabble_opening_move) facts.scrabble_opening_move_games = 1
  if ((stats.scrabble_dl_covers ?? 0) > 0) facts.scrabble_double_letter_games = 1
  if ((stats.scrabble_tl_covers ?? 0) > 0) facts.scrabble_triple_letter_games = 1
  if ((stats.scrabble_dw_covers ?? 0) > 0) facts.scrabble_double_word_games = 1
  if ((stats.scrabble_tw_covers ?? 0) > 0) facts.scrabble_triple_word_games = 1
  if ((stats.scrabble_blanks_played ?? 0) > 0) facts.scrabble_blank_games = 1
  if (exchanges > 0) facts.scrabble_swap_games = 1
  if ((stats.scrabble_hooks ?? 0) > 0) facts.scrabble_hook_games = 1
  if (stats.scrabble_high_value) facts.scrabble_high_value_games = 1
  if (stats.scrabble_triple_triple) facts.scrabble_triple_triple_games = 1
  if (stats.scrabble_q_no_u) facts.scrabble_q_no_u_games = 1

  // ── Word-shape flags ───────────────────────────────────────────────────────────────────────
  if (maxWords >= 2) facts.scrabble_two_word_games = 1
  if (maxWords >= 3) facts.scrabble_parallel_games = 1
  if ((stats.scrabble_max_word_len ?? 0) >= LONG_WORD) facts.scrabble_long_word_games = 1

  // ── Bingos (one accumulator count, three per-game thresholds) ──────────────────────────────
  if (bingos >= 1) facts.scrabble_bingo_games = 1
  if (bingos >= 2) facts.scrabble_double_bingo_games = 1
  if (bingos >= 3) facts.scrabble_triple_bingo_games = 1

  // ── Best single-word score (three thresholds) ──────────────────────────────────────────────
  if (bestWord >= BIG_PLAY) facts.scrabble_big_play_games = 1
  if (bestWord >= MONSTER_PLAY) facts.scrabble_monster_play_games = 1
  if (bestWord >= CENTURY_WORD) facts.scrabble_century_word_games = 1

  // ── Final-total milestones (bucket A — from the persisted final score) ─────────────────────
  const score = row.score ?? 0
  if (score >= HALF_CENTURY) facts.scrabble_half_century_games = 1
  if (score >= CENTURY) facts.scrabble_century_games = 1
  if (score >= THREE_HUNDRED) facts.scrabble_three_hundred_games = 1
  if (score >= FOUR_HUNDRED) facts.scrabble_four_hundred_games = 1

  // ── Clean rack (bucket A — an empty rack at finish; see header) ────────────────────────────
  if ((row.rack?.length ?? 0) === 0) facts.scrabble_clean_rack_games = 1

  // ── Win flags (only ever emitted for a named winner) ───────────────────────────────────────
  if (won) {
    if ((stats.scrabble_max_deficit ?? 0) >= COMEBACK_DEFICIT) facts.scrabble_comeback_wins = 1
    if (ctx.seated.length >= FULL_TABLE_SEATS) facts.scrabble_full_table_wins = 1
    // No Swaps: won without ever exchanging or passing (a standard-mode timeout counts as a pass).
    if (exchanges === 0 && passes === 0) facts.scrabble_no_swap_wins = 1
  }

  return facts
}
