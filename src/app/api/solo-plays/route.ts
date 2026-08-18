import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { hasSoloPlay } from '@/lib/solo-play'
import type { GameType } from '@/types'

/**
 * Log one solo (vs bot) practice game start.
 *
 * Solo games are client-only (no games row), so this is the only signal we
 * have for adoption. Called once per new game from each solo client — see
 * `logSoloPlayStarted` in `src/lib/solo-play.ts`.
 *
 * Idempotency isn't attempted: the client already dedupes by only calling on
 * fresh init / restart, not on rehydrate. A double-post at worst inflates one
 * game's count by one.
 */
export async function POST(req: NextRequest) {
  let body: { gameType?: unknown; difficulty?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const gameType = typeof body.gameType === 'string' ? body.gameType : ''
  if (!gameType || !hasSoloPlay(gameType as GameType)) {
    return NextResponse.json({ error: 'Unsupported game type' }, { status: 400 })
  }

  const rawDifficulty = typeof body.difficulty === 'string' ? body.difficulty.trim() : ''
  const difficulty = rawDifficulty && rawDifficulty.length <= 32 ? rawDifficulty : null

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('solo_plays').insert({ game_type: gameType, difficulty })
  if (error) {
    console.error('[api/solo-plays] insert failed', error)
    return NextResponse.json({ error: 'Failed to record solo play' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
