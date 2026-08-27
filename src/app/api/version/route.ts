import { NextResponse } from 'next/server'

/**
 * Build marker for this deploy. Every candidate below is stamped at BUILD time and is
 * therefore identical across every process/container serving the same image:
 *  - GIT_SHA — this repo's own deploy stamp (Dockerfile `ARG GIT_SHA` ← CI `github.sha`).
 *  - VERCEL_GIT_COMMIT_SHA / NEXT_PUBLIC_BUILD_ID — for a Vercel-style deploy.
 *
 * There is deliberately NO per-process fallback (it used to be `String(Date.now())`).
 * A module-load timestamp is unique per PROCESS, not per deploy, so any container
 * restart — a crash-loop, an OOM kill, `--restart always` doing its job — minted a
 * "new version" and every open client hard-reloaded itself the next time its tab
 * regained focus. Mid-game that reads as: leave the tab for two seconds, come back to
 * a reloading page. When no stable id is configured (local dev, a bare `next start`),
 * report null and let the client stand down instead of guessing.
 */
const BUILD_ID = process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || null

// Never cache — the whole point is to detect deploys, so a cached response would
// defeat it. Also opt out of Next's route-cache so every request sees fresh state.
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/version → { buildId }. Clients (see AppVersionWatcher) compare this against
 * the buildId they saw on first load and hard-reload when it changes — so an installed
 * PWA that was left open through a deploy picks up the new bundle the next time the user
 * focuses the window. `buildId: null` means "no stable marker here": the watcher treats
 * that as "don't reload", never as a change.
 */
export function GET() {
  return NextResponse.json(
    { buildId: BUILD_ID },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    }
  )
}
