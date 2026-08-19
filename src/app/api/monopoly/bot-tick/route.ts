import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/parse-body'
import { driveMonopolyBotsOnce } from '@/lib/monopoly-bot-driver'

/**
 * Monopoly bot driver — one tick.
 *
 * Poked by the in-process game-tick loop for every active Monopoly game (see
 * `src/lib/game-tick.ts`, `BOT_TICK_SLUG`). Mirrors the Whot bot-tick route —
 * see that file for the "why a route, not a direct import" post-mortem
 * (short version: `web-push` transitively lands in the driver and would break
 * the edge compile of `src/instrumentation.ts`; a `nodejs` route sidesteps it).
 *
 * Tokenless is safe: the driver is self-gating. It only acts when the current
 * turn holder (or auction bidder) is genuinely a bot, and every underlying
 * processMonopoly* call CAS-guards on `board.updated_at`. An attacker hitting
 * this endpoint can, at most, cause a bot whose slot is genuinely due to act
 * slightly sooner. No new attack surface.
 *
 * Runtime = 'nodejs' because scheduleTurnNotification pulls in web-push.
 */

export const runtime = 'nodejs'

const bodySchema = z.object({ gameId: z.string().min(4).max(20) })

export async function POST(req: NextRequest) {
  const { data, error } = await parseJsonBody(req, bodySchema)
  if (error) return error
  try {
    const result = await driveMonopolyBotsOnce(data.gameId)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[monopoly-bot-tick] error:', err)
    // 200 with ok:false — the ticker is fire-and-forget and retries next tick;
    // a 5xx here would just add noise to error dashboards.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
