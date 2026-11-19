import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isWordRushGame } from '@/lib/game-types'
import { resumeWordRushFinalization } from '@/lib/word-rush-server'
import { wordRushGameSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

// Bounded well below FINISH_BOOKKEEPING_LEASE_SECONDS (word-rush-server): the bookkeeping lease assumes a
// request cannot outlive it, so an expired lease means its holder is dead.
export const maxDuration = 60

/**
 * Resume the effects (setter's mirror points, the round message, the last-round game finish) of an
 * individual round that was closed but not finalized. A client calls this when the session still
 * carries a `round_finalize` marker after the round ended. Deliberately NOT gated on the game being
 * active: after the last round the session is finished, and the marker can outlive the game finish
 * when clearing it failed. It only completes work the marker says is owed and is idempotent, so any
 * caller may trigger it.
 */
export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, wordRushGameSchema)
  if (bodyError) return bodyError
  const code = data.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isWordRushGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Word Rush game' }, { status: 400 })
  }

  const { resumed, error, internal } = await resumeWordRushFinalization(supabase, code)
  if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })
  return NextResponse.json({ success: true, resumed })
}
