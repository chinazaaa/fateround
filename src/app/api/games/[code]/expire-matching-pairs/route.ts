import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isMatchingPairsGame } from '@/lib/game-types'
import { markGameFinished } from '@/lib/game-finish'
import { matchingPairsGameSessionExpired, type MatchingPairsGridSize } from '@/lib/memory-match'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_type, session_started_at, timer_seconds, current_round_number, rounds_count')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isMatchingPairsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Matching Pairs game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ expired: false, finished: game.status === 'finished' })
  }

  const currentRoundNumber = game.current_round_number ?? 1
  const totalRounds = game.rounds_count ?? 1

  // Load the active round.
  const { data: activeRound } = await supabase
    .from('rounds')
    .select('id, started_at')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .maybeSingle()
  if (!activeRound) {
    // No active round — nothing to expire
    return NextResponse.json({ expired: false, finished: false })
  }
  const roundId = activeRound.id

  // The timer is per-round, but `session_started_at` is only ever set once at game
  // start — checking against it directly would treat every round after the first as
  // already expired the instant it starts (round 1 already used up the budget). Each
  // round's own `started_at` is the correct anchor; only round 1 falls back to the
  // game's session start.
  const roundAnchor = activeRound.started_at ?? game.session_started_at
  if (!matchingPairsGameSessionExpired(roundAnchor, game.timer_seconds)) {
    return NextResponse.json({ expired: false, finished: false })
  }

  // Mark all non-finished players in this round as finished (timeout).
  // Their current pairs_matched / wrong_attempts are preserved as-is, and
  // finish_rank stays null so they receive no placement bonus (per spec §5.3).
  const now = new Date().toISOString()
  const { error: timeoutError } = await supabase
    .from('memory_match_progress')
    .update({ finished: true, finished_at: now, updated_at: now })
    .eq('round_id', roundId)
    .eq('finished', false)
  if (timeoutError) {
    return NextResponse.json({ error: 'Failed to finalize scores on timeout' }, { status: 500 })
  }

  // Mark the current round as finished.
  const { error: roundUpdateError } = await supabase
    .from('rounds')
    .update({ status: 'finished', ended_at: now })
    .eq('id', roundId)
  if (roundUpdateError) {
    return NextResponse.json({ error: 'Failed to end round on timeout' }, { status: 500 })
  }

  if (currentRoundNumber >= totalRounds) {
    // Last round — end the game.
    const { error: finishError } = await markGameFinished(supabase, gameId, now, { onlyIfActive: true })
    if (finishError) return NextResponse.json({ error: 'Failed to end game' }, { status: 500 })
    return NextResponse.json({ expired: true, finished: true })
  }

  // Non-final round — game stays active for auto-advance to the next round.
  return NextResponse.json({ expired: true, roundEnded: true, finished: false })
}
