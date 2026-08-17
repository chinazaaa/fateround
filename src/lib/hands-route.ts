import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { redactHands, resolveHandViewer } from '@/lib/hand-redaction'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * The one implementation of `POST /api/<game>/hands` — the hand-redaction route described in
 * docs/rls-hardening.md § "Phase 7 — hand redaction".
 *
 * Whot was the canary and UNO the second game; Crazy Eights and Bingo are next, and four
 * hand-written copies of these sixty lines would be four copies of every bug found in them (the
 * #763 token race and the frozen-opponent-count bug both reached review as per-game copies). A
 * game now joins by naming its table.
 *
 * POST, not GET: the caller's resume token is a secret and must not land in a query string
 * (access logs, CDN logs, browser history) — same reasoning as /api/codewords/board.
 */
export interface HandsRouteConfig {
  /** The per-player hand table, one row per player, with a jsonb `cards` column. */
  table: string
  /** Tag used in error messages / logs, e.g. `'uno/hands'`. */
  tag: string
  /**
   * Extra player ids this viewer may see in FULL, beyond their own row — UNO's Team-Up partner
   * is the only case today. Resolved server-side from `viewerId` (itself resolved from a secret),
   * never from anything the client sent. Not called for spectators or finished games.
   */
  extraViewerIds?: (ctx: { supabase: SupabaseClient; gameId: string; viewerId: string }) => Promise<string[]> | string[]
}

export function createHandsRoute(config: HandsRouteConfig) {
  return async function POST(req: NextRequest) {
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
      // then everyone has seen them. Anything short of finished stays redacted.
      const { data: game } = await supabase.from('games').select('status').eq('id', gameId).maybeSingle()
      const finished = game?.status === 'finished'

      const viewerId = finished ? null : await resolveHandViewer(supabase, gameId, body)

      let viewerIds: string[] = viewerId ? [viewerId] : []
      if (viewerId && config.extraViewerIds) {
        const extra = await config.extraViewerIds({ supabase, gameId, viewerId })
        viewerIds = [viewerId, ...extra.filter(Boolean)]
      }

      const { data: rows, error } = await supabase
        .from(config.table)
        .select('*')
        .eq('game_id', gameId)
        .order('player_order')
      if (error) {
        return NextResponse.json({ error: internalErrorMessage(config.tag, error) }, { status: 500 })
      }

      if (finished) return NextResponse.json({ hands: rows ?? [] })
      return NextResponse.json({ hands: redactHands(rows ?? [], viewerIds) })
    } catch (err) {
      const message = internalErrorMessage(config.tag, err, 'Failed to load hands')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}
