import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'
import { WORD_GROUPING_MAX_MISTAKES, WORD_GROUPING_TOTAL_GROUPS } from '@/lib/word-grouping'

/**
 * Word Grouping per-game facts, derived at finish from `word_grouping_submissions` and
 * the round's stored solution.
 *
 * The submissions log is ordered — one row per guess, with `is_correct` (only wrong or a
 * matched group), `group_index` (0..3 for a solved group, -1 for wrong), `difficulty`
 * (1..4 for solves, 0 for wrong), `mistakes_at_time` (mistakes made BEFORE this guess),
 * and `guess_words`. That is enough to reconstruct every trophy condition the brief asks
 * for without touching the client-side timeline.
 *
 * Everything here is a 0/1 flag per game or a cumulative integer (groups solved), keyed by
 * counters registered in `../counters.ts`. Ties/edge cases are conservative: a value we
 * cannot verify (e.g. one-away detection when the solution row is missing) simply doesn't
 * fire, rather than firing on the wrong condition.
 */

type SubmissionRow = {
  player_id: string
  group_index: number
  difficulty: number
  guess_words: string[] | null
  is_correct: boolean
  mistakes_at_time: number
  submitted_at: string
}

export async function wordGroupingFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: subsData }, { data: roundData }] = await Promise.all([
    supabase
      .from('word_grouping_submissions')
      .select('player_id, group_index, difficulty, guess_words, is_correct, mistakes_at_time, submitted_at')
      .eq('game_id', gameId),
    supabase
      .from('rounds')
      .select('id, started_at')
      .eq('game_id', gameId)
      .order('round_number', { ascending: true })
      .limit(1),
  ])

  const subs = (subsData ?? []) as SubmissionRow[]
  if (!subs.length) return out

  const roundId = roundData?.[0]?.id as string | undefined
  const roundStartMs = roundData?.[0]?.started_at ? new Date(roundData[0].started_at).getTime() : null

  // Solution is server-only (RLS blocks anon selects) — read via service-role client. Missing
  // solution disables the one-away checks: no solution means the "3-of-4 overlap" test cannot
  // be evaluated honestly, so the No-Red-Herrings and One-Away trophies simply won't fire for
  // this game rather than fire on a false negative.
  let solutionGroups: { words: string[]; difficulty: number }[] = []
  if (roundId) {
    const { data: solRow } = await supabase
      .from('word_grouping_solutions')
      .select('solution')
      .eq('round_id', roundId)
      .maybeSingle()
    const raw = (solRow?.solution as { groups?: unknown } | null)?.groups
    if (Array.isArray(raw)) {
      solutionGroups = raw
        .map((g) => g as { words?: unknown; difficulty?: unknown })
        .filter((g) => Array.isArray(g.words) && typeof g.difficulty === 'number')
        .map((g) => ({ words: g.words as string[], difficulty: g.difficulty as number }))
    }
  }

  // "Distinct submitting players" — the brief's anti-cheese for #28 Big Room. Counts real
  // accounts that actually made a guess, not everyone the room seated.
  const distinctSubmitters = new Set(subs.map((s) => s.player_id)).size

  // Group by player, then sort each player's log by time so ordered checks (descending,
  // bounce-back, hard-first) can walk the timeline without re-sorting.
  const byPlayer = new Map<string, SubmissionRow[]>()
  for (const s of subs) {
    const list = byPlayer.get(s.player_id) ?? []
    list.push(s)
    byPlayer.set(s.player_id, list)
  }

  for (const [playerId, rowsUnsorted] of byPlayer) {
    const rows = [...rowsUnsorted].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
    const facts: Record<string, number> = {}

    const correctRows = rows.filter((r) => r.is_correct)
    const wrongRows = rows.filter((r) => !r.is_correct)
    const groupsSolved = correctRows.length
    const mistakes = wrongRows.length
    const won = groupsSolved >= WORD_GROUPING_TOTAL_GROUPS
    const finished = won || mistakes >= WORD_GROUPING_MAX_MISTAKES

    if (groupsSolved > 0) facts.word_grouping_groups_solved = groupsSolved
    if (groupsSolved >= 2) facts.word_grouping_two_group_games = 1
    if (finished) facts.word_grouping_finished_games = 1
    if (won) facts.word_grouping_puzzles_solved = 1

    // Per-tier solved flags — used both directly (Easy Start / Full Marks Group) and
    // together for Colour Collector (#6 = solved one of each across played games).
    const tiersSolved = new Set<number>()
    for (const r of correctRows) tiersSolved.add(r.difficulty)
    if (tiersSolved.has(1)) facts.word_grouping_tier1_solved_games = 1
    if (tiersSolved.has(2)) facts.word_grouping_tier2_solved_games = 1
    if (tiersSolved.has(3)) facts.word_grouping_tier3_solved_games = 1
    if (tiersSolved.has(4)) facts.word_grouping_tier4_solved_games = 1

    // Lives Left: solved with the mistake bank still full at the moment of that guess.
    if (correctRows.some((r) => r.mistakes_at_time === 0)) {
      facts.word_grouping_no_mistakes_solve_games = 1
    }

    // Bounce Back: mistake then correct on the very next guess (in the same player's
    // ordered log). "Next" = adjacent in this player's timeline.
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i - 1].is_correct && rows[i].is_correct) {
        facts.word_grouping_bounce_back_games = 1
        break
      }
    }

    // One-away = a wrong guess that overlaps some solution group by exactly 3 of 4.
    // Silent no-fire when we don't have the solution.
    let oneAwayHit = false
    if (solutionGroups.length && wrongRows.length) {
      const lowerGroups = solutionGroups.map((g) => new Set(g.words.map((w) => w.toLowerCase())))
      for (const w of wrongRows) {
        const guess = (w.guess_words ?? []).map((g) => g.toLowerCase())
        for (const grp of lowerGroups) {
          let overlap = 0
          for (const g of guess) if (grp.has(g)) overlap++
          if (overlap === 3) {
            oneAwayHit = true
            break
          }
        }
        if (oneAwayHit) break
      }
    }
    if (oneAwayHit) facts.word_grouping_one_away_games = 1

    // Hard First: player's very first correct submission was tier-4. Same counter feeds
    // both "Hard First" (#13) and "Purple Hunter" (#27, gte 5).
    if (correctRows[0]?.difficulty === 4) facts.word_grouping_hard_first_games = 1

    // Clean Half: first two correct submissions both had mistakes_at_time === 0.
    if (correctRows.length >= 2 && correctRows[0].mistakes_at_time === 0 && correctRows[1].mistakes_at_time === 0) {
      facts.word_grouping_clean_half_games = 1
    }

    // Descending: won AND correct-solve order was strictly 4 → 3 → 2 → 1. That's Descending
    // (#19); Perfect Descent (#23) additionally needs zero mistakes.
    const descending =
      won &&
      correctRows.length === WORD_GROUPING_TOTAL_GROUPS &&
      correctRows.every((r, i) => r.difficulty === WORD_GROUPING_TOTAL_GROUPS - i)
    if (descending) facts.word_grouping_descending_wins = 1

    if (won) {
      if (mistakes === WORD_GROUPING_MAX_MISTAKES - 1) facts.word_grouping_one_life_wins = 1
      if (!oneAwayHit) facts.word_grouping_no_red_herrings_wins = 1
      if (mistakes === 0) facts.word_grouping_flawless_wins = 1
      if (mistakes === 0 && descending) facts.word_grouping_perfect_descent_wins = 1

      // Speed Grouper: last correct solve landed within 60s of the round starting AND the
      // solve was clean (brief's anti-cheese: "4 correct submissions with no wrong guesses in
      // under 60s"). Silently skipped when we lack a start time.
      if (mistakes === 0 && roundStartMs !== null) {
        const finishMs = new Date(correctRows[correctRows.length - 1].submitted_at).getTime()
        if (finishMs - roundStartMs < 60_000) facts.word_grouping_speed_wins = 1
      }

      // Big Room: won when 10+ real accounts submitted at least one guess. Uses distinct
      // submitters, not `ctx.seated.length` — seats include anyone who joined and never
      // guessed, which the brief's anti-cheese rules out.
      if (distinctSubmitters >= 10) facts.word_grouping_big_room_wins = 1
    }

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  // ctx is unused by this builder — Word Grouping's per-player facts fall out of submissions
  // + solution + distinct-submitter count. Referenced here to keep TS quiet about the arg
  // and to leave the shape available if a later trophy needs seat count or theme.
  void ctx

  return out
}
