import 'server-only'
import { after } from 'next/server'
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendExpoPushMessages } from '@/lib/expo-push'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'

/**
 * Discovery Phase B — per-game-type subscription fan-out.
 *
 * When a game flips to `is_public = true` (either at create or via a
 * settings PATCH), notify every subscriber whose subscription matches the
 * game's type. Deduped in-DB by `notification_dispatches` (at most one push
 * per subscriber per game type per 30 minutes) and gated by each device's
 * quiet/available hours (drop, don't queue — see plan §Phase B).
 *
 * Runs in `after()` where possible so the HTTP response doesn't wait on the
 * fan-out — a subscriber list of a few thousand still finishes in under a
 * second, but there's no reason the create-game path should block on it.
 */

const RATE_LIMIT_MS = 30 * 60 * 1000
const CHANNEL_MOBILE = 'mobile'
const CHANNEL_WEB = 'web'

export type SubscriberDeviceRow = {
  id: string
  channel: 'mobile' | 'web'
  token_key: string
  web_p256dh: string | null
  web_auth: string | null
  timezone: string | null
  quiet_mode: 'off' | 'quiet' | 'available'
  quiet_start_minutes: number | null
  quiet_end_minutes: number | null
}

let vapidConfigured: boolean | null = null

function configureWebPush(): boolean {
  if (vapidConfigured !== null) return vapidConfigured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:hello@fateround.com'
  if (!publicKey || !privateKey) {
    vapidConfigured = false
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

/**
 * Compute local minutes-since-midnight for a device in its stored IANA zone.
 * Falls back to UTC if the zone is missing or invalid — the quiet-hours check
 * then still runs but against UTC clock time, which is intentional (rather
 * than "no quiet hours ever" which would send at the wrong hours).
 */
function localMinutesForDevice(device: SubscriberDeviceRow, now = new Date()): number {
  const tz = device.timezone || 'UTC'
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now)
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
    return hour * 60 + minute
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes()
  }
}

/**
 * True when this push may be delivered to this device given its quiet-hours
 * setting. Off → always. Quiet → drop if inside the window. Available → drop
 * if outside the window. Windows that wrap midnight (e.g. 22:00–06:00) work
 * either way — `start > end` means "wraps past midnight".
 */
export function isWithinDeliveryWindow(device: SubscriberDeviceRow, now = new Date()): boolean {
  if (device.quiet_mode === 'off') return true
  if (device.quiet_start_minutes == null || device.quiet_end_minutes == null) return true
  const local = localMinutesForDevice(device, now)
  const start = device.quiet_start_minutes
  const end = device.quiet_end_minutes
  const inWindow = start <= end ? local >= start && local < end : local >= start || local < end
  return device.quiet_mode === 'quiet' ? !inWindow : inWindow
}

async function sendWebPushOne(device: SubscriberDeviceRow, payload: object): Promise<{ stale: boolean }> {
  if (!configureWebPush() || !device.web_p256dh || !device.web_auth) return { stale: false }
  try {
    await webpush.sendNotification(
      { endpoint: device.token_key, keys: { p256dh: device.web_p256dh, auth: device.web_auth } },
      JSON.stringify(payload)
    )
    return { stale: false }
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    return { stale: statusCode === 404 || statusCode === 410 }
  }
}

async function sendExpoPushBatch(
  devices: SubscriberDeviceRow[],
  payload: { title: string; body: string; data: Record<string, unknown> }
): Promise<string[]> {
  if (devices.length === 0) return []
  return sendExpoPushMessages(
    devices.map((d) => ({
      to: d.token_key,
      title: payload.title,
      body: payload.body,
      sound: 'default',
      data: payload.data,
    }))
  )
}

/**
 * Fan out a "new Public game opened" push to every device subscribed to the
 * game's type. Rate-limit + quiet-hours gates run per-device.
 *
 * @param gameCode The (uppercased) game code; deep-linked in the push data.
 * @param gameType The game type ("monopoly", "whot", …). Only matching subs get a push.
 * @param hostName Optional host display name for the body copy.
 */
