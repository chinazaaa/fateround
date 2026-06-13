import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gameKeys } from '@/lib/query-keys'
import type { Round } from '@/types'

export function useActiveRound(code: string, enabled = true) {
  return useQuery({
    queryKey: gameKeys.rounds.active(code),
    queryFn: async () => {
      const { data } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', code)
        .eq('status', 'active')
        .maybeSingle()
      return (data ?? null) as Round | null
    },
    staleTime: Infinity,
    enabled: !!code && enabled,
  })
}
