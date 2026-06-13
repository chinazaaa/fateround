import { useQuery } from '@tanstack/react-query'
import { gameKeys } from '@/lib/query-keys'
import { api } from '@/lib/api-client'

export function useHotSeatSubmissions(code: string, roundId: string | null, enabled = true) {
  return useQuery({
    queryKey: gameKeys.hotSeat(code, roundId ?? ''),
    queryFn: async () => {
      const { data } = await api.get('/hot-seat', {
        params: { roundId, gameId: code },
      })
      return (data.submissions ?? []) as { id: string; text: string; submission_type: string }[]
    },
    staleTime: Infinity,
    enabled: !!code && !!roundId && enabled,
    retry: 3,
    retryDelay: 1000,
  })
}
