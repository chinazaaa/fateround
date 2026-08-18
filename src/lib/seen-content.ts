import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Batch-record content keys that players in a game have now seen.
 * Fire-and-forget — errors are caught and logged, never blocking game start.
 */
export async function recordSeenContent(
  supabase: SupabaseClient,
  gameId: string,
  gameType: string,
  contentKeys: string[]
): Promise<void> {
  try {
    if (contentKeys.length === 0) return

    const { data: players } = await supabase
      .from('players')
      .select('profile_id')
      .eq('game_id', gameId)
      .not('profile_id', 'is', null)

    const profileIds = (players ?? []).map((p) => p.profile_id as string).filter(Boolean)

    if (profileIds.length === 0) return

    const rows = profileIds.flatMap((profileId) =>
      contentKeys.map((key) => ({
        profile_id: profileId,
        game_type: gameType,
        content_key: key,
      }))
    )

    const BATCH = 500
    for (let i = 0; i < rows.length; i += BATCH) {
      await supabase.from('seen_content').upsert(rows.slice(i, i + BATCH), {
        onConflict: 'profile_id,game_type,content_key',
        ignoreDuplicates: true,
      })
    }
  } catch {
    // Best-effort — never block game start
  }
}

/**
 * For a set of player profiles, return how many of them have seen each content
 * item of the given game type. The returned map feeds directly into
 * `mergeUsageMaps` → `pickLeastUsed` so the picker prefers unseen content.
 */
export async function fetchSeenContentForPlayers(
  supabase: SupabaseClient,
  profileIds: string[],
  gameType: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (profileIds.length === 0) return result

  try {
    const { data } = await supabase.rpc('seen_content_counts', {
      p_profile_ids: profileIds,
      p_game_type: gameType,
    })

    if (data) {
      for (const row of data as { content_key: string; seen_count: number }[]) {
        result.set(row.content_key, row.seen_count)
      }
    }
  } catch {
    // Graceful degradation — return empty map, selection proceeds without seen data
  }

  return result
}

/**
 * Compute freshness stats for a lobby: what percentage of the content pool
 * has been seen by more than half the authenticated players.
 */
export function computeFreshnessStats(
  poolKeys: string[],
  seenCounts: Map<string, number>,
  authenticatedPlayerCount: number
): { seenByMost: number; seenPercent: number; fresh: boolean } {
  if (authenticatedPlayerCount < 2 || poolKeys.length === 0) {
    return { seenByMost: 0, seenPercent: 0, fresh: true }
  }

  const threshold = authenticatedPlayerCount / 2
  let seenByMost = 0
  for (const key of poolKeys) {
    if ((seenCounts.get(key) ?? 0) > threshold) seenByMost++
  }

  const seenPercent = Math.round((seenByMost / poolKeys.length) * 100)
  return { seenByMost, seenPercent, fresh: seenPercent < 60 }
}
