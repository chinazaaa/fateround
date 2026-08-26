import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { isBingoGame } from '@/lib/game-types'
import { BINGO_CARD_SELECT } from '@/lib/supabase-selects'
import { resolveHandViewer } from '@/lib/hand-redaction'

/**
 * A single Bingo card, fetched through the server route instead of read from the table.
 *
 * Unlike the hand games (Whot/UNO/Crazy Eights), `bingo_cards` is NOT a hand and clients never
 * read opponents' cards — each caller reads exactly ONE card, so there is no list to redact and
 * no `card_count` concept. `cells`/`marked_indices` are the secret; once anon loses SELECT on
 * them (the final batched migration in docs/rls-hardening.md § "Phase 7"), only the service role
 * can read a card, so this route is the only reader.
 *
 * EXACTLY ONE authorized shape: a `resumeToken` returns the card of the player that token
 * resolves to — the caller's OWN card, and nothing else. Resolution goes through the shared
 * `resolveHandViewer` so this route cannot drift from /api/whot/hands and friends.
 *
 * There is deliberately NO host path. A host token proves "I am running this board", which
 * never requires seeing a card: claim verification is done server-side in /api/bingo/claim
 * (it reads the card with the service role after `assertPlayer`), and the host view only ever
 * loads the host's OWN seat — which it can do with that seat's resume token like any player.
 * The removed `hostToken` + `playerId` branch let anyone holding the shared /host/CODE link
 * read every player's `cells`/`marked_indices` mid-game. Same reasoning as `resolveHandViewer`
 * returning null for a host.
 *
 * A client-supplied `playerId` is never trusted anywhere here: it is public and forgeable.
 *
 * POST, not GET: the resume token is a secret and must stay out of query strings (access logs,
 * CDN logs, browser history) — same reasoning as /api/whot/hands.
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

    const { data: game } = await supabase.from('games').select('game_type').eq('id', gameId).maybeSingle()
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (!isBingoGame(game.game_type)) {
      return NextResponse.json({ error: 'Not a bingo game' }, { status: 400 })
    }

    // Whose card to return — resolved from the SECRET resume token, never from a
    // client-supplied playerId. null means "this caller is nobody in this game": a 401, not an
    // empty card, so the client can tell "not allowed" from "not dealt yet".
    const targetPlayerId = await resolveHandViewer(supabase, gameId, { resumeToken: body.resumeToken })
    if (!targetPlayerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: card, error } = await supabase
      .from('bingo_cards')
      .select(BINGO_CARD_SELECT)
      .eq('game_id', gameId)
      .eq('player_id', targetPlayerId)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: internalErrorMessage('bingo/card', error) }, { status: 500 })
    }

    return NextResponse.json({ card: card ?? null })
  } catch (err) {
    const message = internalErrorMessage('bingo/card', err, 'Failed to load card')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
