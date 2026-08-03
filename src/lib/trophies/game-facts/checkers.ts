import type { SupabaseClient } from '@supabase/supabase-js'
import type { CheckersColor } from '@/types'
import type { FactsContext } from './index'

/**
 * Checkers / Draughts per-game facts, folded at finish from the in-play accumulator the
 * engines kept. ONE builder serves all three game types — American `checkers` (8x8,
 * `checkers_sessions`), and `checkers_international` / `checkers_nigeria` (both 10x10,
 * `checkers10_sessions`, told apart by the `variant` column).
 *
 * WHY THE BUILDER SELF-DETECTS THE TABLE. The award pass calls a facts builder as
 * `builder(supabase, gameId, ctx)` — it does NOT pass the game type through (see
 * ./index.ts). All three keys in BUILDERS point here, so this file works out which board
 * it is by which table holds the row: a given game id lives in exactly one of the two
 * session tables. The 10x10 row's `variant` then separates International from Nigeria for
 * the variant-gated counters. This is more robust than a passed-in type and needs no
 * change to the shared builder signature.
 *
 * WHY AN ACCUMULATOR AND NOT A REPLAY. Checkers keeps a POSITION, not a record: `board` is
 * only where the pieces currently sit. A crowning, a multi-jump chain, an enemy king taken,
 * the deficit you clawed back from — none of it survives the hop. Unlike Chess (replay the
 * PGN) there is nothing to derive these from after the fact, so the engines tally them AS
 * THEY HAPPEN into paired `red_stats` / `black_stats` blobs on the session row (mirroring
 * the existing `red_time_ms` / `black_time_ms` layout — Checkers has no per-player table).
 * See src/lib/checkers.ts, src/lib/draughts10.ts and migration
 * 20260812020000_checkers_round_stats.sql. This builder maps `red_stats` -> player_red_id
 * and `black_stats` -> player_black_id.
 *
 * TWO KINDS OF COUNTER. `bump_player_stats` SUMS every counter into a lifetime total, so
 * lifetime tallies (captures, kings made) are emitted as this game's raw count and add up
 * across games, while per-game achievements ("held the back row", "won untouched") are
 * emitted as a 0/1 flag counted once and the rule reads `>= 1`. A per-game magnitude must
 * never be emitted raw or it sums into nonsense.
 *
 * THE WINNER IS TAKEN FROM `winner_player_id` AND cross-checked against `ctx.winners`, so a
 * game the award pass declined to score as a win (too few players, unresolved) never trips a
 * win flag. `winners` is empty for a draw AND for an unknown winner, so absence from it is
 * never read as "lost" — win flags withhold, they never punish. A draw credits BOTH seats.
 */

/** Starting men per side: 12 on the 8x8 board, 20 on the 10x10. */
const START_PIECES_8 = 12
const START_PIECES_10 = 20
/** Win with this much or less on your own clock (ms) — Clock Watcher. */
const CLOCK_WATCHER_MS = 15_000
/** `games.timer_seconds` value that means a blitz game. */
const BLITZ_SECONDS = 180
/** Worst deficit you must have faced for a win to count as a Comeback. */
const COMEBACK_DEFICIT = 4
/** Nigeria's "seeds" (pieces) captured for Seed Master. */
const SEED_MASTER_CAPTURES = 15
/** A flying king hop this many rows or longer — Flying King (10x10 only). */
const FLYING_KING_ROWS = 4
/** A forced majority-rule capture of this many pieces in one sequence (10x10 only). */
const MAJORITY_RULE_CHAIN = 5
/** Win inside this many of your own turns — Quick Win. Longer on the bigger board. */
const QUICK_WIN_TURNS_8 = 12
const QUICK_WIN_TURNS_10 = 18

type Stats = {
  captures?: number
  kings_made?: number
  enemy_kings_captured?: number
  best_chain?: number
  peak_kings?: number
  max_deficit?: number
  turns?: number
  back_streak_max?: number
  trades?: number
  reached_endgame?: number
  flying_king_max?: number
}

type SessionRow = {
  player_red_id: string | null
  player_black_id: string | null
  board: string | null
  result_reason: string | null
  winner_player_id: string | null
  is_draw: boolean | null
  red_time_ms: number | null
  black_time_ms: number | null
  red_stats: Stats | null
  black_stats: Stats | null
  variant?: string | null
  huffing_enabled?: boolean | null
}

/** Total pieces of one colour on the final board (fallback for captures if a blob is missing). */
function pieceCount(board: string, color: CheckersColor): number {
  let n = 0
  for (const ch of board) {
    if ((color === 'r' && (ch === 'r' || ch === 'R')) || (color === 'b' && (ch === 'b' || ch === 'B'))) n += 1
  }
  return n
}

