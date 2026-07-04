import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { gameKeys } from '@/lib/query-keys'
import { getPlayerSession } from '@/lib/utils'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'

export function useJoinGame(gameCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/players', { gameCode, ...data }),
    onSuccess: () => {
      // GA key event: a player joined a room via code/link (viral conversion).
      trackEvent(GA_EVENTS.joinRoom)
      queryClient.invalidateQueries({ queryKey: gameKeys.players(gameCode) })
    },
  })
}

export function useUpdatePlayer(gameCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      const resumeToken = getPlayerSession(gameCode)?.resumeToken
      if (!resumeToken) {
        throw new Error('Your player session expired — rejoin to continue')
      }
      return api.patch('/players', { gameCode, resumeToken, ...data })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.players(gameCode) })
    },
  })
}

export function useLeaveGame(gameCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playerId: string) => {
      const resumeToken = getPlayerSession(gameCode)?.resumeToken
      if (!resumeToken) {
        throw new Error('Your player session expired — rejoin to continue')
      }
      return api.delete('/players', { data: { gameCode, playerId, resumeToken } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.players(gameCode) })
    },
  })
}
