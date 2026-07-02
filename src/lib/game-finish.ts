import type { SupabaseClient } from '@supabase/supabase-js'
import { awardRoomGamePoints } from '@/lib/room-points'

export async function markGameFinished(
  supabase: SupabaseClient,
  gameId: string,
  finishedAt = new Date().toISOString(),
  // Flows where several requests can independently detect the finish at once (e.g.
  // sudoku's "first to solve the whole board") should pass `onlyIfActive` so the
  // active→finished transition is a single-winner CAS — otherwise every racer's
  // update succeeds and `awardRoomGamePoints` runs more than once for one game.
  { onlyIfActive = false }: { onlyIfActive?: boolean } = {}
) {
  const update = supabase.from('games').update({ status: 'finished', finished_at: finishedAt }).eq('id', gameId)
  const result = onlyIfActive ? await update.eq('status', 'active').select('id') : await update

  // With the guard, only the request that actually flipped the row (non-empty data)
  // won the transition and should award points; losers get an empty set, no error.
  const won = !onlyIfActive || (Array.isArray(result.data) && result.data.length > 0)

  if (!result.error && won) {
    try {
      await awardRoomGamePoints(supabase, gameId)
    } catch {
      // Room stats are best-effort — never block game finish.
    }
  }

  return result
}
