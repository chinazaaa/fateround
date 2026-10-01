import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isDescribeItGame } from '@/lib/game-types'
import { processDescribeItAdvance } from '@/lib/describe-it'
import { describeItAdvanceSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { secretMatches } from '@/lib/secret-compare'

export async function POST(req: NextRequest) {
  const { data, error: bodyError } = await parseJsonBody(req, describeItAdvanceSchema)
  if (bodyError) return bodyError
  const code = data.gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('game_type, host_token').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isDescribeItGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Text Charades game' }, { status: 400 })
  }

  // The host may skip the break; anyone else only advances once the break is up.
  // `!!data.hostToken &&` still short-circuits: a token-less poll (the common case) does
  // no digest work at all, and `force` stays a strict boolean either way.
  const force = !!data.hostToken && (await secretMatches(data.hostToken, game.host_token))

  const { error, internal } = await processDescribeItAdvance(supabase, code, { force })
  if (error) return NextResponse.json({ error }, { status: internal ? 500 : 400 })
  return NextResponse.json({ success: true })
}
