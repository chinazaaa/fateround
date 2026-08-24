import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * "Did this player actually do something in this game?"
 *
 * Complements the abort-reason gate in `award.ts`: aborts catch host force-ends
 * and idle-reaper closes, but a game that finished "naturally" (timer ran out
 * on every round, nobody submitted anything) still credits `games_played`,
 * streak, and first-mode coins. That's the two-device farming vector: host on
 * device A, "second player" on device B, neither answers a single trivia
 * question, timer expires all rounds, game finishes, credit lands.
 *
 * This module owns the per-game-type check that says whether the player has
 * at least one action row for this game — a vote in `votes`, an answer in
 * `trivia_answers`, a submission in `word_rush_answers`, etc. If the answer
 * is no, `awardForFinishedGame` treats the finish the same way it treats an
 * abort (no counter bumps, no streak, no coins).
 *
 * ── SCOPE ────────────────────────────────────────────────────────────────
 * Only game types whose actions/submissions live in a table with `player_id`
 * are gated here. Games where every move lives inside a session-JSON blob
 * (chess, ludo, whot, uno, monopoly, checkers, tic_tac_toe, ayo, mahjong,
 * scrabble, mafia, codewords, yahtzee, snake_and_ladder) fall back to the
 * abort gate + the `won` gate — their per-player hand/state row exists as
 * soon as the seat is dealt (bots too), so it's not a real engagement signal.
 * Adding the check for those requires a moves table or per-player action
 * count; deferred.
 */

/** A shape that reduces to `SELECT 1 FROM table WHERE playerCol=? AND gameCol=? LIMIT 1`. */
type SimpleCheck = {
  kind: 'simple'
  table: string
  playerColumn: string
  gameColumn: string
}

