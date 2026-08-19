import { NextRequest, NextResponse } from 'next/server'
import { getPublicTrophiesForGame } from '@/lib/trophies/public'

// Always runtime, never cached: the game landing page is statically generated (ISR), so it can't
// read the trophies table at build time — the service-role key isn't present there and the strip
// bakes empty. The landing page fetches this route on the client instead, so the trophy list comes
// from the live DB on every view regardless of when the page was built.
export const dynamic = 'force-dynamic'

/** Public trophy list for one game type (hidden trophies already masked). `?game=<gameType>`. */
export async function GET(req: NextRequest) {
  const gameType = new URL(req.url).searchParams.get('game')
  if (!gameType) return NextResponse.json({ trophies: [] })
  const trophies = await getPublicTrophiesForGame(gameType)
  return NextResponse.json({ trophies })
}
