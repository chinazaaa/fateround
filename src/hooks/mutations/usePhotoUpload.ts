import { useMutation, useQueryClient } from '@tanstack/react-query'
import { gameKeys } from '@/lib/query-keys'

export function usePhotoUpload(gameCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch('/api/photos', { method: 'POST', body: formData })
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.participants(gameCode) })
    },
  })
}

export function usePhotoDelete(gameCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { gameId: string; participantId: string; resumeToken: string }) => {
      const res = await fetch('/api/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.participants(gameCode) })
    },
  })
}
