import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * `assertPlayer` (src/lib/game-admin.ts) bumps `games.last_activity_at` by default, so a
 * route added later gets the liveness marker for free. The flip side is that a READ-only
 * route must opt out explicitly: `games.last_activity_at` is what `closeIdleActiveGames`
 * (src/lib/idle-reaper.ts) and the ticker read, so a route that bumps on a poll lets a tab
 * left open in a pocket keep an abandoned game off the reaper's list indefinitely.
 *
 * These four are the only `assertPlayer` callers that do not write. They are POST-shaped
 * reads — POST only so the caller's secret resume token stays out of query strings — which
 * is exactly why the HTTP method cannot be relied on to tell reads from writes, and why
 * this pins them by name.
 */
const READ_ONLY_ROUTES = [
  'src/app/api/mafia/[code]/state/route.ts',
  'src/app/api/wordle-room/status/route.ts',
  'src/app/api/two-truths/my-guesses/route.ts',
  'src/app/api/two-truths/my-statement/route.ts',
]

describe('read-only assertPlayer callers opt out of the activity bump', () => {
  it.each(READ_ONLY_ROUTES)('%s passes readOnly: true', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    expect(source).toMatch(/assertPlayer\([^)]*\{\s*readOnly:\s*true\s*\}\s*\)/)
  })

  it.each(READ_ONLY_ROUTES)('%s really is read-only', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    // If one of these grows a write, it stops being a read-only path and the opt-out above
    // is wrong — the game IS alive and the bump must come back.
    expect(source).not.toMatch(/\.(?:insert|update|upsert|delete)\(|\.rpc\(/)
  })
})