export async function checkersFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const cols =
    'player_red_id, player_black_id, board, result_reason, winner_player_id, is_draw, red_time_ms, black_time_ms, red_stats, black_stats'
  // A game id lives in exactly one table; whichever returns a row decides the variant.
  const [c8, c10] = await Promise.all([
    supabase.from('checkers_sessions').select(cols).eq('game_id', gameId).maybeSingle(),
    supabase
      .from('checkers10_sessions')
      .select(`${cols}, variant, huffing_enabled`)
      .eq('game_id', gameId)
      .maybeSingle(),
  ])

  const session = (c10.data ?? c8.data ?? null) as SessionRow | null
  if (!session) return out
  const is10 = c10.data != null
  const variant = is10 ? (session.variant ?? 'international') : 'american'

  const seats: Array<{ color: CheckersColor; playerId: string; stats: Stats; clockMs: number | null }> = []
  if (session.player_red_id) {
    seats.push({
      color: 'r',
      playerId: session.player_red_id,
      stats: session.red_stats ?? {},
      clockMs: session.red_time_ms,
    })
  }
  if (session.player_black_id) {
    seats.push({
      color: 'b',
      playerId: session.player_black_id,
      stats: session.black_stats ?? {},
      clockMs: session.black_time_ms,
    })
  }

  for (const seat of seats) {
    const facts = seatFacts(seat, session, ctx, is10, variant)
    if (Object.keys(facts).length) out.set(seat.playerId, facts)
  }

  return out
}

function seatFacts(
  seat: { color: CheckersColor; playerId: string; stats: Stats; clockMs: number | null },
  session: SessionRow,
  ctx: FactsContext,
  is10: boolean,
  variant: string
): Record<string, number> {
  const facts: Record<string, number> = {}
  const s = seat.stats
  const board = session.board ?? ''
  const start = is10 ? START_PIECES_10 : START_PIECES_8
  const oppColor: CheckersColor = seat.color === 'r' ? 'b' : 'r'

  // Prefer the accumulated capture count (it also counts Nigerian huffs); fall back to the
  // final board — in Checkers only YOU remove the opponent's pieces, so the ones missing
  // from their side are exactly the ones you took.
  const captures = s.captures ?? Math.max(0, start - pieceCount(board, oppColor))
  const bestChain = s.best_chain ?? 0
  const peakKings = s.peak_kings ?? 0
  const myFinal = pieceCount(board, seat.color)

  // ── Lifetime tallies (this game's raw count; summed across games) ───────────────────────
  if (captures > 0) facts.checkers_captures = captures
  if ((s.kings_made ?? 0) > 0) facts.checkers_kings_made = s.kings_made!
  if ((s.enemy_kings_captured ?? 0) > 0) facts.checkers_enemy_kings_captured = s.enemy_kings_captured!

  // ── Per-game achievement flags ──────────────────────────────────────────────────────────
  if (captures >= 5) facts.checkers_five_down_games = 1
  if (bestChain >= 2) facts.checkers_double_jump_games = 1
  if (bestChain >= 3) facts.checkers_triple_jump_games = 1
  if (bestChain >= 4) facts.checkers_quad_jump_games = 1
  if (peakKings >= 2) facts.checkers_king_me_twice_games = 1
  if (peakKings >= 3) facts.checkers_kings_court_games = 1
  if ((s.back_streak_max ?? 0) >= 15) facts.checkers_back_row_games = 1
  if ((s.trades ?? 0) >= 1) facts.checkers_trade_games = 1
  if (session.is_draw) facts.checkers_draw_games = 1

  // Variant-gated: both 10x10 variants share the flying-king / majority mechanics (they run
  // the same draughts10 engine — the audit's "International" label is presentational), so
  // these fire in Nigeria too. Seeds/Street Rules are Nigeria-only in the rules and in fact:
  // huffing_enabled is forced false off the Nigerian board.
  if (is10 && (s.flying_king_max ?? 0) >= FLYING_KING_ROWS) facts.checkers_flying_king_games = 1
  if (is10 && bestChain >= MAJORITY_RULE_CHAIN) facts.checkers_majority_rule_games = 1
  if (variant === 'nigeria' && captures >= SEED_MASTER_CAPTURES) facts.checkers_seed_master_games = 1

  // ── Win flags (withheld, never punitive, when not a win) ────────────────────────────────
  // Cross-checked against the award pass so a game it declined to score never trips these.
  const won = ctx.winners.includes(seat.playerId) && session.winner_player_id === seat.playerId
  if (won) {
    if (session.result_reason === 'no_moves') facts.checkers_blockade_wins = 1
    if (session.result_reason === 'capture_all') facts.checkers_total_victory_wins = 1
    const timed = (ctx.timerSeconds ?? 0) > 0
    if (timed && typeof seat.clockMs === 'number' && seat.clockMs < CLOCK_WATCHER_MS) {
      facts.checkers_clock_watcher_wins = 1
    }
    if (ctx.timerSeconds === BLITZ_SECONDS) facts.checkers_blitz_wins = 1
    if (myFinal === start) facts.checkers_untouched_wins = 1
    if ((s.max_deficit ?? 0) >= COMEBACK_DEFICIT) facts.checkers_comeback_wins = 1
    if ((s.turns ?? Infinity) <= (is10 ? QUICK_WIN_TURNS_10 : QUICK_WIN_TURNS_8)) facts.checkers_quick_win_wins = 1
    if (s.reached_endgame) facts.checkers_endgame_master_wins = 1
    if (variant === 'nigeria' && session.huffing_enabled) facts.checkers_street_rules_wins = 1
  }

  return facts
}
