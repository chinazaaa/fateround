import { NextRequest, NextResponse } from 'next/server'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertTournamentHostAny } from '@/lib/tournament-admin'
import { tournamentHostActionSchema } from '@/lib/tournament-validation'

const RESTART_ERRORS: Record<string, { message: string; status: number }> = {
  not_found: { message: 'Tournament not found', status: 404 },
  not_finished: { message: 'Only a finished tournament can be restarted', status: 409 },
}

/**
 * Host restarts a finished tournament — the same roster goes back into a fresh
 * 'waiting' lobby with scores/eliminations/lives reset and the round history wiped,
 * ready to run again. Config (format, game, settings, players) is kept.
 *
 * Host is authenticated here; the reset itself runs in one atomic RPC that locks the
 * tournament row and re-checks state, so it can't half-apply or race a finish/start.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, tournamentHostActionSchema)
  if (bodyError) return bodyError

  const { hostToken } = body

  // No status gate here: "is it finished?" is re-checked inside the RPC below, under the
  // row lock, so it can't race a concurrent finish/start.
  const auth = await assertTournamentHostAny(getSupabaseAdmin(), code, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await getSupabaseAdmin().rpc('restart_tournament', { p_tournament_id: tournamentId })

  // Fail closed — a DB error must not read as a successful restart.
  if (error) {
    return NextResponse.json({ error: 'Failed to restart tournament' }, { status: 500 })
  }

  const result = (data ?? {}) as { error?: string; ok?: boolean }
  if (result.error) {
    const mapped = RESTART_ERRORS[result.error] ?? { message: 'Failed to restart tournament', status: 400 }
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  return NextResponse.json({ success: true })
}
