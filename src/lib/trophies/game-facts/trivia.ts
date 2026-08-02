import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Trivia's per-game facts, derived at finish from what the game already stored.
 *
 * Trivia is the one game that keeps a real record rather than a position: `trivia_answers` holds
 * one row per (player, round) with `is_correct`, `response_ms` and `points`, all written
 * server-side. So 28 of the 30 briefed Trivia trophies need no new tracking at all — they are
 * aggregations over rows that are already there. Nothing here touches a gameplay route.
 *
 * ONE CALL PER ROUND, NOT PER PLAYER. The two tables are read once and every player's facts come
 * out of that single read. It matters here more than anywhere: the round-shaped derivations
 * (first-correct per question, the cumulative rank history) already needed EVERY player's answers
 * to decide one player's facts, so a per-player call re-read all 400 rows of a 40-player game
 * forty times and threw away thirty-nine fortieths of the work each time. Everything below is
 * therefore computed once for the round, then sliced per player.
 *
 * WHY FLAGS AND NOT VALUES. Counters are lifetime sums (`bump_player_stats` adds deltas) and the
 * rule DSL only asks `counter >= n`. So a per-game achievement cannot be stored as a value —
 * "my best streak this game was 10" would be summed across games into nonsense. Each per-game
 * achievement is emitted as a 0/1 flag counted once, and the rule then reads `>= 1`. Only
 * genuinely cumulative measures (correct answers) are emitted as real totals.
 *
 * ORDERING AND TIMING ARE BOTH RECOVERABLE. `response_ms` is computed server-side from
 * `rounds.started_at` and clamped to the timer, and the first correct answerer in a round is
 * `argmin(response_ms)` among that round's correct rows. Neither is a client claim.
 */

/** A correct answer landing within this margin of the deadline is a buzzer-beater. */
const BUZZER_BEATER_MS = 2000
/** "Lightning": mean response time across a player's correct answers. */
const LIGHTNING_MEAN_MS = 3000

type AnswerRow = {
  round_id: string
  player_id: string
  is_correct: boolean
  response_ms: number | null
  points: number | null
}

type RoundRow = { id: string; round_number: number }

/**
 * Longest run of consecutive correct answers, in round order.
 *
 * Rounds the player didn't answer break the run — an unanswered question is not a correct one,
 * and treating a gap as neutral would let someone build a "20 in a row" by skipping the hard
 * ones.
 */
function longestCorrectRun(mine: AnswerRow[], roundOrder: Map<string, number>): number {
  const ordered = [...mine].sort((a, b) => (roundOrder.get(a.round_id) ?? 0) - (roundOrder.get(b.round_id) ?? 0))
  let best = 0
  let run = 0
  let expected: number | null = null
  for (const row of ordered) {
    const n = roundOrder.get(row.round_id) ?? 0
    if (!row.is_correct || (expected !== null && n !== expected)) run = 0
    if (row.is_correct) {
      run = expected !== null && n !== expected ? 1 : run + 1
      best = Math.max(best, run)
    }
    expected = n + 1
  }
  return best
}

