import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const leaveSchema = z.object({ token: z.string().trim().min(4).max(100) })

/**
 * A player leaves a tournament from the lobby before it starts — giving up their
 * seat so their name frees up and the capacity count drops. Authenticated by the
 * player's own secret code (the one minted at join time), so a player can only
 * remove themselves, never someone else.
 *
 * Only allowed while the tournament is still 'waiting': once it's under way,
 * leaving would tear a hole in the bracket/standings, so we refuse and the player
 * plays on (or the host removes them). Deleting the player row cascades to their
 * token row, and there are no game rows yet to reference the player at this stage.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, leaveSchema)
  if (bodyError) return bodyError

  const token = body.token.trim()
  const admin = getSupabaseAdmin()

  const { data: tournament } = await admin
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .maybeSingle()
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.status !== 'waiting') {
    return NextResponse.json(
      {
        error:
          tournament.status === 'finished'
            ? 'Tournament has ended'
            : "The tournament has started — you can't leave now",
      },
      { status: 409 }
    )
  }

  // Resolve the seat from the private code. ilike is a case-fold exact match here
  // (the token has no % / _), mirroring player-resume so legacy lowercase codes work.
  const { data: tokenRow, error: tokenError } = await admin
    .from('tournament_player_tokens')
    .select('player_id')
    .eq('tournament_id', tournamentId)
    .ilike('token', token)
    .maybeSingle()
  if (tokenError) return NextResponse.json({ error: 'Failed to look up player code' }, { status: 500 })
  if (!tokenRow) {
    return NextResponse.json({ error: 'Player code not found' }, { status: 404 })
  }

  const { error: deleteError } = await admin
    .from('tournament_players')
    .delete()
    .eq('id', tokenRow.player_id)
    .eq('tournament_id', tournamentId)
  if (deleteError) {
    return NextResponse.json({ error: internalErrorMessage('tournaments/code/leave', deleteError) }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
