import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Serialises `POST /api/games/[code]/start`.
 *
 * The route checks `status = 'waiting'` and then, many awaits later, writes the session
 * (rounds, hands, boards, ...) and flips the game to `active`. Two overlapping start requests
 * (a host double-tap, a client retry after a slow response) both pass that check, so every
 * game that seeds its rounds with a plain insert ended up with the rounds twice (Trivia 10
 * rounds became 30, two rounds "active" at once), and the rest returned a 500 to the loser.
 *
 * A start therefore first CLAIMS the lobby with one conditional UPDATE on the games row:
 * `start_claimed_at` must be null (or older than the TTL, so a crashed start can never wedge a
 * lobby). Postgres row-locks the UPDATE, so exactly one overlapping request gets a row back.
 * The claim is released when the attempt ends, whatever the outcome: on failure the host can
 * start again straight away, on success the game is `active` and the claim has no further job.
 */

/** A start that has not finished by now is presumed dead and may be taken over. */
export const START_CLAIM_TTL_MS = 60_000

export type StartClaim = { ok: true; token: string | null } | { ok: false }

/**
 * Try to claim the start of a waiting game.
 *
 * Fails OPEN on a database error: the claim is a guard against a race, so being unable to take
 * it (for example while the column has not been migrated yet) must not stop a host starting.
 */
export async function claimGameStart(supabase: SupabaseClient, gameId: string): Promise<StartClaim> {
  const token = new Date().toISOString()
  const staleBefore = new Date(Date.now() - START_CLAIM_TTL_MS).toISOString()
  const { data, error } = await supabase
    .from('games')
    .update({ start_claimed_at: token })
    .eq('id', gameId)
    .eq('status', 'waiting')
    .or(`start_claimed_at.is.null,start_claimed_at.lt.${staleBefore}`)
    .select('id')
  if (error) {
    console.error(`game start claim failed for ${gameId}; starting unguarded`, error.message)
    return { ok: true, token: null }
  }
  if (!data || data.length === 0) return { ok: false }
  return { ok: true, token }
}

/** Release a claim taken by {@link claimGameStart}. Best effort; a stuck claim expires on its own. */
export async function releaseGameStart(supabase: SupabaseClient, gameId: string, token: string | null) {
  if (!token) return
  const { error } = await supabase
    .from('games')
    .update({ start_claimed_at: null })
    .eq('id', gameId)
    .eq('start_claimed_at', token)
  if (error) console.error(`game start claim release failed for ${gameId}`, error.message)
}
