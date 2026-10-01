import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { hostActionSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertHostWith } from '@/lib/game-admin'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data: body, error: bodyError } = await parseJsonBody(req, hostActionSchema)
  if (bodyError) return bodyError

  const { hostToken } = body
  const gameId = code.toUpperCase()

  const admin = getSupabaseAdmin()

  const auth = await assertHostWith(admin, gameId, hostToken, {
    allowedStatuses: ['active'],
    statusError: 'Game not active',
  })
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const game = auth.game

  const { data: activeRound } = await admin
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .maybeSingle()

  if (!activeRound) {
    const { data: pointerRound } = await admin
      .from('rounds')
      .select('round_number, status')
      .eq('game_id', gameId)
      .eq('round_number', game.current_round_number)
      .maybeSingle()

    if (pointerRound?.status === 'finished') {
      return NextResponse.json({
        finished: true,
        alreadyEnded: true,
        isLastRound: pointerRound.round_number >= game.rounds_count,
        roundNumber: pointerRound.round_number,
      })
    }

    return NextResponse.json({ error: 'No active round to end' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { error: endRoundError } = await admin
    .from('rounds')
    .update({ status: 'finished', ended_at: now })
    .eq('id', activeRound.id)

  if (endRoundError)
    return NextResponse.json({ error: internalErrorMessage('games/code/end-round', endRoundError) }, { status: 500 })

  const isLastRound = activeRound.round_number >= game.rounds_count
  return NextResponse.json({
    finished: true,
    isLastRound,
    roundNumber: activeRound.round_number,
  })
}
