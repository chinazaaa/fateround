import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isUnoGame } from '@/lib/game-types'
import { finishExpiredUnoGame, unoGameSessionExpired } from '@/lib/uno'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  // Service role: the finalization write hits RLS read-only uno tables.
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_type, session_started_at, game_duration_seconds, uno_team_mode, sessions_played')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isUnoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an UNO game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ expired: false, finished: game.status === 'finished' })
  }
  if (!unoGameSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    return NextResponse.json({ expired: false, finished: false })
  }

  const finish = await finishExpiredUnoGame(supabase, game)
  if (finish.error) return NextResponse.json({ error: 'Failed to end game' }, { status: 500 })
  // The expiry was decided about an earlier round (a rematch started): nothing was finished for it.
  if (finish.roundMismatch) {
    return NextResponse.json({ error: 'Game changed, please try again.' }, { status: 409 })
  }
  if (!finish.won) {
    // The finish lost its claim. Success only when the SAME round is confirmed finished (another finisher won); a
    // game that is still running (a move won the claim) or a different round (a rematch) is a conflict, not a failure.
    const { data: after } = await supabase
      .from('games')
      .select('status, sessions_played, session_started_at')
      .eq('id', gameId)
      .maybeSingle()
    const sameRound =
      !!after &&
      (after.sessions_played ?? null) === (game.sessions_played ?? null) &&
      (after.session_started_at ?? null) === (game.session_started_at ?? null)
    if (!(after?.status === 'finished' && sameRound)) {
      return NextResponse.json({ error: 'Game changed, please try again.' }, { status: 409 })
    }
  }

  return NextResponse.json({ expired: true, finished: true })
}
