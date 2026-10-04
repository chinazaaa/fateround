import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gameKeys } from '@/lib/query-keys'
import type { Round, Vote, Confession } from '@/types'
import { CONFESSION_SELECT, ROUND_SELECT, VOTE_SELECT } from '@/lib/supabase-selects'

export function useAllResults(code: string, enabled = true) {
  return useQuery({
    queryKey: gameKeys.allResults(code),
    queryFn: async () => {
      const [{ data: rounds }, { data: votes }, { data: confessions }] = await Promise.all([
        supabase.from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
        supabase.from('votes').select(VOTE_SELECT).eq('game_id', code),
        supabase.from('confessions').select(CONFESSION_SELECT).eq('game_id', code).order('created_at'),
      ])
      return {
        rounds: (rounds ?? []) as Round[],
        votes: (votes ?? []) as Vote[],
        confessions: (confessions ?? []) as Confession[],
      }
    },
    staleTime: Infinity,
    enabled: !!code && enabled,
  })
}
