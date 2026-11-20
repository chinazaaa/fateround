import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { playerIsViewer } from '@/lib/viewers'
import { isMatchingPairsGame, parseGameType } from '@/lib/game-types'
import { parseJsonBody } from '@/lib/parse-body'
import { touchGameActivity } from '@/lib/game-activity'
import { internalErrorMessage } from '@/lib/api-errors'
import {
  parseMatchingPairsMetadata,
  computeStreakBonus,
  finishMatchingPairsRoundIfAllDone,
  MATCHING_PAIRS_POINTS_PER_PAIR,
  MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY,
  matchingPairsGameSessionExpired,
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

/** Grace (seconds) added to the round timer so a flip made just before time-up still lands. */
const DEADLINE_GRACE_SECONDS = 2

/**
 * Plausibility floor: every resolved attempt (match or miss) takes two card clicks
 * plus the player looking at the board. 300 ms per attempt, averaged cumulatively
 * since the round started, is far faster than any human can sustain (a perfect-memory
 * speedrunner still needs two clicks and a render per pair). The bound is cumulative
 * rather than per-request so network jitter that bunches requests cannot trip it, and
 * the round's `started_at` can only be earlier than the player's first click, so it
 * can only make the real elapsed time longer than measured here.
 */
const MIN_MS_PER_ATTEMPT = 300

/** Re-read and re-score this many times when the history changes under a flip before giving up. */
const MAX_RECORD_ATTEMPTS = 3

const playerLocks = new Map<string, Promise<void>>()

async function acquireLock(playerId: string) {
  while (playerLocks.has(playerId)) {
    await playerLocks.get(playerId)
  }
  let resolveLock!: () => void
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve
  })
  playerLocks.set(playerId, lockPromise)
  return () => {
    playerLocks.delete(playerId)
    resolveLock()
  }
}

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, flipSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, pairIndex, isMatch } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  // Verify game is active and read round info.
  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_type, session_started_at, timer_seconds, current_round_number, rounds_count')
    .eq('id', code)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game is not active' }, { status: 400 })
  if (!isMatchingPairsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Matching Pairs game' }, { status: 400 })
  }

  const currentRoundNumber = game.current_round_number ?? 1
  const totalRounds = game.rounds_count ?? 1

  // Auth. Read-only here so the liveness bump below only runs for a real player: a viewer whose
  // flips are rejected must not keep an abandoned game looking active.
  const auth = await assertPlayer(supabase, code, resumeToken, { readOnly: true })
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  // Viewers (spectators, late joiners, eliminated players) watch read-only.
  if (playerIsViewer(auth.player, game)) {
    return NextResponse.json({ error: 'Viewers cannot submit' }, { status: 403 })
  }
  touchGameActivity(supabase, code)

  const release = await acquireLock(playerId)
  try {
    // Load the active round to get metadata.
    const { data: round } = await supabase
      .from('rounds')
      .select('id, status, started_at, memory_match_metadata')
      .eq('game_id', code)
      .eq('round_number', currentRoundNumber)
      .maybeSingle()
    if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 404 })

    if (round.status !== 'active') return NextResponse.json({ error: 'Round is not active' }, { status: 400 })

    // Same anchor as the expire route: each round's own started_at (round 1 falls back
    // to the session start). A small grace covers in-flight requests at time-up.
    const roundAnchor = round.started_at ?? game.session_started_at
    const timerSeconds = game.timer_seconds
    if (
      timerSeconds &&
      timerSeconds > 0 &&
      matchingPairsGameSessionExpired(roundAnchor, timerSeconds + DEADLINE_GRACE_SECONDS)
    ) {
      return NextResponse.json({ error: 'Time is up' }, { status: 400 })
    }

    const meta = parseMatchingPairsMetadata(round.memory_match_metadata)
    if (!meta) return NextResponse.json({ error: 'Round metadata missing' }, { status: 500 })

    const gridSizePairs = meta.gridSizePairs as MatchingPairsGridSize

    // Validate pair_index is in range.
    if (pairIndex < 0 || pairIndex >= gridSizePairs) {
      return NextResponse.json({ error: 'Invalid pair index' }, { status: 400 })
    }

    // Reject if this pair was already matched (prevents duplicate scoring).
    const { data: existingMatch } = await supabase
      .from('memory_match_submissions')
      .select('id')
      .eq('round_id', round.id)
      .eq('player_id', playerId)
      .eq('pair_index', pairIndex)
      .eq('is_match', true)
      .maybeSingle()

    if (existingMatch) {
      return NextResponse.json({ error: 'This pair was already matched' }, { status: 409 })
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

    // Score the flip from the player's history and record it, conditional on that history still being the
    // one the score was computed from. The history can change between the read and the insert (another
    // instance appends a flip for this player, or a data cleanup deletes and rescores rows); the function
    // then answers `stale` without inserting and we re-read and recompute, so a stored score never rests on
    // a superseded history.
    let scored: { pointsDelta: number; pointsAfter: number; streakBonus: number; newStreak: number } | null = null
    for (let attempt = 0; attempt < MAX_RECORD_ATTEMPTS && !scored; attempt++) {
      // Compute current streak and total points from previous submissions.
      const { data: prevSubs, error: prevError } = await supabase
        .from('memory_match_submissions')
        .select('id, is_match, points_after')
        .eq('round_id', round.id)
        .eq('player_id', playerId)
        .order('submitted_at', { ascending: true })
        .order('id', { ascending: true })
      if (prevError) {
        return NextResponse.json({ error: internalErrorMessage('matching-pairs/flip', prevError) }, { status: 500 })
      }
      const history = (prevSubs ?? []) as Array<{ id: string; is_match: boolean; points_after: number }>

      // Cannot match more pairs than the grid holds.
      const priorMatches = history.filter((s) => s.is_match).length
      if (isMatch && priorMatches >= gridSizePairs) {
        return NextResponse.json({ error: 'All pairs already matched' }, { status: 409 })
      }

      // Plausibility floor (see MIN_MS_PER_ATTEMPT).
      if (roundAnchor) {
        const elapsedMs = Date.now() - new Date(roundAnchor).getTime()
        if (elapsedMs < (history.length + 1) * MIN_MS_PER_ATTEMPT) {
          return NextResponse.json({ error: 'Flipping too fast' }, { status: 429 })
        }
      }

      // Reconstruct current_streak from the last run of consecutive matches.
      let currentStreak = 0
      for (let i = history.length - 1; i >= 0; i--) {
        if (!history[i].is_match) break
        currentStreak++
      }

      // Compute what happens with this flip.
      const streakBonus = isMatch ? computeStreakBonus(currentStreak) : 0
      const newStreak = isMatch ? currentStreak + 1 : 0

      // Current total points (from the last submission if any).
      const lastSub = history.length > 0 ? history[history.length - 1] : null
      const prevPoints = lastSub?.points_after ?? 0
      const matchPoints = isMatch ? MATCHING_PAIRS_POINTS_PER_PAIR + streakBonus : 0
      const penaltyPoints = !isMatch ? MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY : 0
      const pointsDelta = matchPoints - penaltyPoints
      const pointsAfter = Math.max(0, prevPoints + pointsDelta)

      // Record the flip atomically: the function re-checks the round (and the player's progress row)
      // is still open under a row lock, so a flip racing the expiry route cannot land after close,
      // the partial unique index on matched pairs rejects a duplicate from another instance, and the
      // history fingerprint (row count + latest row id) rejects a score computed from a stale history.
      const { data: recordData, error: subError } = await supabase.rpc('matching_pairs_record_flip_checked', {
        p_game_id: code,
        p_round_id: round.id,
        p_player_id: playerId,
        p_pair_index: pairIndex,
        p_is_match: isMatch,
        p_streak_at_time: newStreak,
        p_streak_bonus: streakBonus,
        p_points_after: pointsAfter,
        p_expected_count: history.length,
        p_expected_last_id: lastSub?.id ?? null,
      })
      if (subError) {
        return NextResponse.json({ error: internalErrorMessage('matching-pairs/flip', subError) }, { status: 500 })
      }
      const recordStatus = (recordData as { status?: string } | null)?.status
      if (recordStatus === 'round_not_active') {
        return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
      }
      if (recordStatus === 'already_matched') {
        return NextResponse.json({ error: 'This pair was already matched' }, { status: 409 })
      }
      if (recordStatus === 'stale') continue
      if (recordStatus !== 'ok') {
        return NextResponse.json(
          {
            error: internalErrorMessage('matching-pairs/flip', new Error(`unexpected status ${String(recordStatus)}`)),
          },
          { status: 500 }
        )
      }
      scored = { pointsDelta, pointsAfter, streakBonus, newStreak }
    }
    if (!scored) {
      return NextResponse.json({ error: 'The round changed while recording this flip, try again' }, { status: 409 })
    }
    const { pointsDelta, pointsAfter, streakBonus, newStreak } = scored

    // Count matches and wrong attempts from memory_match_submissions to be 100% accurate and race-free.
    const { data: allRoundSubs, error: countError } = await supabase
      .from('memory_match_submissions')
      .select('is_match')
      .eq('round_id', round.id)
      .eq('player_id', playerId)

    if (countError) {
      return NextResponse.json({ error: internalErrorMessage('matching-pairs/flip', countError) }, { status: 500 })
    }

    const newPairsMatched = (allRoundSubs ?? []).filter((s) => s.is_match).length
    const newWrongAttempts = (allRoundSubs ?? []).filter((s) => !s.is_match).length
    const justFinished = isMatch && newPairsMatched >= gridSizePairs

    let finishRank: number | null = null
    if (justFinished) {
      // Use atomic RPC to prevent duplicate ranks under concurrent finishers.
      const { data: finishData, error: finishError } = await supabase.rpc('matching_pairs_finish_player', {
        p_round_id: round.id,
        p_player_id: playerId,
        p_pairs_matched: newPairsMatched,
        p_wrong_attempts: newWrongAttempts,
      })
      if (finishError) {
        return NextResponse.json({ error: internalErrorMessage('matching-pairs/flip', finishError) }, { status: 500 })
      }
      const result = finishData as { error?: string; finish_rank?: number } | null
      if (result?.error) {
        return NextResponse.json(
          { error: result.error === 'ALREADY_FINISHED' ? 'Player already finished' : 'Failed to finish' },
          { status: 409 }
        )
      }
      finishRank = result?.finish_rank ?? null
    } else {
      // Non-finishing update: pairs_matched or wrong_attempts.
      const { error: progressError } = await supabase
        .from('memory_match_progress')
        .update({
          pairs_matched: newPairsMatched,
          wrong_attempts: newWrongAttempts,
          updated_at: new Date().toISOString(),
        })
        .eq('round_id', round.id)
        .eq('player_id', playerId)

      if (progressError) {
        return NextResponse.json({ error: internalErrorMessage('matching-pairs/flip', progressError) }, { status: 500 })
      }
    }

    // If everyone is done, end the round (and the game if this was the final round).
    if (justFinished) {
      await finishMatchingPairsRoundIfAllDone(supabase, code, round.id, currentRoundNumber, totalRounds, gridSizePairs)
    }

    return NextResponse.json({
      success: true,
      pointsDelta,
      pointsAfter,
      streakBonus,
      wrongPenalty: isMatch ? 0 : MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY,
      currentStreak: newStreak,
      pairsMatched: newPairsMatched,
      finished: justFinished,
      finishRank,
    })
  } finally {
    release()
  }
}
