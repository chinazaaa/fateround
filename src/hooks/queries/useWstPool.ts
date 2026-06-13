import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gameKeys } from '@/lib/query-keys'
import type { WstQuotePoolEntry } from '@/types'

export function useWstPool(code: string, enabled = true) {
  return useQuery({
    queryKey: gameKeys.wstPool(code),
    queryFn: async () => {
      const { data } = await supabase.from('wst_quote_pool').select('*').eq('game_id', code).order('created_at')
      return (data ?? []) as WstQuotePoolEntry[]
    },
    staleTime: Infinity,
    enabled: !!code && enabled,
  })
}
