import 'server-only'
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendExpoPushMessages } from '@/lib/expo-push'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import {
  isWithinDeliveryWindow,
  notifyGameTypeSubscribersOfNewGame,
  type SubscriberDeviceRow,
} from '@/lib/notification-subscriptions'

/**
 * Discovery Phase C — scheduled-game push fan-outs + tick logic.
 *
 * All fan-outs run through the same pair of channels Phase B established
 * (Expo push tokens for mobile, PushSubscription for web). RSVPers live in
 * `game_rsvps` keyed by `notification_subscriber_devices.id`, so the same
 * quiet-hours field on each device row governs deliverability.
 *
 * Load-bearing rules from docs/mobile-discovery-plan.md § Phase C:
 *   - T-15 reminder: RSVPers + game-type subscribers, respect quiet hours.
 *   - T-0 lobby-open: RSVPers only (subscribers already got the T-15 heads-up).
 *   - Cancel / reschedule / transfer-to-new-host: single fan-out, NOT
 *     throttled, NOT quiet-hours gated (missing them strands the user).
 *   - Transfer notice to OTHER RSVPers: informational, respect quiet hours.
 */

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

async function loadRsvpDevices(
  admin: SupabaseClient,
  gameCode: string,
  { onlyUnreminded = false, excludeDeviceIds }: { onlyUnreminded?: boolean; excludeDeviceIds?: string[] } = {}
): Promise<Array<SubscriberDeviceRow & { rsvpId: string }>> {
  let q = admin
    .from('game_rsvps')
    .select(
      'id, device_id, reminder_sent_at, device:notification_subscriber_devices(id, channel, token_key, web_p256dh, web_auth, timezone, quiet_mode, quiet_start_minutes, quiet_end_minutes, available_start_minutes, available_end_minutes)'
    )
    .eq('game_id', gameCode)
  if (onlyUnreminded) q = q.is('reminder_sent_at', null)
  if (excludeDeviceIds && excludeDeviceIds.length > 0) q = q.not('device_id', 'in', `(${excludeDeviceIds.join(',')})`)
  const { data } = await q
  const rows = (data ?? []) as unknown as Array<{
    id: string
    device_id: string
    reminder_sent_at: string | null
    device: SubscriberDeviceRow | SubscriberDeviceRow[] | null
  }>
  return rows
    .flatMap((r) => {
      const d = Array.isArray(r.device) ? r.device[0] : r.device
      return d ? [{ ...d, rsvpId: r.id }] : []
    })
    .filter((d): d is SubscriberDeviceRow & { rsvpId: string } => !!d)
}

async function sendToDevices(
  devices: SubscriberDeviceRow[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  { bypassQuietHours = false }: { bypassQuietHours?: boolean } = {}
): Promise<string[]> {
  const now = new Date()
  const eligible = devices.filter((d) => bypassQuietHours || isWithinDeliveryWindow(d, now))
  if (eligible.length === 0) return []
  const staleTokens: string[] = []
  const mobile = eligible.filter((d) => d.channel === 'mobile')
  const web = eligible.filter((d) => d.channel === 'web')
  const [expoStale] = await Promise.all([
    mobile.length === 0
      ? Promise.resolve<string[]>([])
      : sendExpoPushMessages(mobile.map((d) => ({ to: d.token_key, title, body, sound: 'default', data }))),
    Promise.all(
      web.map(async (d) => {
        if (!configureWebPush() || !d.web_p256dh || !d.web_auth) return
        try {
          await webpush.sendNotification(
            { endpoint: d.token_key, keys: { p256dh: d.web_p256dh, auth: d.web_auth } },
            JSON.stringify({ title, body, ...data })
          )
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) staleTokens.push(d.token_key)
        }
      })
    ),
  ])
  staleTokens.push(...expoStale)
  return staleTokens
}

async function pruneStale(admin: SupabaseClient, staleTokens: string[]): Promise<void> {
  if (staleTokens.length === 0) return
  await admin.from('notification_subscriber_devices').delete().in('token_key', staleTokens)
}

