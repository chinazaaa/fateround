import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { computeAndFinishRound } from '@/lib/landmine-advance'
import { isLandmineGame, parseGameType } from '@/lib/game-types'
import { gameLandmineMineSource, normalizeAnswer, parseLandmineMetadata, roundCallerPlayerId } from '@/lib/landmine'
import { landmineSetterMarkSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import type { Game, Round } from '@/types'

/**
 * Review phase: the reviewer checks every answer and can override the peer verdict (mirrors I Call
 * On's caller review). In MANUAL mode the reviewer is the round's setter (authorized by their player
 * resume_token); in AUTO mode there's no setter, so the host reviews (authorized by host_token).
 * Overrides land on the existing per-target mark rows; empty answers are force-Void. Approving
 * finalizes the round (scores + reveal) right away — otherwise the review window expires and the
 * peer verdicts stand.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, landmineSetterMarkSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, hostToken, roundId, verdicts } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isLandmineGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Landmine game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata || metadata.phase !== 'review') {
    return NextResponse.json({ error: 'Not in the review phase' }, { status: 400 })
  }

  // Manual mode → the round's setter reviews (player resume_token). Auto mode → the host reviews
  // (host_token), since there's no setter.
  if (gameLandmineMineSource(game) === 'manual') {
    const auth = await assertPlayer(supabase, code, resumeToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (roundCallerPlayerId(round, metadata) !== auth.player.id) {
      return NextResponse.json({ error: 'Only the setter can review this round' }, { status: 403 })
    }
  } else {
    if (!hostToken || game.host_token !== hostToken) {
      return NextResponse.json({ error: 'Only the host can review this round' }, { status: 403 })
    }
  }

  // The answering players (setter sits out) are the only valid verdict targets this round.
  const { data: roundAnswers, error: answersError } = await supabase
    .from('landmine_answers')
    .select('player_id, answer, outcome')
    .eq('round_id', roundId)
  if (answersError) {
    return NextResponse.json({ error: internalErrorMessage('landmine/setter-mark', answersError) }, { status: 500 })
  }
  const answerByPlayer = new Map(
    (roundAnswers ?? []).filter((a) => a.outcome !== 'setter').map((a) => [a.player_id, a])
  )

  const now = new Date().toISOString()
  // Apply each override onto that target's existing peer-mark row. Empty answers can never be Valid.
  for (const v of verdicts) {
    const target = answerByPlayer.get(v.playerId)
    if (!target) continue
    const clamped = normalizeAnswer(target.answer) ? v.valid : false
    const { error } = await supabase
      .from('landmine_marks')
      .update({ valid: clamped, marked_at: now })
      .eq('round_id', roundId)
      .eq('target_player_id', v.playerId)
    if (error) {
      return NextResponse.json({ error: internalErrorMessage('landmine/setter-mark', error) }, { status: 500 })
    }
  }

  // The setter has judged — finalize the round now (scores + reveal) instead of waiting out the timer.
  const finished = await computeAndFinishRound(supabase, game as Game, round as Round)
  if (!finished) return NextResponse.json({ error: 'Failed to finalize round' }, { status: 500 })
  return NextResponse.json({ success: true })
}
