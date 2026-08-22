import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: a host who opens their own game on a second device can move hosting to it.
 *
 * The server half has existed for a while — `/api/games/[code]/reclaim-host` hands the host
 * token to whoever owns `games.host_user_id`, on any device — but only `useHostToken` used it,
 * to recover a host whose local storage was cleared. Nothing offered it from the JOIN path,
 * which is where a host on a second device actually lands.
 *
 * What they got instead was a `409 already_hosting` and one option, "continue on this device",
 * which retried the join with an override and seated them as an ordinary PLAYER. Hosting stayed
 * on the phone. Reported as "I thought if I'm hosting on my phone and I join as player on my
 * laptop I can also click to put the host on my laptop".
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const JOIN_PATHS = [
  { platform: 'web', file: 'src/hooks/useJoinFlow.ts' },
  { platform: 'web', file: 'src/hooks/useGameViewBootstrap.ts' },
  { platform: 'mobile', file: 'apps/mobile/hooks/useGameViewBootstrap.ts' },
]

describe.each(JOIN_PATHS)('$platform $file', ({ file }) => {
  const src = read(file)

  it('offers to take hosting over on already_hosting', () => {
    expect(src).toMatch(/already_hosting/)
    expect(src, 'must reach for the handoff, not just retry the join').toMatch(/takeOverHosting\(gameCode\)/)
  })

  it('handles the handoff BEFORE falling through to the player retry', () => {
    // Order is the whole fix. Retrying the join first seats the host as a player and leaves
    // hosting where it was, which is the bug.
    const handoff = src.search(/takeOverHosting\(gameCode\)/)
    const retry = src.search(/attemptJoin\(true\)|doJoin\(true\)/)
    expect(handoff).toBeGreaterThan(-1)
    expect(retry).toBeGreaterThan(-1)
    expect(handoff, 'the handoff must come first').toBeLessThan(retry)
  })

  it('falls through rather than erroring when the handoff is not available', () => {
    // A guest, or someone who is not this game's host, must still get the normal join.
    expect(src).toMatch(/if \((?:host)?[Tt]oken\) \{/)
  })
})

describe('the handoff helpers', () => {
  it('exist on both platforms and persist the token locally', () => {
    expect(read('src/lib/take-over-hosting.ts')).toMatch(/rememberHostToken\(code, token\)/)
    expect(read('apps/mobile/lib/take-over-hosting.ts')).toMatch(/setHostToken\(gameCode, hostToken\)/)
  })

  it('reuse the endpoint that already existed rather than adding another', () => {
    expect(read('src/lib/take-over-hosting.ts')).toMatch(/reclaim-host/)
    expect(read('apps/mobile/lib/take-over-hosting.ts')).toMatch(/postReclaimHost/)
  })

  it('do NOT rotate the host token', () => {
    // The player equivalent rotates its resume token so continuing MOVES the seat. Hosting is
    // the opposite case: both devices are the same account, and killing the other device's
    // token would strand it mid-game with a dead credential and no path back.
    const route = read('src/app/api/games/[code]/reclaim-host/route.ts')
    expect(route, 'reclaim must hand back the existing token').toMatch(/return NextResponse\.json\(\{ hostToken \}/)
    expect(route).not.toMatch(/generateHostToken|update\(\{[^}]*host_token/)
  })

  it('swallow failures — a handoff that cannot happen is not an error', () => {
    for (const rel of ['src/lib/take-over-hosting.ts', 'apps/mobile/lib/take-over-hosting.ts']) {
      expect(read(rel)).toMatch(/catch\s*\{\s*\n?\s*return null/)
    }
  })
})
