import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isGoFishGame } from '@/lib/game-types'
import { processGoFishAsk } from '@/lib/gofish-server'
import type { GoFishRank } from '@/types'
import { gofishAskSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { scheduleTurnNotification } from '@/lib/push'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

/**
 * Ask an opponent for a rank. This one route resolves the whole standard turn:
 * hit → transfer + go again; miss → draw one from the ocean (or nothing when the
 * ocean is empty), with the lucky-draw case handled server-side.
 *
 * Server-authoritative: the caller is authorised by their secret resume_token, and
 * `resolveGoFishAsk` enforces "not your turn" / "must hold the rank you ask for" /
 * "target has cards" — the client can't cheat by asking for a rank it doesn't hold.
 *
 * Concurrency: `processGoFishAsk` claims the session row on its loaded `updated_at`;
 * a losing claim (another writer moved first) returns a 400 with an error mentioning
 * "please retry", not a hard failure. Clients should re-fetch state and re-submit
 * the same action rather than surface the message as a fatal error.
 */
export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, gofishAskSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, targetPlayerId, rank } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isGoFishGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Go Fish game' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error, result } = await processGoFishAsk(supabase, code, auth.player.id, targetPlayerId, rank as GoFishRank)
  if (error || !result || !result.ok) {
    return NextResponse.json({ error: error ?? 'Ask failed' }, { status: 400 })
  }

  scheduleTurnNotification(code, game)

  // On a plain (non-lucky) miss with a draw, surface the drawn rank to the ASKER only
  // (this is safe: it's their own newly-owned card, and the physical game keeps a
  // miss-draw private too). Skip on a lucky draw — the public `ask_miss` event already
  // carries the rank there ("Go Fish! Lucky — you drew a Q. Go again!"), so returning
  // drewRank too would fire two toasts for the same moment (CodeRabbit #1108). A miss
  // with sameTurn=true is exactly the lucky-draw case.
  const drewRank =
    !result.hit && !result.sameTurn && result.transferred.length > 0 ? result.transferred[0]?.rank : undefined

  return NextResponse.json({
    success: true,
    hit: result.hit,
    sameTurn: result.sameTurn,
    transferredCount: result.transferred.length,
    newBooks: result.newBooks,
    drewRank,
  })
}
