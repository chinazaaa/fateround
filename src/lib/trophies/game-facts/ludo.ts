import type { SupabaseClient } from '@supabase/supabase-js'
import { finishedPieceCount } from '@/lib/ludo'
import type { LudoPiece } from '@/types'
import type { FactsContext } from './index'

/**
 * Ludo's per-game facts, folded at finish from the in-play accumulator the engine kept.
 *
 * Ludo keeps a POSITION, not a record: `ludo_player_state.pieces` is only where a player's four
 * pieces currently sit. A six rolled, a capture made, a piece knocked home — none of it survives
 * the turn, so unlike Chess (replay the PGN) or Yahtzee (read the scorecard) there is nothing to
 * derive these from after the fact. The engine therefore tallies them AS THEY HAPPEN into
 * `ludo_player_state.game_counters` (see src/lib/ludo.ts and the migration
 * 20260811010000_ludo_round_stats.sql). That column is per-GAME — it lives on the session's own
 * rows and is dropped on play-again — so this builder reads it as "what happened this round" and
 * turns it into two kinds of trophy counter.
 *
 * TWO KINDS OF COUNTER. `bump_player_stats` SUMS every counter into a lifetime total, so:
 *  - lifetime tallies (sixes rolled, captures made) are emitted as this game's raw count and
 *    accumulate correctly across games;
 *  - per-game achievements ("rolled five sixes", "won untouched") are emitted as a 0/1 flag
 *    counted once, and the trophy rule reads `>= 1`. A per-game magnitude must never be emitted
 *    raw or it would sum into nonsense across games.
 *
 * THE WINNER IS READ FROM `ludo_sessions`, not inferred. `winner_player_id` is the authoritative
 * outcome the engine wrote; a null winner means the game ended without one (nobody home), and a
 * player who is simply not the winner has NOT "lost a piece" or anything else — win flags withhold,
 * they never punish. `ctx.winners` carries the same id (outcome.ts maps Ludo), but reading the
 * session directly keeps the derivation self-contained and testable.
 *
 * ONCE PER ROUND. One query returns every player's row; each player's facts come from their own
 * row alone (captures dealt are counted on the capturer, captures suffered on the victim, already
 * split by the engine). A player with no state row simply gets no map entry, which is not an error.
 */

type StateRow = {
  player_id: string
  color: string
  pieces: LudoPiece[] | null
  game_counters: Record<string, number> | null
}

/** Number of a player's pieces sent home this game — the max over the four per-colour tallies. */
function mostAgainstOneOpponent(c: Record<string, number>): number {
  return Math.max(0, c.cap_vs_red ?? 0, c.cap_vs_green ?? 0, c.cap_vs_yellow ?? 0, c.cap_vs_blue ?? 0)
}

/** True when a piece that was captured (its id bit set in `captured_mask`) still reached home. */
function escapedAPiece(pieces: LudoPiece[], capturedMask: number): boolean {
  return pieces.some((p) => p.zone === 'finished' && (capturedMask & (1 << p.id)) !== 0)
}

export async function ludoFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [stateRes, sessionRes] = await Promise.all([
    supabase.from('ludo_player_state').select('player_id, color, pieces, game_counters').eq('game_id', gameId),
    supabase.from('ludo_sessions').select('winner_player_id').eq('game_id', gameId).maybeSingle(),
  ])

  const rows = (stateRes.data ?? []) as StateRow[]
  const winnerId = (sessionRes.data?.winner_player_id as string | null | undefined) ?? null
  const seats = ctx.seated.length

  // Final finished counts for every player, so "win before any opponent got two home" can be
  // judged from the final board (the game ends the instant the winner's fourth piece lands, so
  // opponents' final counts are their counts at that moment).
  const finishedByPlayer = new Map<string, number>()
  for (const row of rows) finishedByPlayer.set(row.player_id, finishedPieceCount(row.pieces ?? []))

  for (const row of rows) {
    const pieces = row.pieces ?? []
    const c = row.game_counters ?? {}
    const won = winnerId != null && row.player_id === winnerId
    const timesCaptured = c.times_captured ?? 0
    const capturesMade = c.captures_made ?? 0
    const sixes = c.sixes_rolled ?? 0
    const finished = finishedByPlayer.get(row.player_id) ?? 0
    const facts: Record<string, number> = {}

    // ── Lifetime tallies (this game's raw count; summed across games) ───────────────────────
    if (sixes > 0) facts.ludo_sixes_rolled = sixes
    if ((c.double_sixes ?? 0) > 0) facts.ludo_double_sixes = c.double_sixes!
    if (capturesMade > 0) facts.ludo_captures_made = capturesMade
    if ((c.safe_landings ?? 0) > 0) facts.ludo_safe_landings = c.safe_landings!
    if ((c.pieces_deployed ?? 0) > 0) facts.ludo_pieces_deployed = c.pieces_deployed!
    if (timesCaptured > 0) facts.ludo_times_captured = timesCaptured

    // ── Per-game achievement flags ──────────────────────────────────────────────────────────
    if (sixes >= 3) facts.ludo_six_sense_games = 1
    if (sixes >= 5) facts.ludo_dice_hot_games = 1
    if (c.full_deploy) facts.ludo_full_deploy_games = 1
    if (c.shield) facts.ludo_shield_games = 1
    if ((c.max_captures_in_move ?? 0) >= 2) facts.ludo_double_capture_games = 1
    if (mostAgainstOneOpponent(c) >= 3) facts.ludo_sent_packing_games = 1
    if (escapedAPiece(pieces, c.captured_mask ?? 0)) facts.ludo_escape_artist_games = 1
    if (c.fast_start) facts.ludo_fast_start_games = 1
    if ((c.dsix_streak_max ?? 0) >= 3) facts.ludo_gridlock_games = 1

    // Pieces home (nested thresholds; each is a per-game flag, not the raw count).
    if (finished >= 1) facts.ludo_pieces_home_1 = 1
    if (finished >= 2) facts.ludo_pieces_home_2 = 1
    if (finished >= 3) facts.ludo_pieces_home_3 = 1

    // Capture 5+ in a game — not a win requirement. Gated to a real table (3+) per the brief's
    // anti-farm minimum, so two alts in an empty room can't mint it.
    if (capturesMade >= 5 && seats >= 3) facts.ludo_clean_sweep_games = 1

    // ── Win flags (withheld, never punitive, when not a win) ────────────────────────────────
    if (won && seats >= 2) {
      if (timesCaptured === 0) facts.ludo_untouched_wins = 1
      if (c.all_four_yarded) facts.ludo_comeback_wins = 1
      // Runaway: nobody else reached two home before this player finished all four.
      const noRivalReachedTwo = rows.every(
        (r) => r.player_id === row.player_id || (finishedByPlayer.get(r.player_id) ?? 0) < 2
      )
      if (noRivalReachedTwo) facts.ludo_runaway_games = 1
    }
    if (won && seats >= 4) facts.ludo_four_corners_wins = 1
    if (won && seats >= 4 && timesCaptured === 0) facts.ludo_perfect_run_wins = 1
    if (won && seats >= 3 && capturesMade >= 5 && timesCaptured === 0) facts.ludo_untouched_sweep_wins = 1

    out.set(row.player_id, facts)
  }

  return out
}
