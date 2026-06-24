import type { SupabaseClient } from '@supabase/supabase-js'
import { awardRoomGamePoints } from '@/lib/room-points'

export async function markGameFinished(
  supabase: SupabaseClient,
  gameId: string,
  finishedAt = new Date().toISOString()
) {
  const result = await supabase
    .from('games')
    .update({ status: 'finished', finished_at: finishedAt })
    .eq('id', gameId)

  if (!result.error) {
    try {
      await awardRoomGamePoints(supabase, gameId)
    } catch {
      // Room stats are best-effort — never block game finish.
    }
  }

  return result
}
