import type { SupabaseClient } from '@supabase/supabase-js'
import type { AyoStats } from '@/types'
import type { FactsContext } from './index'

/**
 * Ayo (traditional) per-game facts, folded at finish from the paired in-play accumulators the
 * engine keeps. See `src/lib/ayo.ts` and migration 20260812040000.
 *
 * WHY AN ACCUMULATOR AND NOT A REPLAY. Traditional Ayo keeps a POSITION, not a record: `pits`
 * is only where the seeds currently sit, and `captured_a/b` / `houses_a/b` are running totals.
 * Relay sowing rewrites the board every move, so which of your six houses you sowed from, how
 * far a lap travelled, whether every move captured, the deficit you clawed back — none of it
 * survives the move. The engine tallies those AS THEY HAPPEN into `a_stats` / `b_stats` on the
 * one session row (mirroring the `a_*` / `b_*` column layout — Ayo has no per-player table).
 * This builder maps `a_stats` -> player_a_id and `b_stats` -> player_b_id.
 *
 * WHAT COMES FROM THE SESSION vs THE ACCUMULATOR. Magnitudes that are already columns — seeds
 * captured, houses won, the win streak — are read straight off the row. Only the move-shaped
 * facts (houses sowed from, biggest lap, capturing-move count, worst deficit, final-move
 * capture) come from the blobs.
 *
 * TWO KINDS OF COUNTER. `bump_player_stats` SUMS every counter into a lifetime total, so a
 * genuine lifetime tally (`ayo_seeds_captured`) is emitted as this game's raw count and adds
 * up, while every per-game achievement is a 0/1 flag counted once and its rule reads `>= 1`.
 *
 * THE WINNER IS TAKEN FROM `ctx.winners` (the award pass's authoritative set), so a game it
 * declined to score never trips a win flag; `winners` is empty for a draw AND an unknown
 * winner, so absence is never read as "lost". Losses and draws are read from the row's
 * `winner_player_id` / `is_draw` instead — Ayo is always two players, so the winner is always
 * resolved there. A draw credits both seats' `ayo_draws`.
 */

/** A single move that sows a full lap of the twelve-pit board. */
const FULL_LAP_SEEDS = 12
/** A single move that sows most of a lap — a relay that kept going. */
const BIG_SOW_SEEDS = 8
/** "Long game" threshold, counting BOTH seats' moves. */
const LONG_GAME_MOVES = 60
/** Comeback: trailed by at least this many seeds at some point, then won. */
const COMEBACK_DEFICIT = 10
/** "Every turn captured" needs a real game, not a two-move blitz. */
const PERFECT_CAPTURE_MIN_MOVES = 3

type SessionRow = {
  player_a_id: string
  player_b_id: string
  captured_a: number | null
  captured_b: number | null
  houses_a: number | null
  houses_b: number | null
  a_win_streak: number | null
  b_win_streak: number | null
  winner_player_id: string | null
  is_draw: boolean | null
  a_stats: AyoStats | null
  b_stats: AyoStats | null
}

export async function ayoFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data } = await supabase
    .from('ayo_sessions')
    .select(
      'player_a_id, player_b_id, captured_a, captured_b, houses_a, houses_b, a_win_streak, b_win_streak, winner_player_id, is_draw, a_stats, b_stats'
    )
    .eq('game_id', gameId)
    .maybeSingle()
  if (!data) return out

  const session = data as SessionRow
  const winners = new Set(ctx.winners)
  const timer = ctx.timerSeconds ?? 0
  const totalMoves = (session.a_stats?.moves ?? 0) + (session.b_stats?.moves ?? 0)

  const seats: {
    playerId: string
    captured: number
    houses: number
    oppHouses: number
    streak: number
    stats: AyoStats
  }[] = [
    {
      playerId: session.player_a_id,
      captured: session.captured_a ?? 0,
      houses: session.houses_a ?? 0,
      oppHouses: session.houses_b ?? 0,
      streak: session.a_win_streak ?? 0,
      stats: session.a_stats ?? {},
    },
    {
      playerId: session.player_b_id,
      captured: session.captured_b ?? 0,
      houses: session.houses_b ?? 0,
      oppHouses: session.houses_a ?? 0,
      streak: session.b_win_streak ?? 0,
      stats: session.b_stats ?? {},
    },
  ]

  for (const seat of seats) {
    const facts: Record<string, number> = {}
    const { stats } = seat
    const won = winners.has(seat.playerId)
    const lost = !session.is_draw && session.winner_player_id != null && session.winner_player_id !== seat.playerId

    // ── Lifetime tally + capture-magnitude flags ─────────────────────────────────────────────
    if (seat.captured > 0) facts.ayo_seeds_captured = seat.captured
    if (seat.captured >= 10) facts.ayo_ten_seed_games = 1
    if (seat.captured >= 24) facts.ayo_half_board_games = 1
    if (seat.captured >= 36) facts.ayo_dominant_games = 1
    if (seat.captured >= 44) facts.ayo_total_control_games = 1

    // ── Houses won this game ─────────────────────────────────────────────────────────────────
    if (seat.houses >= 2) facts.ayo_two_house_games = 1
    if (seat.houses >= 3) facts.ayo_three_house_games = 1
    if (seat.houses >= 5) facts.ayo_five_house_games = 1

    // ── Move-shaped facts, from the accumulator ──────────────────────────────────────────────
    if ((stats.sown_mask ?? 0) === 0b111111) facts.ayo_all_houses_sown = 1
    if ((stats.max_sown ?? 0) >= BIG_SOW_SEEDS) facts.ayo_big_sow_games = 1
    if ((stats.max_sown ?? 0) >= FULL_LAP_SEEDS) facts.ayo_full_lap_games = 1

    // ── Fate (independent of who won) ────────────────────────────────────────────────────────
    if (lost) facts.ayo_losses = 1
    if (session.is_draw) facts.ayo_draws = 1

    // ── Wins, gated on the authoritative winner set ──────────────────────────────────────────
    if (won) {
      if (timer === 0) facts.ayo_untimed_wins = 1
      if (timer > 0) facts.ayo_timed_wins = 1
      if (timer === 30) facts.ayo_blitz30_wins = 1
      if (seat.oppHouses === 0) facts.ayo_clean_board_wins = 1
      if ((stats.worst_deficit ?? 0) >= COMEBACK_DEFICIT) facts.ayo_comeback_wins = 1
      if ((stats.last_capture ?? 0) === 1) facts.ayo_precision_wins = 1
      if (totalMoves >= LONG_GAME_MOVES) facts.ayo_long_game_wins = 1
      if (seat.streak >= 3) facts.ayo_streak3_wins = 1
      if (seat.streak >= 5) facts.ayo_streak5_wins = 1
      // Every one of your moves captured a house — needs a real game, not a two-move blitz.
      const moves = stats.moves ?? 0
      if (moves >= PERFECT_CAPTURE_MIN_MOVES && (stats.capturing_moves ?? 0) === moves) {
        facts.ayo_perfect_capture_wins = 1
      }
    }

    if (Object.keys(facts).length > 0) out.set(seat.playerId, facts)
  }

  return out
}
