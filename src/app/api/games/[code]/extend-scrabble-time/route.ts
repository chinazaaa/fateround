import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isScrabbleGame } from '@/lib/game-types'
import { extendScrabbleGameDuration, clampScrabbleTimeExtension } from '@/lib/scrabble'
import { scrabbleExtendTimeSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertHostAny } from '@/lib/game-admin'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data: body, error: bodyError } = await parseJsonBody(req, scrabbleExtendTimeSchema)
  if (bodyError) return bodyError

  const { hostToken, extensionSeconds } = body
  const gameId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  // No status gate: extending the clock is accepted whatever state the game is in
  // (`assertHostAny`), exactly as the hand-rolled ladder this replaced did. The only
  // gate is the game-type check below, which stays AFTER the token check.
  const auth = await assertHostAny(supabase, gameId, hostToken, { columns: 'id, game_type' })
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const game = auth.game
  if (!isScrabbleGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Word Tiles game' }, { status: 400 })
  }

  const { error, newDurationSeconds } = await extendScrabbleGameDuration(
    supabase,
    gameId,
    clampScrabbleTimeExtension(extensionSeconds)
  )
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true, game_duration_seconds: newDurationSeconds })
}
