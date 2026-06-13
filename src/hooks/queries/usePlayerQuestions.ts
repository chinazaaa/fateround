import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { gameKeys } from '@/lib/query-keys'

export interface PlayerQuestion {
  id: string
  player_id: string
  question_type: string
  option_a?: string
  option_b?: string
  question_text?: string
}

export function usePlayerQuestions(code: string, enabled = true) {
  return useQuery({
    queryKey: gameKeys.playerQuestions(code),
    queryFn: async () => {
      const { data } = await supabase.from('player_questions').select('*').eq('game_id', code).order('created_at')
      return (data ?? []) as PlayerQuestion[]
    },
    staleTime: 10_000,
    enabled: !!code && enabled,
    refetchInterval: enabled ? 10_000 : false,
  })
}
