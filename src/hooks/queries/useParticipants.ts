import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gameKeys } from '@/lib/query-keys'
import type { Participant } from '@/types'
import { PARTICIPANT_SELECT } from '@/lib/supabase-selects'

export function useParticipants(code: string) {
  return useQuery({
    queryKey: gameKeys.participants(code),
    queryFn: async () => {
      const { data } = await supabase
        .from('participants')
        .select(PARTICIPANT_SELECT)
        .eq('game_id', code)
        .order('display_order')
      return (data ?? []) as Participant[]
    },
    staleTime: Infinity,
    enabled: !!code,
  })
}
