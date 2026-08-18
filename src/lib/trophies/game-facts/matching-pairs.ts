import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Matching Pairs per-game facts, derived at finish from `memory_match_submissions` and
 * `memory_match_progress`.
 *
 * Per-flip submissions record pair_index, is_match, streak_at_time, points_after. Progress
 * table has pairs_matched, wrong_attempts, finish_rank, finished_at.
 */

type ProgressRow = {
  player_id: string
  pairs_matched: number
  wrong_attempts: number
  finished: boolean
  finish_rank: number | null
}

type SubmissionRow = {
  player_id: string
  pair_index: number
  is_match: boolean
  streak_at_time: number
  points_after: number
  submitted_at: string
}

export async function matchingPairsFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: progressData }, { data: subsData }, { data: roundData }] = await Promise.all([
    supabase
      .from('memory_match_progress')
      .select('player_id, pairs_matched, wrong_attempts, finished, finish_rank')
      .eq('game_id', gameId),
    supabase
      .from('memory_match_submissions')
      .select('player_id, pair_index, is_match, streak_at_time, points_after, submitted_at')
      .eq('game_id', gameId)
      .order('submitted_at', { ascending: true }),
    supabase
      .from('rounds')
      .select('started_at, metadata')
      .eq('game_id', gameId)
      .order('round_number', { ascending: true })
      .limit(1),
  ])

  const progress = (progressData ?? []) as ProgressRow[]
  const subs = (subsData ?? []) as SubmissionRow[]
  if (!progress.length) return out

  const roundStart = roundData?.[0]?.started_at ? new Date(roundData[0].started_at).getTime() : null
  const meta = roundData?.[0]?.metadata as { gridSize?: number; totalPairs?: number } | null
  const totalPairs = meta?.totalPairs ?? meta?.gridSize ?? 0

  // Group submissions by player for streak/speed analysis
  const subsByPlayer = new Map<string, SubmissionRow[]>()
  for (const s of subs) {
    const list = subsByPlayer.get(s.player_id) ?? []
    list.push(s)
    subsByPlayer.set(s.player_id, list)
  }

  for (const p of progress) {
    const facts: Record<string, number> = {}
    const playerSubs = subsByPlayer.get(p.player_id) ?? []

    // Lifetime tally
    if (p.pairs_matched > 0) facts.matching_pairs_matched = p.pairs_matched

    // Per-game flags
    if (p.pairs_matched >= 5) facts.matching_five_pairs_games = 1

    // Max streak from streak_at_time column
    const maxStreak = Math.max(0, ...playerSubs.filter((s) => s.is_match).map((s) => s.streak_at_time))
    if (maxStreak >= 3) facts.matching_streak_3_games = 1
    if (maxStreak >= 6) facts.matching_streak_6_games = 1
    if (maxStreak >= 9) facts.matching_streak_9_games = 1

    // Full board
    if (p.finished) {
      facts.matching_full_board_games = 1
      if (p.wrong_attempts === 0) facts.matching_perfect_games = 1
    }

    // Points (from last submission)
    const finalPoints = playerSubs.length > 0 ? Math.max(0, ...playerSubs.map((s) => s.points_after)) : 0
    if (finalPoints >= 10_000) facts.matching_ten_thousand_games = 1
    if (finalPoints >= 20_000) facts.matching_twenty_thousand_games = 1

    // Quick six: 6 matches within 30 seconds
    if (roundStart) {
      const earlyMatches = playerSubs.filter(
        (s) => s.is_match && new Date(s.submitted_at).getTime() - roundStart <= 30_000
      )
      if (earlyMatches.length >= 6) facts.matching_quick_six_games = 1
    }

    // Big board (16+ pairs)
    if (totalPairs >= 16 && p.finished) facts.matching_big_board_games = 1

    // Podium (top 3)
    if (p.finish_rank != null && p.finish_rank <= 3) facts.matching_podium_finishes = 1

    if (Object.keys(facts).length) out.set(p.player_id, facts)
  }

  return out
}
