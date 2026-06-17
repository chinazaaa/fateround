import type { SupabaseClient } from '@supabase/supabase-js'

export async function markGameFinished(
  supabase: SupabaseClient,
  gameId: string,
  finishedAt = new Date().toISOString()
) {
  return supabase
    .from('games')
    .update({ status: 'finished', finished_at: finishedAt })
    .eq('id', gameId)
}
