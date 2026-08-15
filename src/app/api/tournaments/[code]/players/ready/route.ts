import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveTournamentPlayerId } from '@/lib/tournament-token-lookup'

const readySchema = z.object({
  /** The player's secret resume token, same code they'd use to reclaim their
   *  seat from another device. Auth: proves the caller IS this player. */
  token: z.string().trim().min(4).max(100),
  /** New ready state — true = present-and-ready, false = revoke ready. */
  isReady: z.boolean(),
})

/**
 * Toggle a tournament player's "I'm ready" flag. Only meaningful for
 * scheduled events: hosts want a confirm-click before yanking pre-registered
 * players into a live game (someone registered a week ago whose phone is
 * face-down on a couch shouldn't get pulled in silently).
 *
 * Auth is by the player's own secret token — the same code the resume path
 * uses to reclaim a seat. The host can't set someone else's ready state; a
 * ready click is always an explicit action by the player themselves.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, readySchema)
  if (bodyError) return bodyError

  const admin = getSupabaseAdmin()

  const { playerId, error: tokenError } = await resolveTournamentPlayerId(admin, tournamentId, body.token.trim())
  if (tokenError) return NextResponse.json({ error: 'Failed to look up player code' }, { status: 500 })
  if (!playerId) {
    return NextResponse.json({ error: 'Player code not found — check the code and try again' }, { status: 404 })
  }

  const { error: updateError } = await admin
    .from('tournament_players')
    .update({ is_ready: body.isReady })
    .eq('id', playerId)
    .eq('tournament_id', tournamentId)
  if (updateError) return NextResponse.json({ error: 'Failed to update ready state' }, { status: 500 })

  return NextResponse.json({ ok: true, isReady: body.isReady })
}
