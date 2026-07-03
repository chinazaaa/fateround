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

  const token = body.token.trim().toUpperCase()
  const admin = getSupabaseAdmin()

  const { data: tokenRow } = await admin
    .from('tournament_player_tokens')
    .select('player_id')
    .eq('tournament_id', tournamentId)
    .eq('token', token)
    .maybeSingle()
  if (!tokenRow) {
    return NextResponse.json({ error: 'Player code not found — check the code and try again' }, { status: 404 })
  }

  const { data: player } = await admin
    .from('tournament_players')
    .select('player_name, is_eliminated')
    .eq('id', tokenRow.player_id)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  return NextResponse.json({
    playerName: player.player_name,
    token,
    eliminated: player.is_eliminated === true,
  })
}
