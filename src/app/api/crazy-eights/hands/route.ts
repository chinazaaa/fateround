import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { redactHands, resolveHandViewer } from '@/lib/hand-redaction'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * Crazy Eights hands, with every hand but the caller's own reduced to a card count.
 *
 * Mirrors /api/whot/hands, the canary for the hand-redaction pattern (docs/rls-hardening.md
 * § "Phase 7 — hand redaction"). Crazy Eights has no team mode, so the viewer resolved from the
 * caller's secret is passed straight to redactHands.
 *
 * POST, not GET: the caller's resume token is a secret and must not land in a query string
 * (access logs, CDN logs, browser history) — same reasoning as /api/codewords/board.
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

    const limited = await enforceRateLimit(req, RATE_LIMITS.handsFetch)
    if (limited) return limited

    const supabase = getSupabaseAdmin()

    // A finished game's hands are not secret — /history/[code] shows the final hands, and by
    // then everyone has seen them. Same rule as /api/codewords/board's key reveal.
    const { data: game } = await supabase.from('games').select('status').eq('id', gameId).maybeSingle()
    const finished = game?.status === 'finished'

    const viewerId = finished ? null : await resolveHandViewer(supabase, gameId, body)

    const { data: rows, error } = await supabase
      .from('crazy_eights_player_hands')
      .select('*')
      .eq('game_id', gameId)
      .order('player_order')
    if (error) {
      return NextResponse.json({ error: internalErrorMessage('crazy-eights/hands', error) }, { status: 500 })
    }

    if (finished) return NextResponse.json({ hands: rows ?? [] })
    return NextResponse.json({ hands: redactHands(rows ?? [], viewerId) })
  } catch (err) {
    const message = internalErrorMessage('crazy-eights/hands', err, 'Failed to load hands')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
