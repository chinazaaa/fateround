import { NextResponse } from 'next/server'

// Per-process version marker. First choice is the Vercel commit SHA (stable across
// all containers on the same deploy); falls back to the module-load timestamp
// (still monotonic per deploy, since a redeploy spawns fresh containers). Read
// once at module load so this is O(1) per request.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || String(Date.now())

// Never cache — the whole point is to detect deploys, so a cached response would
// defeat it. Also opt out of Next's route-cache so every request sees fresh state.
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/version → { buildId }. Clients (see useAppVersionRefresh) compare
 * this against the buildId they saw on first load and hard-reload when it
 * changes — so an installed PWA that was left open through a deploy picks up
 * the new bundle the next time the user focuses the window.
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
