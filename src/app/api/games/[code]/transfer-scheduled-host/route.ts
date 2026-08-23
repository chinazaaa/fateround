import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertHostScheduledGame } from '@/lib/game-admin'
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
  const auth = await assertHostScheduledGame(admin, gameCode, parsed.data.hostToken)
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

  // Look up the new host's profile via their device (RSVPs key by device_id). Any signed-in
  // owner attached to the device becomes the game's host_user_id, so the /reclaim-host route
  // hands back the new token to them and NOT to the previous host. Null for a pure-guest
  // device just leaves host_user_id null, which is a fully supported state.
  const { data: deviceRow } = await admin
    .from('notification_subscriber_devices')
    .select('user_id')
    .eq('id', parsed.data.newHostDeviceId)
    .maybeSingle()
  const newHostUserId = (deviceRow as { user_id?: string | null } | null)?.user_id ?? null

  const newHostToken = generateHostToken()
  // Atomic guard: two racing transfers would both pass the auth read; the
  // predicate on the current host_token means only one row is updated, and
  // the loser sees a 409 instead of a silent stomp on the winner's token.
  const { data: updated, error } = await admin
    .from('games')
    .update({
      host_token: newHostToken,
      host_player_id: null,
      host_user_id: newHostUserId,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', gameCode)
    .eq('status', 'scheduled')
    .eq('host_token', parsed.data.hostToken)
    .select('id')
  if (error)
    return NextResponse.json({ error: internalErrorMessage('transfer-scheduled-host', error) }, { status: 500 })
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'This scheduled game just changed — refresh and try again.' }, { status: 409 })
  }

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