export async function triviaFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: answers }, { data: rounds }] = await Promise.all([
    supabase
      .from('trivia_answers')
      .select('round_id, player_id, is_correct, response_ms, points')
      .eq('game_id', gameId),
    supabase.from('rounds').select('id, round_number').eq('game_id', gameId),
  ])

  const all = (answers ?? []) as AnswerRow[]
  if (!all.length) return out

  const roundOrder = new Map((rounds ?? []).map((r) => [(r as RoundRow).id, Number((r as RoundRow).round_number) || 0]))
  const questionCount = (rounds ?? []).length

  // ── Round-wide passes, done once ──────────────────────────────────────────────────────
  const byPlayer = new Map<string, AnswerRow[]>()
  for (const a of all) {
    const list = byPlayer.get(a.player_id) ?? []
    list.push(a)
    byPlayer.set(a.player_id, list)
  }

  // First-correct per round: the earliest correct response in that round. Ties are impossible
  // in practice (millisecond resolution) but `<=` keeps one winner if they ever happen.
  const byRound = new Map<string, AnswerRow[]>()
  for (const a of all) {
    if (!a.is_correct) continue
    const list = byRound.get(a.round_id) ?? []
    list.push(a)
    byRound.set(a.round_id, list)
  }
  const firstCorrectCounts = new Map<string, number>()
  for (const [, list] of byRound) {
    const fastest = list.reduce((a, b) => ((a.response_ms ?? Infinity) <= (b.response_ms ?? Infinity) ? a : b))
    firstCorrectCounts.set(fastest.player_id, (firstCorrectCounts.get(fastest.player_id) ?? 0) + 1)
  }

  // Rank history replays the same cumulative points the standings use, so "led from the first
  // question" and "came from outside the top three" are measured against the score players
  // actually saw. It is only ever read for a winner, so it is skipped when nobody won — which is
  // also the case for a draw and for a round whose winner the server couldn't determine.
  const winners = new Set(ctx.winners)
  const ranked = winners.size && questionCount > 0 ? rankHistory(all, roundOrder, questionCount) : null

  const timerMs = (ctx.timerSeconds ?? 0) * 1000

  // ── Per player, from the rows already in hand ──────────────────────────────────────────
  for (const [playerId, mine] of byPlayer) {
    const facts: Record<string, number> = {}
    const won = winners.has(playerId)

    const correct = mine.filter((a) => a.is_correct)
    if (correct.length) facts.trivia_correct_answers = correct.length

    // ── Speed and ordering ──────────────────────────────────────────────────────────────
    const firstCorrect = firstCorrectCounts.get(playerId) ?? 0
    if (firstCorrect) facts.trivia_first_correct_games = 1
    if (firstCorrect >= 5) facts.trivia_speed_demon_games = 1
    // Clean sweep: first correct on EVERY question, in a game long enough to mean something.
    if (questionCount >= 5 && firstCorrect === questionCount) facts.trivia_clean_sweep_games = 1

    if (timerMs > BUZZER_BEATER_MS && correct.some((a) => (a.response_ms ?? 0) >= timerMs - BUZZER_BEATER_MS)) {
      facts.trivia_buzzer_beater_games = 1
    }

    const timed = correct.filter((a) => typeof a.response_ms === 'number')
    if (timed.length) {
      const mean = timed.reduce((sum, a) => sum + (a.response_ms ?? 0), 0) / timed.length
      if (mean < LIGHTNING_MEAN_MS) facts.trivia_lightning_games = 1
    }

    // ── Streaks within the game ─────────────────────────────────────────────────────────
    const run = longestCorrectRun(mine, roundOrder)
    if (run >= 3) facts.trivia_streak_3_games = 1
    if (run >= 5) facts.trivia_streak_5_games = 1
    if (run >= 10) facts.trivia_streak_10_games = 1
    if (run >= 20) facts.trivia_streak_20_games = 1

    // ── Accuracy ────────────────────────────────────────────────────────────────────────
    const perfect = questionCount > 0 && correct.length === questionCount
    if (perfect && questionCount >= 5) facts.trivia_full_marks_games = 1
    if (perfect && questionCount >= 10) facts.trivia_perfect_10q_games = 1
    if (perfect && questionCount >= 15 && won) facts.trivia_flawless_wins = 1

    // ── Room and source ─────────────────────────────────────────────────────────────────
    if (ctx.questionSource === 'custom') facts.trivia_custom_set_games = 1
    if (ctx.seated.length >= 15) facts.trivia_big_room_15 = 1
    if (ctx.seated.length >= 20 && won) facts.trivia_packed_house_wins = 1

    // ── Rank history ────────────────────────────────────────────────────────────────────
    if (won && ranked) {
      const mineRanks = ranked.get(playerId) ?? []
      if (mineRanks.length && mineRanks.every((r) => r === 1)) facts.trivia_wire_to_wire_wins = 1
      const halfway = mineRanks[Math.max(0, Math.ceil(questionCount / 2) - 1)]
      if (halfway !== undefined && halfway > 3) facts.trivia_comeback_wins = 1
    }

    // A player whose rows produced nothing worth counting gets no entry at all, rather than an
    // empty one — the map is "what we have to say", and silence is not a zero.
    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}

/** Cumulative rank per player after each round, best first. */
function rankHistory(all: AnswerRow[], roundOrder: Map<string, number>, questionCount: number): Map<string, number[]> {
  const totals = new Map<string, number>()
  const history = new Map<string, number[]>()
  const players = [...new Set(all.map((a) => a.player_id))]
  for (const p of players) history.set(p, [])

  for (let n = 1; n <= questionCount; n += 1) {
    for (const a of all) {
      if ((roundOrder.get(a.round_id) ?? 0) !== n) continue
      totals.set(a.player_id, (totals.get(a.player_id) ?? 0) + (Number(a.points) || 0))
    }
    const standing = [...players].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
    standing.forEach((p, i) => history.get(p)?.push(i + 1))
  }
  return history
}
