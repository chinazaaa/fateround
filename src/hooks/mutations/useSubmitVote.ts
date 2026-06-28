import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { gameKeys } from '@/lib/query-keys'

interface VotePayload {
  resumeToken: string
  roundId: string
  gameId: string
  [key: string]: unknown
}

export function useSubmitVote(gameCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: VotePayload) => api.post('/votes', data),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.votes.byRound(gameCode, variables.roundId) })
    },
  })
}
