import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { isTwoTruthsGame, parseGameType } from '@/lib/game-types'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * The caller's OWN Two Truths submission, including `lie_index`.
 *
 * Same shape as /api/whot/hands (see that file for the pattern): `ttl_statements.lie_index` is
 * revoked from the anon role, because reading the table gave away every player's lie. The
 * clients still read the table in bulk for the roster ("who has submitted"), which needs no
 * lie; only the submitter's own row needs it, to prefill and review their own submission.
 *
 * POST, not GET: the caller's resume token is a secret and must not land in a query string
 * (access logs, CDN logs, browser history).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      gameCode?: string
      resumeToken?: string
    }
    const gameId = body.gameCode?.toUpperCase()
    if (!gameId) return NextResponse.json({ error: 'gameCode is required' }, { status: 400 })

    const limited = await enforceRateLimit(req, RATE_LIMITS.handsFetch)
    if (limited) return limited

    const supabase = getSupabaseAdmin()

    // Match every sibling TTL route: the game must exist and actually be Two Truths, so a
    // wrong/expired code fails as 404 rather than as an empty (indistinguishable from
    // "not submitted") statement.
    const { data: game } = await supabase.from('games').select('game_type').eq('id', gameId).maybeSingle()
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (!isTwoTruthsGame(parseGameType(game.game_type))) {
      return NextResponse.json({ error: 'Not a two truths game' }, { status: 400 })
    }

    // Authorize by the secret resume_token; the resolved player.id is authoritative. A
    // client-supplied playerId is public and forgeable, and would hand over another
    // player's lie.
    const auth = await assertPlayer(supabase, gameId, body.resumeToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabase
      .from('ttl_statements')
      .select('*')
      .eq('game_id', gameId)
      .eq('player_id', auth.player.id)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: internalErrorMessage('two-truths/my-statement', error) }, { status: 500 })
    }

    return NextResponse.json({ statement: data ?? null })
  } catch (err) {
    const message = internalErrorMessage('two-truths/my-statement', err, 'Failed to load your statement')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
