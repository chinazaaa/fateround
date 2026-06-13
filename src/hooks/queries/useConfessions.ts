import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gameKeys } from '@/lib/query-keys'
import type { Confession } from '@/types'

export function useConfessions(code: string, enabled = true) {
  return useQuery({
    queryKey: gameKeys.confessions.all(code),
    queryFn: async () => {
      const { data } = await supabase.from('confessions').select('*').eq('game_id', code).order('created_at')
      return (data ?? []) as Confession[]
    },
    staleTime: Infinity,
    enabled: !!code && enabled,
  })
}
