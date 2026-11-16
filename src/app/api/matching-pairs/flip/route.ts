import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { playerIsViewer } from '@/lib/viewers'
import { isMatchingPairsGame, parseGameType } from '@/lib/game-types'
import { parseJsonBody } from '@/lib/parse-body'
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

/** Postgres unique_violation. */
const PG_UNIQUE_VIOLATION = '23505'

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

  // Auth.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  // Viewers (spectators, late joiners, eliminated players) watch read-only.
  if (playerIsViewer(auth.player, game)) {
    return NextResponse.json({ error: 'Viewers cannot submit' }, { status: 403 })
  }

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

    // Compute current streak from previous submissions.
    const { data: prevSubs } = await supabase
      .from('memory_match_submissions')
      .select('is_match, streak_at_time')
      .eq('round_id', round.id)
      .eq('player_id', playerId)
      .order('submitted_at', { ascending: true })

    // Cannot match more pairs than the grid holds.
    const priorMatches = (prevSubs ?? []).filter((s) => (s as { is_match: boolean }).is_match).length
    if (isMatch && priorMatches >= gridSizePairs) {
      return NextResponse.json({ error: 'All pairs already matched' }, { status: 409 })
    }

    // Plausibility floor (see MIN_MS_PER_ATTEMPT).
    if (roundAnchor) {
      const elapsedMs = Date.now() - new Date(roundAnchor).getTime()
      if (elapsedMs < ((prevSubs ?? []).length + 1) * MIN_MS_PER_ATTEMPT) {
        return NextResponse.json({ error: 'Flipping too fast' }, { status: 429 })
      }
    }

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
    const matchPoints = isMatch ? MATCHING_PAIRS_POINTS_PER_PAIR + streakBonus : 0
    const penaltyPoints = !isMatch ? MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY : 0
    const pointsDelta = matchPoints - penaltyPoints
    const pointsAfter = Math.max(0, prevPoints + pointsDelta)

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
      // A concurrent duplicate (e.g. a second instance past the in-memory lock) hit a
      // unique index: a client error, not a server fault.
      if ((subError as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        return NextResponse.json({ error: 'This pair was already matched' }, { status: 400 })
      }
      return NextResponse.json({ error: internalErrorMessage('matching-pairs/flip', subError) }, { status: 500 })
    }

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
