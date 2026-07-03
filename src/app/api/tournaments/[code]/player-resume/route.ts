import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const resumeSchema = z.object({ token: z.string().trim().min(4).max(100) })

/**
 * Restore a tournament player on another device from their secret code. Given the
 * code, returns the player's canonical name (which the client re-saves along with
 * the code), so they pick up their identity + seat instead of joining fresh. The
 * code lives in a service-role-only table, so this admin lookup is the only way to
 * resolve it — it's never exposed to the browser otherwise.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, resumeSchema)
  if (bodyError) return bodyError

  // Match case-insensitively so legacy lowercase UUID codes still resolve alongside the
  // short uppercase codes; the input has no % / _ so ilike is an exact (case-fold) match.
  const token = body.token.trim()
  const admin = getSupabaseAdmin()

  const { data: tokenRow, error: tokenError } = await admin
    .from('tournament_player_tokens')
    .select('player_id, token')
    .eq('tournament_id', tournamentId)
    .ilike('token', token)
    .maybeSingle()
  // A query error (DB/RLS failure) must not masquerade as "not found".
  if (tokenError) return NextResponse.json({ error: 'Failed to look up player code' }, { status: 500 })
  if (!tokenRow) {
    return NextResponse.json({ error: 'Player code not found — check the code and try again' }, { status: 404 })
  }

  const { data: player, error: playerError } = await admin
    .from('tournament_players')
    .select('player_name, is_eliminated')
    .eq('id', tokenRow.player_id)
    .maybeSingle()
  if (playerError) return NextResponse.json({ error: 'Failed to look up player' }, { status: 500 })
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  return NextResponse.json({
    playerName: player.player_name,
    // Return the stored code (correct case) so the client saves what the game-join
    // reclaim will match exactly.
    token: tokenRow.token,
    eliminated: player.is_eliminated === true,
  })
}
