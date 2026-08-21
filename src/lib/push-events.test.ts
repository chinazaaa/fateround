import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard against mid-game push spam.
 *
 * A trivia room used to send one room-wide "New round 🔔" per question — ten notifications in
 * about two minutes for a ten-round game, and frequently doubled, because every connected
 * client polls `/api/trivia/advance` and whichever call won the race scheduled its own push.
 *
 * The rule this pins: a room-wide broadcast fires at the EDGES of a game (it started, the
 * lobby reopened, it ended), never once per round or turn. Per-player pushes (`your_turn`) are
 * fine — one recipient, one actionable moment.
 */

const REPO = process.cwd()
const PUSH = readFileSync(join(REPO, 'src', 'lib', 'push.ts'), 'utf8')

/**
 * The only events allowed to fan out to everyone subscribed to a game.
 *
 * All three are lifecycle edges sent once per transition by `withGameNotification`. Nothing
 * here can fire more than once per game per state change — that is the property that matters,
 * not the count of events in this set.
 *
 * `host_idle_warning` is deliberately NOT here: it is addressed to the host and goes out via
 * `notifyHostIdleWarning`, which targets them directly.
 */
const ROOM_WIDE_ALLOWED = new Set(['game_started', 'lobby_reopened', 'game_ended'])

function pushEvents(): string[] {
  const match = /export type PushEvent =\n((?:\s*\|\s*'[a-z_]+'\n)+)/.exec(PUSH)
  if (!match) throw new Error('could not find the PushEvent union in src/lib/push.ts')
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('push events', () => {
  it('reads the union (the guard is looking at something)', () => {
    expect(pushEvents()).toContain('game_started')
  })

  it('has no per-round broadcast', () => {
    expect(pushEvents(), 'a per-round room-wide push is spam — see the note in push.ts').not.toContain('round_started')
    expect(PUSH).not.toMatch(/scheduleRoundStartedNotification/)
  })

  it('every room-wide broadcast site sends an edge-of-game event', () => {
    // notifyGameEvent fans out to everyone in the room. Catch a new caller passing anything
    // that isn't a lifecycle edge, whatever it ends up being called.
    const offenders: string[] = []
    for (const file of walk(join(REPO, 'src'))) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/notifyGameEvent\([^)]*?'([a-z_]+)'/g)) {
        if (!ROOM_WIDE_ALLOWED.has(m[1])) offenders.push(`${file.slice(REPO.length + 1)} → ${m[1]}`)
      }
    }
    expect(
      offenders,
      'room-wide pushes are for once-per-game lifecycle edges only. A per-round or per-turn ' +
        'broadcast notifies players who are already watching the screen — and fires again ' +
        'every round. Use notifyPlayerEvent for anything aimed at one player.'
    ).toEqual([])
  })

  it('lifecycle broadcasts skip the host who triggered them', () => {
    // Every event withGameNotification sends is something the host just did — tapped Start,
    // Play again, or End game. Without excludeHost they get pushed their own action.
    const route = readFileSync(join(REPO, 'src', 'lib', 'push-route.ts'), 'utf8')
    expect(route).toMatch(/notifyGameEvent\([\s\S]{0,120}?excludeHost: true/)
    expect(PUSH, 'notifyGameEvent must honour the flag').toMatch(/opts\.excludeHost/)
    expect(PUSH, 'and actually filter the host out of both tables').toMatch(/neq\('player_id', excludeId\)/)
  })

  it('the idle warning reaches the host, not the whole room', () => {
    // "YOUR lobby closes in 2 min" used to fan out to every seated player, none of whom can
    // keep it open.
    expect(PUSH).toMatch(/export async function notifyHostIdleWarning/)
    expect(PUSH).toMatch(/notifyPlayerEvent\(code, game\.host_player_id, 'host_idle_warning'\)/)
    for (const rel of [
      'src/app/api/cron/warn-idle-lobbies/route.ts',
      'src/app/api/games/[code]/warn-idle-now/route.ts',
    ]) {
      const src = readFileSync(join(REPO, rel), 'utf8')
      expect(src, `${rel} must not broadcast the host's warning`).not.toMatch(/notifyGameEvent/)
    }
  })

  it('every declared event still has copy', () => {
    const missing = pushEvents().filter((e) => !new RegExp(`\\b${e}:\\s*\\{`).test(PUSH))
    expect(missing, 'declared in PushEvent but has no PAYLOADS entry').toEqual([])
  })
})
