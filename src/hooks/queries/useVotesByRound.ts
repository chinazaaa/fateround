import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gameKeys } from '@/lib/query-keys'
import type { Vote } from '@/types'

export function useVotesByRound(code: string, roundId: string | null) {
  return useQuery({
    queryKey: gameKeys.votes.byRound(code, roundId ?? ''),
    queryFn: async () => {
      const { data } = await supabase.from('votes').select('*').eq('round_id', roundId!)
      return (data ?? []) as Vote[]
    },
    staleTime: Infinity,
    enabled: !!code && !!roundId,
  })
}
