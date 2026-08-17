import { createHandsRoute } from '@/lib/hands-route'
import { unoTeammateId } from '@/lib/uno'

/**
 * UNO hands, with every hand but the caller's own reduced to a card count.
 *
 * The shared implementation lives in lib/hands-route.ts (see docs/rls-hardening.md § "Phase 7 —
 * hand redaction"). UNO's only wrinkle is Team-Up (`games.uno_team_mode`): a player also sees
 * their teammate's hand in full, so the teammate id is resolved server-side from the session's
 * turn_order (seating parity) and added to the viewer set.
 */
export const POST = createHandsRoute({
  table: 'uno_player_hands',
  tag: 'uno/hands',
  extraViewerIds: async ({ supabase, gameId, viewerId }) => {
    const { data: game } = await supabase.from('games').select('uno_team_mode').eq('id', gameId).maybeSingle()
    if (game?.uno_team_mode !== true) return []
    const { data: session } = await supabase
      .from('uno_sessions')
      .select('turn_order')
      .eq('game_id', gameId)
      .maybeSingle()
    const teammateId = unoTeammateId(session?.turn_order ?? [], viewerId)
    return teammateId ? [teammateId] : []
  },
})
