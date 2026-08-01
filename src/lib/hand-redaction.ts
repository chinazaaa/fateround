import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeResumeToken } from '@/lib/utils'

/**
 * Shared redaction for the per-player hand tables (Whot, UNO, Crazy Eights, Bingo).
 *
 * These tables hold one row per player, and the row's whole point is that the OTHER players
 * cannot see it — yet `cards` is readable with the publishable anon key. Confirmed live during
 * the Aug 2026 audit follow-up: `select player_id, cards from whot_player_hands` returned every
 * hand in every game on the platform. The clients merely render other players' cards face-down;
 * that is presentation, not a control.
 *
 * Why this is not a one-line column revoke (the reason it needs its own change set):
 *
 *   1. Realtime `postgres_changes` payloads for these tables are applied DIRECTLY to state
 *      (`applyHandRow`), not used as a reload trigger. A payload missing `cards` would overwrite
 *      a good hand with an empty one.
 *   2. Worse, the views derive `myHand = row?.cards ?? []` and then
 *      `isOut = !!row && myHand.length === 0`, so a redacted row does not just blank the hand —
 *      it makes the client believe the player is OUT of the game.
 *
 * So the count has to survive redaction. `card_count` is public information in every one of
 * these games (you can see how many cards an opponent holds), and it is what the table UI and
 * the out/finished checks actually need.
 *
 * STATUS AND REMAINING WORK: docs/rls-hardening.md § "Phase 7 — hand redaction". Whot is the
 * canary; UNO, Crazy Eights and Bingo still read their hand tables directly from the browser,
 * and the migration revoking `cards` from anon must come LAST — one migration for all four,
 * only once every reader is on a route. Adding it earlier breaks live games.
 */

/** A hand row as the client is allowed to see it: own cards in full, others' as a count. */
export type RedactedHand<T> = Omit<T, 'cards'> & { cards: unknown[] | null; card_count: number }

/**
 * Redact every hand except the viewer's own.
 *
 * `viewerPlayerId` must be resolved from a SECRET (resume token / host token) by the caller —
 * never from a client-supplied playerId, which is public and forgeable (see lib/game-admin.ts).
 * Pass null for a spectator: every hand comes back as counts only.
 */
export function redactHands<T extends { player_id: string; cards: unknown }>(
  rows: T[],
  viewerPlayerId: string | null
): RedactedHand<T>[] {
  return rows.map((row) => {
    const cards = Array.isArray(row.cards) ? row.cards : []
    const isOwn = viewerPlayerId != null && row.player_id === viewerPlayerId
    return {
      ...row,
      // null (not []) for other players, so a consumer that forgets to check card_count fails
      // loudly on `.length` rather than silently rendering "no cards" — which is the exact
      // shape that would otherwise read as "this player is out".
      cards: isOwn ? cards : null,
      card_count: cards.length,
    } as RedactedHand<T>
  })
}

/**
 * Resolve the viewer for a hands request from whichever secret they hold.
 *
 * Returns the player id to unredact, or null for "show me counts only" — which is the correct
 * answer for a spectator, and the safe answer for a bad token.
 */
export async function resolveHandViewer(
  supabase: SupabaseClient,
  gameId: string,
  auth: { resumeToken?: string | null; hostToken?: string | null }
): Promise<string | null> {
  const token = normalizeResumeToken(String(auth.resumeToken ?? ''))
  if (token.length >= 4) {
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', gameId)
      .eq('resume_token', token)
      .maybeSingle()
    if (player) return player.id
  }
  // A host who is not seated has no hand of their own; they still only get counts. Running the
  // board never requires seeing anyone's cards.
  return null
}
