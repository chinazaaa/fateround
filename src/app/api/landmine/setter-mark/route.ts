import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { isLandmineGame, parseGameType } from '@/lib/game-types'
import { gameLandmineMineSource, normalizeAnswer, parseLandmineMetadata, roundCallerPlayerId } from '@/lib/landmine'
import { landmineSetterMarkSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

/**
 * MANUAL mode only: the round's setter judges every answer at once (mirrors I Call On's
 * caller-approve). Each verdict lands on a self-mark row (marker = target = the answering player)
 * seeded at marking start, so it fits the marks table's UNIQUE(marker_player_id, round_id) and the
 * existing per-target scoring still applies. Setter-only; empty answers are force-Void server-side.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, landmineSetterMarkSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, verdicts } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isLandmineGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Landmine game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (gameLandmineMineSource(game) !== 'manual') {
    return NextResponse.json({ error: 'Setter marking is manual mode only' }, { status: 400 })
  }

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata || metadata.phase !== 'marking') {
    return NextResponse.json({ error: 'Not in marking phase' }, { status: 400 })
  }

  // Authorize by the secret resume_token; only the round's setter may judge.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (roundCallerPlayerId(round, metadata) !== auth.player.id) {
    return NextResponse.json({ error: 'Only the setter can judge this round' }, { status: 403 })
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
  const rows = verdicts
    .filter((v) => answerByPlayer.has(v.playerId))
    .map((v) => {
      // Empty answers are always Void — the setter can't hand out points for nothing.
      const clamped = normalizeAnswer(answerByPlayer.get(v.playerId)?.answer) ? v.valid : false
      return {
        game_id: code,
        round_id: roundId,
        marker_player_id: v.playerId,
        target_player_id: v.playerId,
        valid: clamped,
        marked_at: now,
      }
    })

  if (rows.length === 0) return NextResponse.json({ error: 'No valid verdicts' }, { status: 400 })

  const { error } = await supabase.from('landmine_marks').upsert(rows, { onConflict: 'marker_player_id,round_id' })
  if (error) return NextResponse.json({ error: internalErrorMessage('landmine/setter-mark', error) }, { status: 500 })
  return NextResponse.json({ success: true })
}
