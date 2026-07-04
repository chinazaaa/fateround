import { after } from 'next/server'
import type { NextRequest, NextResponse } from 'next/server'
import { notifyGameEvent, type PushEvent } from '@/lib/push'

type RouteCtx = { params: Promise<{ code: string }> }
type Handler = (req: NextRequest, ctx: RouteCtx) => Promise<NextResponse>

/**
 * Wrap a game state-transition route so a web-push notification fires once, after a
 * successful response, without blocking it.
 *
 * The three transition routes (start / play-again / finish-game) each have many
 * early returns across game types, so hooking every write site would be brittle. This
 * seam keys off the outcome instead: any 2xx response from these routes means the
 * transition happened, so we notify the room. `after()` runs the send once the
 * response has been flushed, so notification latency never touches the host's request.
 */
export function withGameNotification(event: PushEvent, handler: Handler): Handler {
  return async (req, ctx) => {
    const res = await handler(req, ctx)
    if (res.ok) {
      const { code } = await ctx.params
      after(async () => {
        try {
          await notifyGameEvent(code.toUpperCase(), event)
        } catch (err) {
          console.error(`push notify (${event}) failed for ${code}`, err)
        }
      })
    }
    return res
  }
}
