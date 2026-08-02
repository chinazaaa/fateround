import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { redactHands, resolveHandViewer } from '@/lib/hand-redaction'
import { unoTeammateId } from '@/lib/uno'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * UNO hands, with every hand but the caller's own reduced to a card count.
 *
 * Mirrors /api/whot/hands (the hand-redaction canary — see docs/rls-hardening.md § "Phase 7 —
 * hand redaction"), with one UNO-specific wrinkle: in Team-Up mode (`games.uno_team_mode`) a
 * player also sees their teammate's hand in full, so the viewer set passed to redactHands is
 * `[viewerId, teammateId]` rather than a lone id.
 *
 * POST, not GET: the caller's resume token is a secret and must not land in a query string
 * (access logs, CDN logs, browser history) — same reasoning as /api/whot/hands.
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
    // then everyone has seen them. Same rule as /api/whot/hands.
    const { data: game } = await supabase.from('games').select('status, uno_team_mode').eq('id', gameId).maybeSingle()
    const finished = game?.status === 'finished'

    const viewerId = finished ? null : await resolveHandViewer(supabase, gameId, body)

    // Team-Up: a player also sees their teammate's cards in full. Resolve the teammate from the
    // session's turn_order (seating parity) and unredact both ids.
    let viewerIds: string | string[] | null = viewerId
    if (!finished && viewerId && game?.uno_team_mode === true) {
      const { data: session } = await supabase
        .from('uno_sessions')
        .select('turn_order')
        .eq('game_id', gameId)
        .maybeSingle()
      const teammateId = unoTeammateId(session?.turn_order ?? [], viewerId)
      viewerIds = [viewerId, teammateId].filter((id): id is string => !!id)
    }

    const { data: rows, error } = await supabase
      .from('uno_player_hands')
      .select('*')
      .eq('game_id', gameId)
      .order('player_order')
    if (error) {
      return NextResponse.json({ error: internalErrorMessage('uno/hands', error) }, { status: 500 })
    }

    if (finished) return NextResponse.json({ hands: rows ?? [] })
    return NextResponse.json({ hands: redactHands(rows ?? [], viewerIds) })
  } catch (err) {
    const message = internalErrorMessage('uno/hands', err, 'Failed to load hands')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
