import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Discovery Phase C — RSVP endpoint for a scheduled game.
 *
 * Identity is the device's push token (same model as Phase B). If the device
 * hasn't been seen before, we mint a bare `notification_subscriber_devices`
 * row for it — the device may not have subscribed to any game type, but a
 * bare row still gives us stable RSVP + quiet-hours storage.
 *
 * POST   -> RSVP (upsert on (game_id, device_id))
 * DELETE -> Un-RSVP (silent; no push per plan)
 */

const rsvpSchema = z.object({
  channel: z.enum(['mobile', 'web']),
  tokenKey: z.string().min(1).max(1000),
  webKeys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }).optional(),
  platform: z.enum(['ios', 'android', 'unknown']).optional(),
  timezone: z.string().min(1).max(64).optional(),
  // Optional display name so the host's Transfer picker has something
  // readable to show. Trimmed + capped server-side; empty means anonymous.
  displayName: z.string().max(60).optional(),
})

const unrsvpSchema = z.object({
  tokenKey: z.string().min(1).max(1000),
})

async function ensureDeviceId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  input: z.infer<typeof rsvpSchema>
): Promise<string> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('notification_subscriber_devices')
    .upsert(
      {
        channel: input.channel,
        token_key: input.tokenKey,
        web_p256dh: input.webKeys?.p256dh ?? null,
        web_auth: input.webKeys?.auth ?? null,
        platform: input.platform ?? null,
        timezone: input.timezone ?? null,
        updated_at: now,
      },
      { onConflict: 'token_key' }
    )
    .select('id')
    .single()
  if (error || !data) throw new Error(internalErrorMessage('rsvp', error))
  return data.id as string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameCode = code.toUpperCase()
  const body = await req.json().catch(() => null)
  const parsed = rsvpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  if (parsed.data.channel === 'web' && !parsed.data.webKeys) {
    return NextResponse.json({ error: 'web channel requires webKeys' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // The game must exist AND be in a state where RSVP makes sense. A game
  // that already opened (status='waiting'), finished, or is private has no
  // RSVP audience — refuse to store one that can never fire.
  const { data: game } = await admin
    .from('games')
    .select('id, status, is_public, scheduled_at')
    .eq('id', gameCode)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'scheduled') return NextResponse.json({ error: 'This game is not scheduled' }, { status: 400 })
  if (game.is_public !== true) return NextResponse.json({ error: 'Only Public games accept RSVPs' }, { status: 400 })

  const deviceId = await ensureDeviceId(admin, parsed.data)
  const rawName = (parsed.data.displayName ?? '').trim().slice(0, 60)
  const displayName = rawName.length > 0 ? rawName : null
  const { error } = await admin
    .from('game_rsvps')
    .upsert({ game_id: gameCode, device_id: deviceId, display_name: displayName }, { onConflict: 'game_id,device_id' })
  if (error) return NextResponse.json({ error: internalErrorMessage('rsvp', error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameCode = code.toUpperCase()
  const body = await req.json().catch(() => null)
  const parsed = unrsvpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: device } = await admin
    .from('notification_subscriber_devices')
    .select('id')
    .eq('token_key', parsed.data.tokenKey)
    .maybeSingle()
  if (!device) return NextResponse.json({ ok: true })

  await admin.from('game_rsvps').delete().eq('game_id', gameCode).eq('device_id', device.id)
  return NextResponse.json({ ok: true })
}

// Check whether the caller has an RSVP for this game (and confirmed state).
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameCode = code.toUpperCase()
  const tokenKey = req.nextUrl.searchParams.get('tokenKey')
  if (!tokenKey) return NextResponse.json({ rsvped: false, confirmed: false, rsvpCount: 0 })

  const admin = getSupabaseAdmin()
  const [{ data: device }, { count: totalCount }] = await Promise.all([
    admin.from('notification_subscriber_devices').select('id').eq('token_key', tokenKey).maybeSingle(),
    admin.from('game_rsvps').select('id', { count: 'exact', head: true }).eq('game_id', gameCode),
  ])
  if (!device) return NextResponse.json({ rsvped: false, confirmed: false, rsvpCount: totalCount ?? 0 })

  const { data: row } = await admin
    .from('game_rsvps')
    .select('confirmed_at')
    .eq('game_id', gameCode)
    .eq('device_id', device.id)
    .maybeSingle()
  return NextResponse.json({
    rsvped: !!row,
    confirmed: !!row?.confirmed_at,
    rsvpCount: totalCount ?? 0,
  })
}