export async function notifyGameTypeSubscribersOfNewGame(
  gameCode: string,
  gameType: string,
  hostName?: string | null
): Promise<{ delivered: number; skipped: number }> {
  const admin = getSupabaseAdmin()
  const type = parseGameType(gameType)

  const { data: subs } = await admin
    .from('notification_subscriptions')
    .select(
      'device:notification_subscriber_devices(id, channel, token_key, web_p256dh, web_auth, timezone, quiet_mode, quiet_start_minutes, quiet_end_minutes)'
    )
    .eq('game_type', type)

  // Supabase's inferred type for a nested select can be either an object or an
  // array (depending on the relationship shape it detected) — cast through
  // unknown to accept both and normalise below.
  const rows = (subs ?? []) as unknown as Array<{ device: SubscriberDeviceRow | SubscriberDeviceRow[] | null }>
  const devices = rows
    .flatMap((r) => (Array.isArray(r.device) ? r.device : r.device ? [r.device] : []))
    .filter((d): d is SubscriberDeviceRow => !!d)
  if (devices.length === 0) return { delivered: 0, skipped: 0 }

  const now = new Date()
  const cutoffIso = new Date(now.getTime() - RATE_LIMIT_MS).toISOString()
  const deviceIds = devices.map((d) => d.id)

  const { data: recentDispatches } = await admin
    .from('notification_dispatches')
    .select('device_id, sent_at')
    .eq('game_type', type)
    .in('device_id', deviceIds)
    .gt('sent_at', cutoffIso)

  const rateLimited = new Set((recentDispatches ?? []).map((r) => r.device_id as string))

  const cfg = gameTypeConfig(type)
  const label = cfg.label
  const emoji = cfg.card.emoji
  const title = `${emoji} A new ${label} game just opened`
  const body = hostName ? `${hostName} is hosting — tap to jump in.` : 'Tap to jump in.'
  const data = { event: 'public_game_opened', gameType: type, gameCode, url: `/game/${gameCode}` }

  const eligible = devices.filter((d) => !rateLimited.has(d.id) && isWithinDeliveryWindow(d, now))
  if (eligible.length === 0) return { delivered: 0, skipped: devices.length }

  const staleTokens: string[] = []
  const mobile = eligible.filter((d) => d.channel === CHANNEL_MOBILE)
  const web = eligible.filter((d) => d.channel === CHANNEL_WEB)

  const [expoStale] = await Promise.all([
    sendExpoPushBatch(mobile, { title, body, data }),
    Promise.all(web.map((d) => sendWebPushOne(d, { title, body, ...data }))).then((results) => {
      results.forEach((r, i) => {
        if (r.stale) staleTokens.push(web[i]!.token_key)
      })
    }),
  ])
  staleTokens.push(...expoStale)

  // Stamp the rate-limit log for every successful send (best-effort insert —
  // a failed insert just means the next opened game might re-notify a moment
  // early, which is far better than a stuck send loop).
  const now2 = new Date().toISOString()
  const dispatchRows = eligible.map((d) => ({
    device_id: d.id,
    game_type: type,
    game_id: gameCode,
    sent_at: now2,
  }))
  if (dispatchRows.length > 0) {
    await admin.from('notification_dispatches').insert(dispatchRows)
  }

  if (staleTokens.length > 0) {
    await admin.from('notification_subscriber_devices').delete().in('token_key', staleTokens)
  }

  return { delivered: eligible.length, skipped: devices.length - eligible.length }
}

/**
 * Convenience wrapper used by the game-create + settings PATCH routes. Runs
 * the fan-out via next/server's `after()` when available so the HTTP response
 * doesn't wait on it; falls back to fire-and-forget otherwise.
 */
export function scheduleNewPublicGameFanout(gameCode: string, gameType: string, hostName?: string | null): void {
  const run = () => {
    void notifyGameTypeSubscribersOfNewGame(gameCode.toUpperCase(), gameType, hostName).catch((err) => {
      console.error('notifyGameTypeSubscribersOfNewGame failed', err)
    })
  }
  try {
    after(run)
  } catch {
    run()
  }
}

/**
 * Return the caller's subscriptions + quiet-hours snapshot, keyed by the
 * device's token (Expo push token on mobile, PushSubscription endpoint on web).
 * Powers GET /api/notifications.
 */
export async function getSubscriptionsForToken(
  admin: SupabaseClient,
  tokenKey: string
): Promise<{
  device: SubscriberDeviceRow | null
  subscribedGameTypes: string[]
}> {
  const { data: device } = await admin
    .from('notification_subscriber_devices')
    .select(
      'id, channel, token_key, web_p256dh, web_auth, timezone, quiet_mode, quiet_start_minutes, quiet_end_minutes'
    )
    .eq('token_key', tokenKey)
    .maybeSingle()
  if (!device) return { device: null, subscribedGameTypes: [] }
  const { data: subs } = await admin.from('notification_subscriptions').select('game_type').eq('device_id', device.id)
  return {
    device: device as SubscriberDeviceRow,
    subscribedGameTypes: (subs ?? []).map((s) => s.game_type as string),
  }
}