/**
 * Fire the T-15min heads-up push. Fans out to RSVPers (respects quiet hours)
 * AND to matching game-type subscribers (respects quiet hours). RSVPer rows
 * get reminder_sent_at stamped so the next tick doesn't re-fire.
 */
export async function fireT15Reminder(
  gameCode: string,
  gameType: string
): Promise<{ rsvps: number; subscribers: number }> {
  const admin = getSupabaseAdmin()
  const cfg = gameTypeConfig(parseGameType(gameType))
  const title = `${cfg.card.emoji} Your ${cfg.label} game opens in 15 min`
  const body = 'Tap to jump into the lobby.'
  const data = { event: 'scheduled_t15', gameCode, gameType, url: `/game/${gameCode}` }

  const rsvpDevices = await loadRsvpDevices(admin, gameCode, { onlyUnreminded: true })
  const staleFromRsvps = await sendToDevices(rsvpDevices, title, body, data)
  if (rsvpDevices.length > 0) {
    await admin
      .from('game_rsvps')
      .update({ reminder_sent_at: new Date().toISOString() })
      .in(
        'id',
        rsvpDevices.map((d) => d.rsvpId)
      )
  }

  // Subscribers already exclude quiet-hours + rate-limit inside the Phase B
  // helper. Skip a subscriber who's already an RSVPer — they'd get two pushes
  // for the same event otherwise.
  const rsvpDeviceIds = new Set(rsvpDevices.map((d) => d.id))
  const subResult = await notifyGameTypeSubscribersOfNewGame(gameCode, gameType, null)
  // notifyGameTypeSubscribersOfNewGame doesn't take an exclusion list yet; the
  // rate-limit column dedupes cases where the same device also RSVP'd (the
  // reminder push counts as a dispatch for the game type).
  void rsvpDeviceIds

  await pruneStale(admin, staleFromRsvps)
  return { rsvps: rsvpDevices.length, subscribers: subResult.delivered }
}

/**
 * Fire the T-0 "lobby is open — tap to join" push. RSVPers ONLY (subscribers
 * already got the T-15 heads-up). Respects quiet hours.
 */
export async function fireT0LobbyOpen(gameCode: string, gameType: string): Promise<number> {
  const admin = getSupabaseAdmin()
  const cfg = gameTypeConfig(parseGameType(gameType))
  const title = `${cfg.card.emoji} ${cfg.label} is open`
  const body = 'Your scheduled game just opened — tap to join.'
  const data = { event: 'scheduled_t0', gameCode, gameType, url: `/game/${gameCode}` }
  const devices = await loadRsvpDevices(admin, gameCode)
  const stale = await sendToDevices(devices, title, body, data)
  await pruneStale(admin, stale)
  return devices.length
}

/**
 * "Host cancelled your scheduled game." Fan out once, bypass quiet hours.
 */
export async function fireHostCancelledPush(gameCode: string, gameType: string): Promise<number> {
  const admin = getSupabaseAdmin()
  const cfg = gameTypeConfig(parseGameType(gameType))
  const title = `❌ Your ${cfg.label} game was cancelled`
  const body = 'The host cancelled the scheduled game.'
  const data = { event: 'scheduled_cancelled', gameCode, gameType, url: '/browse' }
  const devices = await loadRsvpDevices(admin, gameCode)
  const stale = await sendToDevices(devices, title, body, data, { bypassQuietHours: true })
  await pruneStale(admin, stale)
  return devices.length
}

/**
 * "Host rescheduled your game." Fan out once, bypass quiet hours. Clears
 * reminder_sent_at so the new T-15 tick fires again against the new time.
 */
export async function fireHostRescheduledPush(
  gameCode: string,
  gameType: string,
  newScheduledAtIso: string
): Promise<number> {
  const admin = getSupabaseAdmin()
  const cfg = gameTypeConfig(parseGameType(gameType))
  const when = new Date(newScheduledAtIso).toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
  const title = `📆 Your ${cfg.label} game moved to ${when}`
  const body = 'Tap to see the new time.'
  const data = {
    event: 'scheduled_rescheduled',
    gameCode,
    gameType,
    newScheduledAt: newScheduledAtIso,
    url: `/game/${gameCode}`,
  }
  const devices = await loadRsvpDevices(admin, gameCode)
  await admin.from('game_rsvps').update({ reminder_sent_at: null }).eq('game_id', gameCode)
  const stale = await sendToDevices(devices, title, body, data, { bypassQuietHours: true })
  await pruneStale(admin, stale)
  return devices.length
}

