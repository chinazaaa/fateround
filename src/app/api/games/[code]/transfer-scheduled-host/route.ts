import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertHostGameSettings } from '@/lib/game-admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { fireHostTransferPushes } from '@/lib/scheduled-games'

/**
 * Discovery Phase C — transfer host on a scheduled game.
 *
 * Only while status='scheduled'. Once the game is `waiting`, the existing
 * in-lobby transfer-host flow takes over.
 *
 * Body: hostToken (current host) + newHostDeviceId (must have an RSVP).
 * The endpoint mints a fresh host_token and updates games.host_token so the
 * new host can drive settings changes; it also stamps games.host_player_id
 * to null (the new host hasn't seated yet — they'll pick their seat when
 * the lobby opens).
 *
 * Pushes: one to the new host (bypass quiet hours; missing strands them),
 * one to every OTHER RSVPer (respects quiet hours; informational).
 */

const schema = z.object({
  hostToken: z.string().min(1),
  newHostDeviceId: z.string().uuid(),
  oldHostName: z.string().max(60).optional(),
  newHostName: z.string().max(60).optional(),
})

function generateHostToken(): string {
  // Match src/lib/utils.ts generateToken shape — 24 base64-url chars.
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameCode = code.toUpperCase()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const auth = await assertHostGameSettings(admin, gameCode, parsed.data.hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const game = auth.game!
  if (game.status !== 'scheduled') {
    return NextResponse.json({ error: 'Transfer is only available before the game opens.' }, { status: 400 })
  }

  // The new host must be one of the current RSVPers.
  const { data: rsvp } = await admin
    .from('game_rsvps')
    .select('id')
    .eq('game_id', gameCode)
    .eq('device_id', parsed.data.newHostDeviceId)
    .maybeSingle()
  if (!rsvp) {
    return NextResponse.json({ error: 'The new host must have RSVP’d.' }, { status: 400 })
  }

  const newHostToken = generateHostToken()
  const { error } = await admin
    .from('games')
    .update({ host_token: newHostToken, host_player_id: null, last_activity_at: new Date().toISOString() })
    .eq('id', gameCode)
  if (error)
    return NextResponse.json({ error: internalErrorMessage('transfer-scheduled-host', error) }, { status: 500 })

  void fireHostTransferPushes(
    gameCode,
    String(game.game_type),
    parsed.data.oldHostName ?? 'The host',
    parsed.data.newHostName ?? 'the new host',
    parsed.data.newHostDeviceId
  ).catch(() => {})

  // The new host needs the token to drive future actions; return it so the
  // client can hand it off through the transfer confirmation dialog.
  return NextResponse.json({ ok: true, hostToken: newHostToken })
}
