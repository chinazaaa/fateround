import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Discovery Phase C — "I'm ready" in the lobby.
 *
 * Called after the scheduled game has flipped to `waiting`. Stamps
 * game_rsvps.confirmed_at so the 10-minute unconfirmed-drop cron leaves the
 * row alone. Idempotent; a repeat call just re-stamps the timestamp.
 */

const schema = z.object({ tokenKey: z.string().min(1).max(1000) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameCode = code.toUpperCase()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: device } = await admin
    .from('notification_subscriber_devices')
    .select('id')
    .eq('token_key', parsed.data.tokenKey)
    .maybeSingle()
  if (!device) return NextResponse.json({ error: 'No RSVP found for this device.' }, { status: 404 })

  const { error } = await admin
    .from('game_rsvps')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('game_id', gameCode)
    .eq('device_id', device.id)
  if (error) return NextResponse.json({ error: internalErrorMessage('rsvp-confirm', error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
