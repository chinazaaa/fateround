// Rank computation for the daily challenge — one helper so the finished-screen rank, the daily
// hub's "#N" chip, and the leaderboard's "your rank" footer all use the SAME comparator as the
// leaderboard's row order. Missing tiebreakers here (time_seconds on score games,
// hints_used/submitted_at on time games) previously made ties collapse to rank 1 while the
// leaderboard broke them by the extra columns.

import type { SupabaseClient } from '@supabase/supabase-js'
import { DAILY_GAME_PRIMARY_METRIC, type DailyChallengeGameType } from '@/lib/daily-challenge'

export interface DailyRankEntry {
  normalized_score: number
  raw_points: number
  items_solved: number
  time_seconds: number
  hints_used: number
  submitted_at: string
}

function baseCount(admin: SupabaseClient, challengeId: string) {
  return admin.from('daily_scores').select('*', { count: 'exact', head: true }).eq('challenge_id', challengeId)
}

export async function computeDailyRank(
  admin: SupabaseClient,
  gameType: DailyChallengeGameType,
  challengeId: string,
  entry: DailyRankEntry
): Promise<number> {
  const metric = DAILY_GAME_PRIMARY_METRIC[gameType]

  if (metric === 'time') {
    // Leaderboard order: items_solved DESC, time_seconds ASC, hints_used ASC, submitted_at ASC.
    // Filter out non-attempts (normalized_score = 0) — they don't appear on the board.
    const [a, b, c, d] = await Promise.all([
      baseCount(admin, challengeId).gt('normalized_score', 0).gt('items_solved', entry.items_solved),
      baseCount(admin, challengeId)
        .gt('normalized_score', 0)
        .eq('items_solved', entry.items_solved)
        .lt('time_seconds', entry.time_seconds),
      baseCount(admin, challengeId)
        .gt('normalized_score', 0)
        .eq('items_solved', entry.items_solved)
        .eq('time_seconds', entry.time_seconds)
        .lt('hints_used', entry.hints_used),
      baseCount(admin, challengeId)
        .gt('normalized_score', 0)
        .eq('items_solved', entry.items_solved)
        .eq('time_seconds', entry.time_seconds)
        .eq('hints_used', entry.hints_used)
        .lt('submitted_at', entry.submitted_at),
    ])
    return (a.count ?? 0) + (b.count ?? 0) + (c.count ?? 0) + (d.count ?? 0) + 1
  }

  // 'score' metric — leaderboard order: raw_points DESC, time_seconds ASC, submitted_at ASC.
  const [a, b, c] = await Promise.all([
    baseCount(admin, challengeId).gt('raw_points', 0).gt('raw_points', entry.raw_points),
    baseCount(admin, challengeId)
      .gt('raw_points', 0)
      .eq('raw_points', entry.raw_points)
      .lt('time_seconds', entry.time_seconds),
    baseCount(admin, challengeId)
      .gt('raw_points', 0)
      .eq('raw_points', entry.raw_points)
      .eq('time_seconds', entry.time_seconds)
      .lt('submitted_at', entry.submitted_at),
  ])
  return (a.count ?? 0) + (b.count ?? 0) + (c.count ?? 0) + 1
}
