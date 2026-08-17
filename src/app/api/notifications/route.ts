import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSubscriptionsForToken } from '@/lib/notification-subscriptions'
import { parseGameType } from '@/lib/game-types'

/**
 * Discovery Phase B — /api/notifications.
 *
 * The app has no accounts, so the "subscriber" identity is the device's push
 * token (Expo push token on mobile, PushSubscription endpoint URL on web).
 * Every request carries the token in the body (never in a query string — a
 * mistyped share link should not leak it).
 *
 * Endpoints:
 *   GET  /api/notifications?tokenKey=…   Read this device's subscriptions +
 *                                         quiet-hours snapshot + per-type
 *                                         "N public games in the last 24h".
 *   POST /api/notifications              Toggle a subscription on. Creates
 *                                         the device row on first call and
 *                                         upserts the (device, game_type)
 *                                         subscription.
 *   DELETE /api/notifications            Toggle a subscription off (or drop
 *                                         the whole device when body has no
 *                                         game_type — the "turn off
 *                                         notifications entirely" path).
 *   PATCH /api/notifications             Update quiet-hours + timezone on the
 *                                         device.
 */

const CHANNEL = z.enum(['mobile', 'web'])

const webKeysSchema = z.object({
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
})

const subscribeSchema = z.object({
  channel: CHANNEL,
  tokenKey: z.string().min(1).max(1000),
  gameType: z.string().min(1).max(64),
  platform: z.enum(['ios', 'android', 'unknown']).optional(),
  timezone: z.string().min(1).max(64).optional(),
  webKeys: webKeysSchema.optional(),
})

const unsubscribeSchema = z.object({
  tokenKey: z.string().min(1).max(1000),
  gameType: z.string().min(1).max(64).optional(),
})

const quietHoursSchema = z.object({
  tokenKey: z.string().min(1).max(1000),
  mode: z.enum(['off', 'quiet', 'available']).optional(),
  startMinutes: z.number().int().min(0).max(1439).nullable().optional(),
  endMinutes: z.number().int().min(0).max(1439).nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
})

const admin = getSupabaseAdmin()

export async function GET(req: NextRequest) {
  const tokenKey = req.nextUrl.searchParams.get('tokenKey')
  if (!tokenKey) return NextResponse.json({ error: 'tokenKey required' }, { status: 400 })

  const { device, subscribedGameTypes } = await getSubscriptionsForToken(admin, tokenKey)

  // Per-type activity counts for the last 24h — a small "N games today" signal
  // beside each toggle so users see whether the type is active before opting in.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await admin
    .from('games')
    .select('game_type')
    .eq('is_public', true)
    .gte('created_at', since)
    .gte('max_players', 2)
  const counts: Record<string, number> = {}
  for (const row of recent ?? []) {
    const t = String(row.game_type)
    counts[t] = (counts[t] ?? 0) + 1
  }

  return NextResponse.json({
    subscribedGameTypes,
    quietHours: device
      ? {
          mode: device.quiet_mode,
          startMinutes: device.quiet_start_minutes,
          endMinutes: device.quiet_end_minutes,
          timezone: device.timezone,
        }
      : { mode: 'off', startMinutes: null, endMinutes: null, timezone: null },
    countsByGameType: counts,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { channel, tokenKey, gameType, platform, timezone, webKeys } = parsed.data
  const type = parseGameType(gameType)

  // Web-channel devices must supply the two keys the VAPID sender needs; a mobile
  // channel never has them (Expo handles the crypto).
  if (channel === 'web' && !webKeys) {
    return NextResponse.json({ error: 'web channel requires webKeys' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: device, error: deviceError } = await admin
    .from('notification_subscriber_devices')
    .upsert(
      {
        channel,
        token_key: tokenKey,
        web_p256dh: webKeys?.p256dh ?? null,
        web_auth: webKeys?.auth ?? null,
        platform: platform ?? null,
        timezone: timezone ?? null,
        updated_at: now,
      },
      { onConflict: 'token_key' }
    )
    .select('id')
    .single()
  if (deviceError || !device) {
    return NextResponse.json({ error: internalErrorMessage('notifications', deviceError) }, { status: 500 })
  }

  const { error: subError } = await admin
    .from('notification_subscriptions')
    .upsert({ device_id: device.id, game_type: type }, { onConflict: 'device_id,game_type' })
  if (subError) {
    return NextResponse.json({ error: internalErrorMessage('notifications', subError) }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = unsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { tokenKey, gameType } = parsed.data

  const { data: device } = await admin
    .from('notification_subscriber_devices')
    .select('id')
    .eq('token_key', tokenKey)
    .maybeSingle()
  if (!device) return NextResponse.json({ ok: true })

  if (gameType) {
    const type = parseGameType(gameType)
    const { error } = await admin
      .from('notification_subscriptions')
      .delete()
      .eq('device_id', device.id)
      .eq('game_type', type)
    if (error) return NextResponse.json({ error: internalErrorMessage('notifications', error) }, { status: 500 })
  } else {
    // No game_type → the "master switch off" path: drop the device entirely,
    // which cascades to every subscription + dispatch log for it.
    const { error } = await admin.from('notification_subscriber_devices').delete().eq('id', device.id)
    if (error) return NextResponse.json({ error: internalErrorMessage('notifications', error) }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = quietHoursSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { tokenKey, mode, startMinutes, endMinutes, timezone } = parsed.data
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (mode !== undefined) update.quiet_mode = mode
  if (startMinutes !== undefined) update.quiet_start_minutes = startMinutes
  if (endMinutes !== undefined) update.quiet_end_minutes = endMinutes
  if (timezone !== undefined) update.timezone = timezone
  const { error } = await admin.from('notification_subscriber_devices').update(update).eq('token_key', tokenKey)
  if (error) return NextResponse.json({ error: internalErrorMessage('notifications', error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
