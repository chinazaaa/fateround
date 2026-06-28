'use client'

import { useCallback, useState } from 'react'
import { teamLabel } from '@/lib/codewords'
import { getPlayerSession } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import type { CodewordsPlayerRole } from '@/types'

export function usePromoteToPlayer(
  gameCode: string,
  playerId: string | null | undefined,
  onPromoted?: () => void | Promise<unknown>
) {
  const { success, error: toastError } = useToast()
  const [promoting, setPromoting] = useState(false)

  const promote = useCallback(async () => {
    if (!playerId || promoting) return
    const resumeToken = getPlayerSession(gameCode)?.resumeToken
    if (!resumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setPromoting(true)
    try {
      const res = await fetch('/api/players/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, resumeToken }),
      })
      const data = (await res.json()) as {
        error?: string
        codewordsRole?: CodewordsPlayerRole
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to join as player')

      if (data.codewordsRole) {
        success(`You're ${teamLabel(data.codewordsRole.team)} operative`)
      } else {
        success("You're in as a player!")
      }
      await onPromoted?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join as player')
    } finally {
      setPromoting(false)
    }
  }, [gameCode, onPromoted, playerId, promoting, success, toastError])

  return { promote, promoting }
}
