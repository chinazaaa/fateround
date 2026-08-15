import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/parse-body'
import { driveWhotBotsOnce } from '@/lib/whot-bot-driver'

/**
 * Whot bot driver — one tick.
 *
 * Poked by the in-process game-tick loop (`src/lib/game-tick.ts`) for every
 * active Whot game. Same pattern the tournament reminder ticker uses (see PR
 * #878's post-mortem): the ticker POSTs to this route rather than importing
 * the driver directly, because the driver's transitive `web-push` import
 * would break the edge-runtime compile of `src/instrumentation.ts`.
 *
 * Tokenless is safe: the driver is idempotent and self-gating. It only acts
 * when the current player is genuinely a bot, and every underlying
 * processWhot* call uses the atomic session CAS — so an attacker hitting
 * this route can, at most, cause a bot whose turn is genuinely due to make
 * its move slightly sooner. Not a security hole.
 *
 * Runtime = 'nodejs' because the driver uses web-push transitively via
 * scheduleTurnNotification.
 */

export const runtime = 'nodejs'

const bodySchema = z.object({ gameId: z.string().min(4).max(20) })

export async function POST(req: NextRequest) {
  const { data, error } = await parseJsonBody(req, bodySchema)
  if (error) return error
  try {
    const result = await driveWhotBotsOnce(data.gameId)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[whot-bot-tick] error:', err)
    // 200 with ok:false — the ticker is fire-and-forget and retries next tick;
    // a 5xx here would just add noise to error dashboards.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