const CHECKS: Record<string, SimpleCheck | undefined> = {
  // Shared vote table (Fate Round vote/party games). One row per player per
  // round: any presence proves the player voted at least once.
  kiss_marry_kill: { kind: 'simple', table: 'votes', playerColumn: 'player_id', gameColumn: 'game_id' },
  smash_marry_kill: { kind: 'simple', table: 'votes', playerColumn: 'player_id', gameColumn: 'game_id' },
  would_you_rather: { kind: 'simple', table: 'votes', playerColumn: 'player_id', gameColumn: 'game_id' },
  pair: { kind: 'simple', table: 'votes', playerColumn: 'player_id', gameColumn: 'game_id' },
  target: { kind: 'simple', table: 'votes', playerColumn: 'player_id', gameColumn: 'game_id' },
  this_or_that: { kind: 'simple', table: 'votes', playerColumn: 'player_id', gameColumn: 'game_id' },
  most_likely_to: { kind: 'simple', table: 'votes', playerColumn: 'player_id', gameColumn: 'game_id' },
  never_have_i_ever: { kind: 'simple', table: 'votes', playerColumn: 'player_id', gameColumn: 'game_id' },
  // Only the picker writes for pick_a_number; the guessers just look at the
  // reveal. So a `votes` row exists iff YOU picked, which is exactly the
  // signal we want for that game type.
  pick_a_number: { kind: 'simple', table: 'votes', playerColumn: 'player_id', gameColumn: 'game_id' },

  // Per-game submission / answer tables.
  hot_seat: { kind: 'simple', table: 'hot_seat_submissions', playerColumn: 'player_id', gameColumn: 'game_id' },
  two_truths: { kind: 'simple', table: 'ttl_statements', playerColumn: 'player_id', gameColumn: 'game_id' },
  i_call_on: { kind: 'simple', table: 'npat_answers', playerColumn: 'player_id', gameColumn: 'game_id' },
  npat: { kind: 'simple', table: 'npat_answers', playerColumn: 'player_id', gameColumn: 'game_id' },
  landmine: { kind: 'simple', table: 'landmine_answers', playerColumn: 'player_id', gameColumn: 'game_id' },
  trivia: { kind: 'simple', table: 'trivia_answers', playerColumn: 'player_id', gameColumn: 'game_id' },
  quiplash: { kind: 'simple', table: 'quiplash_answers', playerColumn: 'player_id', gameColumn: 'game_id' },
  quick_draw: { kind: 'simple', table: 'quick_draw_drawings', playerColumn: 'player_id', gameColumn: 'game_id' },
  // describe_it stores the guesser's id under `guesser_player_id` — a
  // player who guessed at least once shows up here. The clue-giver's own
  // clues live in a different table; the guess table is a stricter gate.
  describe_it: {
    kind: 'simple',
    table: 'describe_it_guesses',
    playerColumn: 'guesser_player_id',
    gameColumn: 'game_id',
  },
  word_rush: { kind: 'simple', table: 'word_rush_answers', playerColumn: 'player_id', gameColumn: 'game_id' },
  word_hunt: { kind: 'simple', table: 'word_hunt_submissions', playerColumn: 'player_id', gameColumn: 'game_id' },
  word_grouping: {
    kind: 'simple',
    table: 'word_grouping_submissions',
    playerColumn: 'player_id',
    gameColumn: 'game_id',
  },
  word_search: { kind: 'simple', table: 'word_search_found', playerColumn: 'player_id', gameColumn: 'game_id' },
  word_scramble: { kind: 'simple', table: 'word_scramble_solves', playerColumn: 'player_id', gameColumn: 'game_id' },
  crossword: { kind: 'simple', table: 'crossword_submissions', playerColumn: 'player_id', gameColumn: 'game_id' },
  sudoku: { kind: 'simple', table: 'sudoku_submissions', playerColumn: 'player_id', gameColumn: 'game_id' },
  matching_pairs: {
    kind: 'simple',
    table: 'memory_match_submissions',
    playerColumn: 'player_id',
    gameColumn: 'game_id',
  },
  wordle_room: { kind: 'simple', table: 'wordle_room_guesses', playerColumn: 'player_id', gameColumn: 'game_id' },
  // troll_run: `player_states` row is created on first jump attempt, not on
  // seat, so its presence is a valid "did they play?" signal.
  troll_run: { kind: 'simple', table: 'troll_run_player_states', playerColumn: 'player_id', gameColumn: 'game_id' },
  // bingo: a card is dealt when the player is admitted, but only when they
  // actually load the round — no card = watched only. Weak signal, but
  // consistent with the other party-game gates.
  bingo: { kind: 'simple', table: 'bingo_cards', playerColumn: 'player_id', gameColumn: 'game_id' },
}

/**
 * True iff this player has at least one action row in the game's per-type
 * engagement table. Games not in the registry return `true` — no gate applied
 * (fall back to abort / `won` gates). Fail-open on error: a broken read must
 * never turn a real finish into a phantom "no engagement" — worst case, a
 * farmer earns nothing extra beyond what the abort gate already blocks.
 */
export async function playerEngagedInGame(
  supabase: SupabaseClient,
  gameType: string,
  gameId: string,
  playerId: string
): Promise<boolean> {
  const check = CHECKS[gameType]
  if (!check) return true // no registered signal → don't block

  try {
    // HEAD request returns no rows, just a count — cheapest possible
    // existence check. `count: 'exact'` is fine at this scale (per-player
    // filter narrows to at most a handful of rows for any real game).
    const { count, error } = await supabase
      .from(check.table)
      .select('*', { head: true, count: 'exact' })
      .eq(check.playerColumn, playerId)
      .eq(check.gameColumn, gameId)
    if (error) {
      console.error(`[engagement] check failed for ${gameType} on ${gameId}`, error)
      return true // fail-open — a broken read must not phantom-strip credit
    }
    return (count ?? 0) > 0
  } catch (err) {
    console.error(`[engagement] threw for ${gameType} on ${gameId}`, err)
    return true
  }
}

/** True if the engagement gate is registered for this game type. Callers can
 *  use this to log or explain "no gate applied" without inspecting the map. */
export function hasEngagementCheck(gameType: string): boolean {
  return CHECKS[gameType] !== undefined
}
