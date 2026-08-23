import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  isWithinDeliveryWindow,
  sendExpoPushBatch,
  sendWebPushOne,
  type SubscriberDeviceRow,
} from '@/lib/notification-subscriptions'
import { FREEZE_MAX_HELD, streakStatus, watDate, type StreakStanding } from '@/lib/trophies/streak'

/**
 * The come-back nudge: one push, once a day, to players whose streak lapses tonight.
 *
 * `docs/trophies-and-streaks.md` §4.5 calls this "the single most important re-engagement
 * trigger", and it was the one part of the streak feature with nothing behind it. The streak
 * was computed, stored, and — until this batch — displayed, but nobody was ever told it was
 * about to end. A streak you only discover you lost is a punishment, not a habit.
 *
 * ── Why this needed no new tables ────────────────────────────────────────────
 * The obvious blocker is that push tokens are per-GAME (`push_subscriptions`,
 * `mobile_push_tokens` both key on a NOT NULL player_id), so there is no channel to reach a
 * player outside a game. But Discovery Phase B's `notification_subscriber_devices` is a
 * device-level channel, and `20261021120000_identity_on_games_players_devices.sql` already
 * added `user_id` to it — the same id as `profiles.id`. So the join exists; nothing had used
 * it in this direction yet.
 *
 * Reuses the same machinery as the public-game fan-out, deliberately: per-device quiet hours
 * (drop, never queue) and `notification_dispatches` for the at-most-once gate.
 */

/**
 * Dispatch bucket for the reminder. `notification_dispatches.game_type` is free text with no
 * FK, and the double underscore keeps it from ever colliding with a real `GameType`.
 */
export const STREAK_DISPATCH_KEY = '__streak_reminder'

/**
 * One reminder per device per 20 hours. Under a day, so a daily job never skips a player
 * because it ran a few minutes early; well over the hourly dispatch cleanup's 24-hour
 * retention, so the row it reads is still there.
 */
const REMIND_EVERY_MS = 20 * 60 * 60 * 1000

/** How far back a streak can be resumed at all: one day per freeze, plus yesterday. */
export const OLDEST_RESUMABLE_DAYS = FREEZE_MAX_HELD + 1

export type StreakProfileRow = {
  id: string
  handle: string | null
  current_streak: number
  last_active_date: string | null
  streak_freezes: number
}

export type StreakReminder = { profileId: string; streak: number; standing: StreakStanding; body: string }

/**
 * Who gets a nudge, and what it says. Pure, so the interesting decisions are testable without
 * a database or a push service.
 *
 * Only `at_risk` and `frozen` qualify. `safe` has already played today, `none` has no streak,
 * and `broken` is a message about something already lost — which reads as a reprimand and is
 * the fastest way to teach someone to disable notifications.
 */
export function selectStreakReminders(profiles: StreakProfileRow[], today: string = watDate()): StreakReminder[] {
  const out: StreakReminder[] = []
  for (const p of profiles) {
    const { standing, streak, freezes } = streakStatus(p, today)
    if (standing !== 'at_risk' && standing !== 'frozen') continue
    out.push({
      profileId: p.id,
      streak,
      standing,
      body:
        standing === 'frozen'
          ? `A freeze is holding your ${streak}-day streak. Play today so it doesn't cost another.`
          : freezes > 0
            ? `Your ${streak}-day streak ends tonight — play a round, or spend a freeze.`
            : `Your ${streak}-day streak ends tonight. One game keeps it alive.`,
    })
  }
  return out
}

const DEVICE_COLUMNS =
  'id, channel, token_key, web_p256dh, web_auth, timezone, quiet_mode, quiet_start_minutes, quiet_end_minutes, available_start_minutes, available_end_minutes, user_id'

/**
 * Find every at-risk streak and push its owner once. Returns counts for the cron's response.
 *
 * Best-effort throughout: a failure to reach one device must not stop the rest, and no part of
 * this is allowed to touch the streak data itself.
 */
