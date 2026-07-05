import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { internalErrorMessage } from '@/lib/api-errors'
import {
  parseMatchingPairsMetadata,
  computeStreakBonus,
  finishMatchingPairsIfAllDone,
  MATCHING_PAIRS_POINTS_PER_PAIR,
  type MatchingPairsGridSize,
} from '@/lib/memory-match'

/**
 * POST /api/matching-pairs/flip
 *
 * Called when a player resolves a flip attempt (either a matched pair or a
 * wrong-attempt miss). The client handles the 0.8s flip-back delay locally and
 * only calls this endpoint when it knows the result.
 *
 * Body:
 *   gameId      – room code
 *   resumeToken – player auth token
 *   pairIndex   – which pair was involved (0-based)
 *   isMatch     – true = both cards matched, false = mismatch
 */
const flipSchema = z.object({
  gameId: z.string().min(1).max(10).toUpperCase(),
  resumeToken: z.string().min(4),
  /** Zero-based pair index. */
  pairIndex: z.number().int().min(0),
  /** true = matched pair, false = mismatch attempt. */
  isMatch: z.boolean(),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, flipSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, pairIndex, isMatch } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  // Verify game is active.
  const { data: game } = await supabase
    .from('games')
    .select('id, status')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })

  // Auth.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  // Load the round to get metadata.
  const { data: round } = await supabase
    .from('rounds')
    .select('id, memory_match_metadata')
    .eq('game_id', code)
    .eq('round_number', 1)
    .maybeSingle()
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

  const meta = parseMatchingPairsMetadata(round.memory_match_metadata)
  if (!meta) return NextResponse.json({ error: 'Round metadata missing' }, { status: 500 })

  const gridSizePairs = meta.gridSizePairs as MatchingPairsGridSize

  // Validate pair_index is in range.
  if (pairIndex < 0 || pairIndex >= gridSizePairs) {
    return NextResponse.json({ error: 'Invalid pair index' }, { status: 400 })
  }

  // Load the player's current progress to get their streak state.
  const { data: progressRow } = await supabase
    .from('memory_match_progress')
    .select('pairs_matched, wrong_attempts, finished')
    .eq('round_id', round.id)
    .eq('player_id', playerId)
    .maybeSingle()

  if (progressRow?.finished) {
    return NextResponse.json({ error: 'You have already finished this game' }, { status: 409 })
  }

  // Compute current streak from previous submissions.
  const { data: prevSubs } = await supabase
    .from('memory_match_submissions')
    .select('is_match, streak_at_time')
    .eq('round_id', round.id)
    .eq('player_id', playerId)
    .order('submitted_at', { ascending: true })

  // Reconstruct current_streak from the last run of consecutive matches.
  let currentStreak = 0
  if (prevSubs && prevSubs.length > 0) {
    // Walk backwards: find the longest trailing run of is_match=true
    for (let i = prevSubs.length - 1; i >= 0; i--) {
      const s = prevSubs[i] as { is_match: boolean }
      if (s.is_match) {
        currentStreak++
      } else {
        break
      }
    }
  }

  // Compute what happens with this flip.
  const streakBonus = isMatch ? computeStreakBonus(currentStreak) : 0
  const newStreak = isMatch ? currentStreak + 1 : 0

  // Current total points (from last submission if any).
  const { data: lastSub } = await supabase
    .from('memory_match_submissions')
    .select('points_after')
    .eq('round_id', round.id)
    .eq('player_id', playerId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const prevPoints = (lastSub as { points_after: number } | null)?.points_after ?? 0
  const pointsDelta = isMatch ? MATCHING_PAIRS_POINTS_PER_PAIR + streakBonus : 0
  const pointsAfter = prevPoints + pointsDelta

  // Insert submission row.
  const { error: subError } = await supabase.from('memory_match_submissions').insert({
    game_id: code,
    round_id: round.id,
    player_id: playerId,
    pair_index: pairIndex,
    is_match: isMatch,
    streak_at_time: newStreak,
    streak_bonus: streakBonus,
    points_after: pointsAfter,
  })
  if (subError) {
    return NextResponse.json({ error: internalErrorMessage('matching-pairs/flip', subError) }, { status: 500 })
  }

  // Update progress counters.
  const newPairsMatched = (progressRow?.pairs_matched ?? 0) + (isMatch ? 1 : 0)
  const newWrongAttempts = (progressRow?.wrong_attempts ?? 0) + (isMatch ? 0 : 1)
  const justFinished = isMatch && newPairsMatched >= gridSizePairs

  // Determine finish rank if this player just finished.
  let finishRank: number | null = null
  if (justFinished) {
    const { count } = await supabase
      .from('memory_match_progress')
      .select('id', { count: 'exact', head: true })
      .eq('round_id', round.id)
      .eq('finished', true)
    finishRank = (count ?? 0) + 1
  }

  const progressUpdate: Record<string, unknown> = {
    pairs_matched: newPairsMatched,
    wrong_attempts: newWrongAttempts,
    updated_at: new Date().toISOString(),
  }
  if (justFinished) {
    progressUpdate.finished = true
    progressUpdate.finish_rank = finishRank
    progressUpdate.finished_at = new Date().toISOString()
  }

  await supabase
    .from('memory_match_progress')
    .update(progressUpdate)
    .eq('round_id', round.id)
    .eq('player_id', playerId)

  // If everyone is done, end the game.
  if (justFinished) {
    await finishMatchingPairsIfAllDone(supabase, code, round.id, gridSizePairs)
  }

  return NextResponse.json({
    success: true,
    pointsDelta,
    pointsAfter,
    streakBonus,
    currentStreak: newStreak,
    pairsMatched: newPairsMatched,
    finished: justFinished,
    finishRank,
  })
}
