import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve a tournament resume code → tournament_players.id (server-side).
 *
 * Sibling of `tournament-player-token.ts`, which is the CLIENT half (reading
 * the player's own code out of localStorage). This module is the server half:
 * turning a submitted code back into the player it belongs to.
 *
 * These codes exist in two shapes: the current short code (8 chars, uppercase,
 * from gen_tournament_player_token's confusable-free alphabet) and legacy
 * lowercase UUIDs minted before 20260703170000. A player may type either in
 * any case, so the lookup has to be case-insensitive.
 *
 * It must NOT be done with `.ilike()`. ILIKE treats `%` and `_` as wildcards
 * (and PostgREST additionally maps `*` to `%`), so a caller who knows only the
 * publicly-shared tournament code could send `________` and match any 8-char
 * token in the tournament. Where the result authorises something — claiming
 * the host role, cancelling a nomination, registering for push, reclaiming a
 * seat — that is an auth bypass, and the single-row/multi-row/no-row responses
 * form an oracle that lets a token be enumerated a character at a time.
 *
 * Matching a small candidate set with `.in()` keeps the case-insensitivity but
 * uses plain equality, so no part of the input is ever interpreted as a
 * pattern. Both canonical forms are covered: short codes are uppercase, legacy
 * UUIDs are lowercase.
 */
export async function resolveTournamentPlayerId(
  admin: SupabaseClient,
  tournamentId: string,
  rawToken: string
): Promise<{ playerId: string | null; token: string | null; error: boolean }> {
  const token = rawToken.trim()
  if (!token) return { playerId: null, token: null, error: false }

  const candidates = Array.from(new Set([token, token.toUpperCase(), token.toLowerCase()]))

  const { data, error } = await admin
    .from('tournament_player_tokens')
    // `token` comes back too so callers can echo the CANONICAL stored casing to
    // the client rather than whatever the user typed.
    .select('player_id, token')
    .eq('tournament_id', tournamentId)
    .in('token', candidates)
    .maybeSingle()

  // A query error (DB/RLS failure) must not masquerade as "not found" — the
  // caller returns 500 rather than telling the user their code is wrong.
  if (error) return { playerId: null, token: null, error: true }
  return {
    playerId: (data?.player_id as string | undefined) ?? null,
    token: (data?.token as string | undefined) ?? null,
    error: false,
  }
}
