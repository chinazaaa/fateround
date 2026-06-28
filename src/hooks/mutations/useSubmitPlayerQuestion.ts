import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { gameKeys } from '@/lib/query-keys'

export function useSubmitPlayerQuestion(gameCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/player-questions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.playerQuestions(gameCode) })
    },
  })
}

export function useDeletePlayerQuestion(gameCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { questionId: string; resumeToken: string }) => api.delete('/player-questions', { data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.playerQuestions(gameCode) })
    },
  })
}
