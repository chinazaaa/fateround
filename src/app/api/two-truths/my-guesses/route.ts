import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { isTwoTruthsGame, parseGameType } from '@/lib/game-types'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * The caller's OWN Two Truths guesses, including `guessed_index`, `is_correct` and `points`.
 *
 * Sibling of /api/two-truths/my-statement. Those three columns are revoked from the anon role:
 * a round only ends once EVERY guesser has answered, so reading them off the table let players
 * 2..n see that player 1 guessed index 1 and was right, and copy the answer. The clients still
 * read the table in bulk for live progress (who has guessed), which needs none of them;
 * post-reveal results are folded into `rounds.ttl_metadata.guesses` by the server. Only the
 * guesser's own in-flight row needs to come back early — to keep their pick highlighted after
 * a refresh — and that is what this route serves.
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

    // Same existence/type check as the sibling routes (see my-statement): a wrong code must
    // fail loudly, not come back as an empty guess list.
    const { data: game } = await supabase.from('games').select('game_type').eq('id', gameId).maybeSingle()
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (!isTwoTruthsGame(parseGameType(game.game_type))) {
      return NextResponse.json({ error: 'Not a two truths game' }, { status: 400 })
    }

    // Authorize by the secret resume_token; the resolved player.id is authoritative. A
    // client-supplied playerId is public and forgeable, and would hand over another player's
    // guesses — which is exactly the leak this route exists to close.
    const auth = await assertPlayer(supabase, gameId, body.resumeToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabase
      .from('ttl_guesses')
      .select('id, game_id, round_id, player_id, guessed_index, is_correct, points, guessed_at')
      .eq('game_id', gameId)
      .eq('player_id', auth.player.id)
    if (error) {
      return NextResponse.json({ error: internalErrorMessage('two-truths/my-guesses', error) }, { status: 500 })
    }

    return NextResponse.json({ guesses: data ?? [] })
  } catch (err) {
    const message = internalErrorMessage('two-truths/my-guesses', err, 'Failed to load your guesses')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
