import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { tournamentHostActionSchema } from '@/lib/tournament-validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

const supabase = getSupabaseAnon()

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, tournamentHostActionSchema)
  if (bodyError) return bodyError

  const { hostToken } = body

  const { data: tournament } = await getSupabaseAdmin()
    .from('tournaments')
    .select('host_token, status')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }
  if (tournament.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: 'Tournament already finished' }, { status: 400 })
  }

  await supabase
    .from('tournament_games')
    .update({ status: 'finished' })
    .eq('tournament_id', tournamentId)
    .eq('status', 'active')

  // Close every open game room this tournament spawned so players aren't left sitting
  // in a live (or staged-but-unstarted) game after the host ends it. Direct status
  // flip — NOT markGameFinished — because we're force-ending: running the bracket /
  // score resolvers here would award wins and eliminations from incomplete games.
  const { data: linked } = await supabase
    .from('tournament_games')
    .select('game_id')
    .eq('tournament_id', tournamentId)
    .not('game_id', 'is', null)
  const gameIds = [...new Set((linked ?? []).map((r) => r.game_id).filter((id): id is string => Boolean(id)))]
  if (gameIds.length > 0) {
    await supabase.from('games').update({ status: 'finished' }).in('id', gameIds).neq('status', 'finished')
  }

  const { error } = await supabase.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)

  if (error) {
    return NextResponse.json({ error: internalErrorMessage('tournaments/code/finish', error) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
