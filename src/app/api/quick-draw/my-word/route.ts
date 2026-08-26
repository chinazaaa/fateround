import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isQuickDrawGame, parseGameType } from '@/lib/game-types'
import { isQuickDrawGuessVariant } from '@/lib/quick-draw'
import { normalizeResumeToken } from '@/lib/utils'
import { secretMatches } from '@/lib/secret-compare'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * The Quick Draw (guess mode) secret prompt — returned only to the player who is drawing.
 *
 * SECURITY: `quick_draw_guess_sessions.current_word` was in QUICK_DRAW_GUESS_SESSION_SELECT (and
 * duplicated as the last entry of `used_words`), so every guesser's browser fetched the answer
 * with the publishable anon key and the UI merely *hid* it (`isDrawer && session.current_word`).
 * Rendering is presentation, not a control — any guesser could read their own network response
 * and win instantly. Same class as the Codewords key card (audit finding H2) and the Describe It
 * word.
 *
 * Migration 20260807140000 revokes SELECT on `current_word` and `used_words` from
 * anon/authenticated, and this route is the only way back to the prompt. It is returned when, and
 * only when, the caller's SECRET resolves to `session.drawer_player_id`:
 *
 *   - `resumeToken` → the player who holds it (same lookup as assertPlayer / resolveHandViewer), or
 *   - `hostToken` → the host's own seated player (`games.host_player_id`), for host-as-player.
 *
 * Everyone else — guessers, spectators, unresolved callers — gets `{ word: null }` with a 200. A
 * guesser polling this is completely normal traffic, so it is not an error condition; the status
 * code must not become an oracle for "you are the drawer".
 *
 * POST, not GET, even though this only reads: the caller's resume/host token is a secret and a
 * query string is the one place a secret must never go (server and CDN access logs, browser
 * history, Referer). Same reasoning as /api/describe-it/my-word and /api/whot/hands.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      gameCode?: string
      resumeToken?: string
      hostToken?: string
    }
    const gameId = body.gameCode?.toUpperCase()
    if (!gameId) return NextResponse.json({ error: 'gameCode is required' }, { status: 400 })

    // Reuses the hands bucket: same shape of traffic (one small read per word change, by every
    // client in the game) and the same generous ceiling.
    const limited = await enforceRateLimit(req, RATE_LIMITS.handsFetch)
    if (limited) return limited

    const supabase = getSupabaseAdmin()

    const { data: game } = await supabase
      .from('games')
      .select('game_type, quick_draw_variant, host_token, host_player_id')
      .eq('id', gameId)
      .maybeSingle()
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (!isQuickDrawGame(parseGameType(game.game_type))) {
      return NextResponse.json({ error: 'Not a Quick Draw game' }, { status: 400 })
    }
    if (!isQuickDrawGuessVariant(game.quick_draw_variant)) {
      return NextResponse.json({ error: 'Not in guess mode' }, { status: 400 })
    }

    const { data: session } = await supabase
      .from('quick_draw_guess_sessions')
      .select('drawer_player_id, current_word')
      .eq('game_id', gameId)
      .maybeSingle()
    // No session yet (lobby), or nobody is drawing — nothing to hand out either way.
    if (!session?.drawer_player_id) return NextResponse.json({ word: null })

    // Resolve the CALLER from a secret only. A client-supplied playerId is public and forgeable
    // (see src/lib/game-admin.ts), so it is never accepted here.
    let callerPlayerId: string | null = null

    const token = normalizeResumeToken(String(body.resumeToken ?? ''))
    if (token.length >= 4) {
      const { data: player } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', gameId)
        .eq('resume_token', token)
        .maybeSingle()
      callerPlayerId = player?.id ?? null
    }

    // Host-as-player: the host console holds the host token, and `games.host_player_id` records
    // the seat it took when the host chose to play. A host who is only running the board has no
    // seat, so this stays null and they get no word — correct, they are not drawing.
    if (!callerPlayerId && (await secretMatches(body.hostToken, game.host_token))) {
      callerPlayerId = game.host_player_id ?? null
    }

    if (!callerPlayerId || callerPlayerId !== session.drawer_player_id) {
      return NextResponse.json({ word: null })
    }
    return NextResponse.json({ word: (session.current_word as string | null) ?? null })
  } catch (err) {
    const message = internalErrorMessage('quick-draw/my-word', err, 'Failed to load your word')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
