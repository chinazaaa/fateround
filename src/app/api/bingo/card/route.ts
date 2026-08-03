import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { secretMatches } from '@/lib/secret-compare'
import { isBingoGame } from '@/lib/game-types'
import { BINGO_CARD_SELECT } from '@/lib/supabase-selects'
import { normalizeResumeToken } from '@/lib/utils'

/**
 * A single Bingo card, fetched through the server route instead of read from the table.
 *
 * Unlike the hand games (Whot/UNO/Crazy Eights), `bingo_cards` is NOT a hand and clients never
 * read opponents' cards — each caller reads exactly ONE card, so there is no list to redact and
 * no `card_count` concept. `cells`/`marked_indices` are the secret; once anon loses SELECT on
 * them (the final batched migration in docs/rls-hardening.md § "Phase 7"), only the service role
 * can read a card, so this route is the only reader.
 *
 * Two authorized shapes, both proving the caller may see the ONE card they ask for:
 *   - `hostToken` matching `games.host_token` → the requested `playerId`'s card (host verifying a
 *     claim / showing a player's card). No `playerId` → null card.
 *   - `resumeToken` → the caller's OWN card, resolved from the SECRET token exactly like
 *     resolveHandViewer/assertPlayer. A client-supplied `playerId` is ignored on this path —
 *     it is public and forgeable.
 *
 * POST, not GET: the resume token is a secret and must stay out of query strings (access logs,
 * CDN logs, browser history) — same reasoning as /api/whot/hands.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      gameCode?: string
      resumeToken?: string
      hostToken?: string
      playerId?: string
    }
    const gameId = body.gameCode?.toUpperCase()
    if (!gameId) return NextResponse.json({ error: 'gameCode is required' }, { status: 400 })

    const limited = await enforceRateLimit(req, RATE_LIMITS.handsFetch)
    if (limited) return limited

    const supabase = getSupabaseAdmin()

    const { data: game } = await supabase.from('games').select('host_token, game_type').eq('id', gameId).maybeSingle()
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (!isBingoGame(game.game_type)) {
      return NextResponse.json({ error: 'Not a bingo game' }, { status: 400 })
    }

    // Which player's card to return — resolved from whichever secret the caller holds, never
    // from a client-supplied playerId (except on the host path, where the host is trusted to
    // name the player whose card they are inspecting).
    let targetPlayerId: string | null
    if (body.hostToken != null && (await secretMatches(body.hostToken, game.host_token))) {
      targetPlayerId = body.playerId ?? null
    } else if (body.resumeToken) {
      const token = normalizeResumeToken(String(body.resumeToken))
      if (token.length < 4) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const { data: player } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', gameId)
        .eq('resume_token', token)
        .maybeSingle()
      if (!player) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      targetPlayerId = player.id
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Host asked for "a card" without naming a player — nothing to show, not an error.
    if (!targetPlayerId) return NextResponse.json({ card: null })

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
