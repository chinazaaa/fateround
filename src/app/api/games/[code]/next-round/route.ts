import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseGameType, isWhoSaidThis, isTriviaGame } from '@/lib/game-types'
import { hostActionSchema } from '@/lib/validation'
import { syncTriviaGameState } from '@/lib/trivia-advance'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = hostActionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken } = parsed.data

  const { data: game } = await getSupabaseAdmin().from('games').select('*').eq('id', code.toUpperCase()).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const gameId = code.toUpperCase()
  const gameType = parseGameType(game.game_type)

  if (isTriviaGame(gameType)) {
    const result = await syncTriviaGameState(getSupabaseAdmin(), gameId, { force: true })
    if (result.code === 'game_not_found') {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }
    if (!result.ok && result.code !== 'already_done') {
      return NextResponse.json({ error: 'Could not advance round', code: result.code }, { status: 409 })
    }
    return NextResponse.json({ success: true, nextRound: result.nextRound ?? game.current_round_number })
  }

  const { data: activeRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .maybeSingle()

  if (activeRound) {
    return NextResponse.json({ error: 'Current round must be ended before starting the next one' }, { status: 400 })
  }

  const nextRoundNumber = game.current_round_number + 1
  if (nextRoundNumber > game.rounds_count) {
    return NextResponse.json({ error: 'No more rounds' }, { status: 400 })
  }

  const { data: pendingRound } = await supabase
    .from('rounds')
    .select('quote_text, quote_submitted_at')
    .eq('game_id', gameId)
    .eq('round_number', nextRoundNumber)
    .maybeSingle()

  const now = new Date().toISOString()
  const activateUpdate: Record<string, string> = {
    status: 'active',
    started_at: now,
  }
  if (isWhoSaidThis(gameType) && pendingRound?.quote_text && !pendingRound.quote_submitted_at) {
    activateUpdate.quote_submitted_at = now
  }

  const admin = getSupabaseAdmin()

  await admin.from('rounds').update(activateUpdate).eq('game_id', gameId).eq('round_number', nextRoundNumber)

  const { error: pointerError } = await admin
    .from('games')
    .update({ current_round_number: nextRoundNumber })
    .eq('id', gameId)

  if (pointerError) {
    return NextResponse.json({ error: 'Failed to advance round' }, { status: 500 })
  }

  return NextResponse.json({ success: true, nextRound: nextRoundNumber })
}
