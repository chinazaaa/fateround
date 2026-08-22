import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: the streak reminder has a channel to reach a player, and a schedule to run on.
 *
 * The reminder's non-obvious dependency is that it needs a push channel that is NOT scoped to
 * a game. `push_subscriptions` and `mobile_push_tokens` both key on a NOT NULL player_id, so
 * neither can reach someone who isn't currently in a game — the exact person a come-back nudge
 * is for. The only device-level channel is `notification_subscriber_devices`, and it only
 * links to a profile when the client sends its bearer on register.
 *
 * Break any link in that chain and the job still runs, still reports success, and reaches
 * nobody. That is precisely the kind of silent nothing a test should catch.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/**
 * Source with comments stripped. A "this file must not mention X" assertion that reads the
 * prose is worthless — the doc comment in `streak-reminders.ts` explains at length why the
 * game-scoped push tables can't be used here, and an earlier version of the test below failed
 * on that explanation rather than on any code.
 */
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('streak reminder wiring', () => {
  it('the device table carries the profile link the join needs', () => {
    const migration = read('supabase/migrations/20261021120000_identity_on_games_players_devices.sql')
    expect(migration).toMatch(/alter table public\.notification_subscriber_devices\s+add column if not exists user_id/)
  })

  it('the sender joins devices on that link, not on a game', () => {
    const src = codeOf('src/lib/streak-reminders.ts')
    expect(src).toMatch(/from\('notification_subscriber_devices'\)/)
    expect(src, "must select by profile, since the player isn't in a game").toMatch(/\.in\('user_id',/)
    expect(src, 'game-scoped push tables cannot reach an absent player').not.toMatch(
      /mobile_push_tokens|push_subscriptions/
    )
  })

  it('clients send the bearer when registering, or user_id stays null', () => {
    // Without this the device row exists but is anonymous, and the join above matches nothing.
    const mobile = read('apps/mobile/lib/notifications-api.ts')
    expect(mobile).toMatch(/subscribeGameType[\s\S]{0,600}?authHeaders\(\)/)
    const route = read('src/app/api/notifications/route.ts')
    expect(route).toMatch(/getProfileFromRequest\(req\)/)
    expect(route).toMatch(/user_id: subscriberUserId/)
  })

  it('respects quiet hours and sends at most one per device per day', () => {
    const src = read('src/lib/streak-reminders.ts')
    expect(src, 'a nudge at 3am is worse than no nudge').toMatch(/isWithinDeliveryWindow\(d, now\)/)
    expect(src, 'needs an at-most-once gate').toMatch(/STREAK_DISPATCH_KEY/)
    expect(src).toMatch(/REMIND_EVERY_MS = 20 \* 60 \* 60 \* 1000/)
  })

  it('is actually scheduled', () => {
    // A route nothing invokes is a feature that does not exist.
    const infra = read('infra/templates/user-data.sh.tftpl')
    expect(infra).toMatch(/api\/cron\/streak-reminders/)
    expect(infra, 'daily, in the evening WAT').toMatch(/OnCalendar=\*-\*-\* 18:00:00 UTC/)
    expect(infra, 'a box down at 18:00 should still send when it returns').toMatch(/Persistent=true/)
  })

  it('the dispatch bucket cannot collide with a real game type', () => {
    const src = read('src/lib/streak-reminders.ts')
    expect(src).toMatch(/STREAK_DISPATCH_KEY = '__streak_reminder'/)
  })
})