export async function sendStreakReminders(
  admin: SupabaseClient = getSupabaseAdmin(),
  now: Date = new Date()
): Promise<{ candidates: number; sent: number; skipped: number }> {
  const today = watDate(now)
  // Narrow in SQL to the only window that can still be saved, then decide precisely in
  // `selectStreakReminders` — the exact rule (how many freezes cover how many days) belongs in
  // one tested place, not duplicated as a date predicate.
  const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - OLDEST_RESUMABLE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const { data: rows } = await admin
    .from('profiles')
    .select('id, handle, current_streak, last_active_date, streak_freezes')
    .gt('current_streak', 0)
    .gte('last_active_date', oldest)
    .lt('last_active_date', today)
    .limit(5000)

  const reminders = selectStreakReminders((rows ?? []) as StreakProfileRow[], today)
  if (reminders.length === 0) return { candidates: 0, sent: 0, skipped: 0 }

  const byProfile = new Map(reminders.map((r) => [r.profileId, r]))
  const { data: deviceRows } = await admin
    .from('notification_subscriber_devices')
    .select(DEVICE_COLUMNS)
    .in('user_id', [...byProfile.keys()])

  const devices = (deviceRows ?? []) as unknown as SubscriberDeviceRow[]
  if (devices.length === 0) return { candidates: reminders.length, sent: 0, skipped: 0 }

  // At-most-once gate, same table the public-game fan-out uses.
  const cutoff = new Date(now.getTime() - REMIND_EVERY_MS).toISOString()
  const { data: recent } = await admin
    .from('notification_dispatches')
    .select('device_id')
    .eq('game_type', STREAK_DISPATCH_KEY)
    .in(
      'device_id',
      devices.map((d) => d.id)
    )
    .gt('sent_at', cutoff)
  const alreadySent = new Set((recent ?? []).map((r) => r.device_id as string))

  const eligible = devices.filter(
    (d) => d.user_id && byProfile.has(d.user_id) && !alreadySent.has(d.id) && isWithinDeliveryWindow(d, now)
  )
  const skipped = devices.length - eligible.length
  if (eligible.length === 0) return { candidates: reminders.length, sent: 0, skipped }

  const payloadFor = (d: SubscriberDeviceRow) => {
    const r = byProfile.get(d.user_id!)!
    return {
      title: r.standing === 'frozen' ? 'Your streak is on a freeze 🧊' : `${r.streak}-day streak 🔥`,
      body: r.body,
      // Home, not a specific game: any finished game keeps the streak, so sending them to one
      // in particular would be an arbitrary choice presented as the requirement.
      data: { event: 'streak_reminder', url: '/' },
    }
  }

  const web = eligible.filter((d) => d.channel === 'web')
  const mobile = eligible.filter((d) => d.channel === 'mobile')

  const staleTokens: string[] = []
  const webResults = await Promise.all(web.map(async (d) => ({ d, res: await sendWebPushOne(d, payloadFor(d)) })))
  for (const { d, res } of webResults) if (res.stale) staleTokens.push(d.token_key)

  // Expo batches, but the copy differs per profile — group the devices that share a body so a
  // player with two phones still costs one call, without merging two players' messages.
  const byBody = new Map<string, SubscriberDeviceRow[]>()
  for (const d of mobile) {
    const key = d.user_id!
    const list = byBody.get(key) ?? []
    list.push(d)
    byBody.set(key, list)
  }
  for (const [, group] of byBody) {
    const stale = await sendExpoPushBatch(group, payloadFor(group[0]))
    staleTokens.push(...stale)
  }

  const sentAt = now.toISOString()
  await admin.from('notification_dispatches').insert(
    eligible.map((d) => ({
      device_id: d.id,
      game_type: STREAK_DISPATCH_KEY,
      game_id: null,
      sent_at: sentAt,
    }))
  )

  if (staleTokens.length > 0) {
    await admin.from('notification_subscriber_devices').delete().in('token_key', staleTokens)
  }

  return { candidates: reminders.length, sent: eligible.length, skipped }
}
