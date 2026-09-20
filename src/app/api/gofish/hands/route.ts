import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { redactHands, resolveHandViewer } from '@/lib/hand-redaction'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * Go Fish hands, with every hand but the caller's own reduced to a card count.
 * Books survive redaction — they are public information in the physical game.
 *
 * POST, not GET: the caller's resume token is a secret and must not land in a query
 * string (access logs, CDN logs, browser history) — same reasoning as /api/whot/hands.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      gameCode?: string
      resumeToken?: string
      hostToken?: string
    }
    // `gameCode` comes off an unchecked `as {...}` cast, so it can be any JSON value. A
    // non-string cleared `?.` (which short-circuits on nullish, not falsy) and threw on
    // .toUpperCase(); the catch below turned that into a 500. Answer the same "missing
    // field" 400 that null, an absent field and '' already get.
    const gameId = typeof body.gameCode === 'string' ? body.gameCode.toUpperCase() : undefined
    if (!gameId) return NextResponse.json({ error: 'gameCode is required' }, { status: 400 })

    const limited = await enforceRateLimit(req, RATE_LIMITS.handsFetch)
    if (limited) return limited

    const supabase = getSupabaseAdmin()

    // Finished games publish their hands — everyone has already seen them by then.
    const { data: game } = await supabase.from('games').select('status').eq('id', gameId).maybeSingle()
    const finished = game?.status === 'finished'

    const viewerId = finished ? null : await resolveHandViewer(supabase, gameId, body)

    const { data: rows, error } = await supabase
      .from('gofish_player_hands')
      .select('*')
      .eq('game_id', gameId)
      .order('player_order')
    if (error) {
      return NextResponse.json({ error: internalErrorMessage('gofish/hands', error) }, { status: 500 })
    }

    if (finished) return NextResponse.json({ hands: rows ?? [] })
    return NextResponse.json({ hands: redactHands(rows ?? [], viewerId) })
  } catch (err) {
    const message = internalErrorMessage('gofish/hands', err, 'Failed to load hands')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
