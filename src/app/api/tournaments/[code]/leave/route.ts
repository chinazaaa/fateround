import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAnon } from '@/lib/supabase-anon'

const supabase = getSupabaseAnon()

const leaveSchema = z.object({ token: z.string().trim().min(4).max(100) })

const LEAVE_ERRORS: Record<string, { message: string; status: number }> = {
  not_found: { message: 'Tournament not found', status: 404 },
  ended: { message: 'Tournament has ended', status: 409 },
  started: { message: "The tournament has started — you can't leave now", status: 409 },
  invalid_token: { message: 'Player code not found', status: 404 },
}

/**
 * A player leaves a tournament from the lobby before it starts — giving up their
 * seat so their name frees up and the capacity count drops. Authenticated by the
 * player's own secret code (minted at join), so a player can only remove
 * themselves, never someone else.
 *
 * The check + delete run inside one atomic RPC that locks the tournament row, so a
 * concurrent round start can't slip in and leave the bracket referencing a deleted
 * player — once the tournament is no longer 'waiting', the leave is refused.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const { data: body, error: bodyError } = await parseJsonBody(req, leaveSchema)
  if (bodyError) return bodyError

  const { data, error } = await supabase.rpc('leave_tournament', {
    p_tournament_id: tournamentId,
    p_token: body.token.trim(),
  })

  // Fail closed — a DB error must not read as a successful leave.
  if (error) {
    return NextResponse.json({ error: 'Failed to leave' }, { status: 500 })
  }

  const result = (data ?? {}) as { error?: string; ok?: boolean }
  if (result.error) {
    const mapped = LEAVE_ERRORS[result.error] ?? { message: 'Failed to leave', status: 400 }
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  return NextResponse.json({ ok: true })
}
