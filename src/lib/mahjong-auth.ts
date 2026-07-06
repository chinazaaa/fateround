import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeResumeToken } from '@/lib/utils'

type PlayerAuthRow = {
  id: string
  resume_token: string | null
}

export async function verifyMahjongPlayerAccess(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string | null | undefined,
  resumeToken: string | null | undefined
): Promise<boolean> {
  if (!playerId || !resumeToken?.trim()) return false

  const { data, error } = await supabase
    .from('players')
    .select('id, resume_token')
    .eq('game_id', gameId)
    .eq('id', playerId)
    .maybeSingle()

  if (error || !data) return false
  const row = data as PlayerAuthRow
  if (!row.resume_token) return false

  return normalizeResumeToken(row.resume_token) === normalizeResumeToken(resumeToken)
}
