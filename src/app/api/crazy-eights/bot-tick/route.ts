import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/parse-body'
import { driveCrazy8BotsOnce } from '@/lib/crazy-eights-bot-driver'

/**
 * Crazy Eights bot driver — one tick. Bots-in-room Phase 3.
 *
 * Poked by the in-process game-tick loop (`src/lib/game-tick.ts`) for every active Crazy
 * Eights game. The ticker POSTs here rather than importing the driver directly because the
 * driver's transitive `web-push` import would break the edge-runtime compile of
 * `src/instrumentation.ts` — the same reason `/api/whot/bot-tick` exists (PR #878's
 * post-mortem).
 *
 * Tokenless is safe: the driver is idempotent and self-gating. It acts only when the current
 * player is genuinely a bot, and every underlying `processCrazyEights*` call uses the atomic
 * session CAS — so the worst an attacker hitting this route can do is make a bot whose turn
 * is already due move a little sooner.
 *
 * Runtime = 'nodejs' because the driver uses web-push transitively via
 * `scheduleTurnNotification`.
 */

export const runtime = 'nodejs'

const bodySchema = z.object({ gameId: z.string().min(4).max(20) })

export async function POST(req: NextRequest) {
  const { data, error } = await parseJsonBody(req, bodySchema)
  if (error) return error
  try {
    const result = await driveCrazy8BotsOnce(data.gameId)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[crazy-eights-bot-tick] error:', err)
    // 200 with ok:false — the ticker is fire-and-forget and retries next tick; a 5xx here
    // would only add noise to error dashboards.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
