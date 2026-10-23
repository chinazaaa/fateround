import { createHandsRoute } from '@/lib/hands-route'

/**
 * Rummy hands, with every hand but the caller's own reduced to a card count.
 *
 * The shared implementation lives in lib/hands-route.ts (see docs/rls-hardening.md § "Phase 7 —
 * hand redaction"). Rummy needs no `extraViewerIds`: there is no Team-Up partner to reveal and no
 * per-hand state beyond `cards`.
 *
 * It does need `alsoFinished`. Both Rummy views show the finished screen when
 * `rummy_sessions.phase === 'finished'` OR `games.status === 'finished'`, while `finishRummyGame`
 * writes the session phase first and flips `games.status` second. Gating de-redaction on
 * `games.status` alone would build the final standings from redacted rows for the width of that
 * gap — every opponent at 0 cards and 0 points, and `rummyPlacementOrder` wrong with them — and
 * permanently if the second write fails, which `src/lib/rummy.ts` explicitly handles as possible.
 */
export const POST = createHandsRoute({
  table: 'rummy_player_hands',
  tag: 'rummy/hands',
  alsoFinished: async ({ supabase, gameId }) => {
    const { data } = await supabase.from('rummy_sessions').select('phase').eq('game_id', gameId).maybeSingle()
    return data?.phase === 'finished'
  },
})
