'use client'

import { useCallback, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

/**
 * Host action: deal a spectator into an ACTIVE card game. Mirror of useHostRemovePlayer,
 * but non-destructive (seats + deals a hand). `admitPath` selects the per-game admit route
 * (`whot-admit` for Whot, `crazy-eights-admit` for Crazy Eights).
 */
export function useHostAdmitPlayer(
  gameCode: string,
  hostToken: string,
  onAdmitted?: (playerId: string) => void | Promise<unknown>,
  admitPath: 'whot-admit' | 'crazy-eights-admit' = 'whot-admit'
) {
  const { confirm } = useConfirm()
  const { success, error: toastError } = useToast()
  const [admittingPlayerId, setAdmittingPlayerId] = useState<string | null>(null)

  const admitPlayer = useCallback(
    async (playerId: string, playerName: string) => {
      if (admittingPlayerId) return false
      const ok = await confirm({
        title: `Deal ${playerName} in?`,
        message: 'They will be seated at the end of the turn order and dealt a hand for this game.',
        confirmLabel: 'Deal in',
      })
      if (!ok) return false

      setAdmittingPlayerId(playerId)
      try {
        const res = await fetch(`/api/games/${gameCode}/${admitPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken, playerId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to deal player in')
        await onAdmitted?.(playerId)
        success(`${playerName} was dealt in`)
        return true
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to deal player in')
        return false
      } finally {
        setAdmittingPlayerId(null)
      }
    },
    [gameCode, hostToken, admitPath, confirm, onAdmitted, admittingPlayerId, success, toastError]
  )

  return { admitPlayer, admittingPlayerId }
}