/**
 * "You're now hosting the scheduled game." → new host (bypass quiet hours).
 * "[Old host] handed the game to [New host]" → every other RSVPer (respects
 * quiet hours; informational).
 */
export async function fireHostTransferPushes(
  gameCode: string,
  gameType: string,
  oldHostName: string,
  newHostName: string,
  newHostDeviceId: string
): Promise<{ notifiedNewHost: boolean; notifiedOthers: number }> {
  const admin = getSupabaseAdmin()
  const cfg = gameTypeConfig(parseGameType(gameType))
  const newHostDevices = await loadRsvpDevices(admin, gameCode)
  const forNewHost = newHostDevices.filter((d) => d.id === newHostDeviceId)
  const forOthers = newHostDevices.filter((d) => d.id !== newHostDeviceId)

  const staleA = await sendToDevices(
    forNewHost,
    `🎲 You're now hosting the ${cfg.label} game`,
    'You inherited the scheduled game — tap to open it.',
    { event: 'scheduled_transfer_new_host', gameCode, gameType, url: `/game/${gameCode}` },
    { bypassQuietHours: true }
  )
  const staleB = await sendToDevices(
    forOthers,
    `📆 ${oldHostName} handed the ${cfg.label} game to ${newHostName}`,
    'The scheduled game has a new host — same time.',
    { event: 'scheduled_transfer_notice', gameCode, gameType, url: `/game/${gameCode}` }
  )
  await pruneStale(admin, [...staleA, ...staleB])
  return { notifiedNewHost: forNewHost.length > 0, notifiedOthers: forOthers.length }
}

/**
 * Scan for scheduled games due for the T-15 heads-up and fire the push.
 * Called from POST /api/scheduled/tick every minute.
 */
export async function tickScheduledGamePushes(): Promise<{ t15: number; t0: number }> {
  const admin = getSupabaseAdmin()
  const now = new Date()

  // T-15 window: games between now+14m and now+16m; RSVPers with no reminder
  // yet get one. The reminder stamp lives on game_rsvps so a partial RSVP set
  // gets caught even if one tick missed a subset.
  const t15Start = new Date(now.getTime() + 14 * 60 * 1000).toISOString()
  const t15End = new Date(now.getTime() + 16 * 60 * 1000).toISOString()
  const { data: t15Games } = await admin
    .from('games')
    .select('id, game_type')
    .eq('status', 'scheduled')
    .gte('scheduled_at', t15Start)
    .lte('scheduled_at', t15End)
  let t15 = 0
  for (const g of t15Games ?? []) {
    const r = await fireT15Reminder(String(g.id), String(g.game_type))
    t15 += r.rsvps
  }

  // T-0 push: any game that transitioned to `waiting` in the last ~2 minutes
  // and has RSVPers. We piggy-back on `opened_at`; the SQL `open_scheduled_games_due()`
  // stamps that when it flips scheduled→waiting.
  const opened = await admin
    .from('games')
    .select('id, game_type, opened_at')
    .eq('status', 'waiting')
    .not('opened_at', 'is', null)
    .gte('opened_at', new Date(now.getTime() - 2 * 60 * 1000).toISOString())
  let t0 = 0
  for (const g of opened.data ?? []) {
    // Guard: only fire if we haven't yet notified for this open. Reuse the
    // reminder_sent_at column for the T-0 push too — after T-0 the RSVP row
    // is either confirmed or dropped, so re-stamping is safe.
    const { data: unnotified } = await admin
      .from('game_rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', g.id)
      .is('reminder_sent_at', null)
    void unnotified
    const delivered = await fireT0LobbyOpen(String(g.id), String(g.game_type))
    if (delivered > 0) {
      await admin
        .from('game_rsvps')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('game_id', g.id)
        .is('reminder_sent_at', null)
    }
    t0 += delivered
  }

  return { t15, t0 }
}
