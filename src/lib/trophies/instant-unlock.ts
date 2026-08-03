import type { SupabaseClient } from '@supabase/supabase-js'
import { INSTANT_TROPHY_IDS } from './system-catalog'

/**
 * Record a trophy the player just earned, mid-round.
 *
 * CALL THIS FROM A GAME ACTION HANDLER, from state the server computed itself. Never from
 * anything a client asserted — an unlock the client can claim is a free trophy for anyone with
 * devtools. The handler already knows the fact (it just scored the Yahtzee, it just played the
 * last card); this only writes it down.
 *
 * It does NOT grant the trophy. `player_trophies` is keyed by profile and no profile exists
 * during play, so this records the unlock against the PLAYER and the award pass folds it in at
 * finish. A guest who never signs in still sees the toast and simply keeps nothing — which is
 * the deal a guest already has everywhere else on the platform.
 *
 * BEST-EFFORT, ALWAYS. A trophy must never break a turn. Every failure is swallowed: the worst
 * case is a missing toast, and the trophy is still earned at finish through the normal counter
 * path, because instant unlocks are a *presentation* shortcut and not the source of truth.
 *
 * Idempotent — one row per (game, player, trophy), upserted. A route may call it on every
 * matching action without checking whether it already fired.
 */
export async function unlockNow(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string | null | undefined,
  trophyId: string
): Promise<void> {
  if (!playerId) return
  // Refuse anything not declared instant-eligible. Without this, a call site could quietly make
  // a finish-derived trophy pop early — showing a toast for something the counters may not
  // actually grant at finish, which is worse than staying silent.
  if (!INSTANT_TROPHY_IDS.has(trophyId)) return

  try {
    await supabase
      .from('round_unlocks')
      .upsert(
        { game_id: gameId, player_id: playerId, trophy_id: trophyId },
        { onConflict: 'game_id,player_id,trophy_id' }
      )
  } catch {
    // Never let a trophy break a turn.
  }
}

/**
 * Trophy ids this player unlocked mid-round, for the award pass to grant at finish.
 *
 * Returns ids only; whether the profile already holds one is `grantEligible`'s business, and it
 * already skips anything held. So a trophy unlocked in round one and again in round two is
 * granted once, exactly as if it had come through the counters.
 */
export async function unlockedThisRound(supabase: SupabaseClient, gameId: string, playerId: string): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('round_unlocks')
      .select('trophy_id')
      .eq('game_id', gameId)
      .eq('player_id', playerId)
    return (data ?? []).map((r) => r.trophy_id as string)
  } catch {
    return []
  }
}
