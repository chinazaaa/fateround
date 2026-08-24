'use client'

import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { clearPlayerSession, getPlayerSession } from '@/lib/utils'
import { clearHostToken } from '@/lib/host-session'

export const leaveButtonClassName =
  'w-full rounded-[0.875rem] border border-red-500/50 bg-red-500 py-3.5 text-[0.9375rem] font-bold text-white shadow-[0_4px_14px_rgba(239,68,68,0.35)] transition-[background-color,transform,box-shadow] duration-150 hover:bg-red-600 hover:shadow-[0_6px_22px_rgba(239,68,68,0.45)] hover:-translate-y-px active:translate-y-0 active:scale-[0.99] disabled:opacity-35 disabled:cursor-not-allowed'

/** Quieter, outlined variant — for in-game footers where Leave shouldn't dominate the screen. */
export const leaveButtonQuietClassName =
  'w-full rounded-xl border border-red-500/30 py-2 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50'

export function LeaveGameButton({
  gameCode,
  playerId,
  onLeft,
  className = leaveButtonQuietClassName,
  label = 'Leave game',
  confirmTitle = 'Leave this game?',
  confirmMessage = 'You can rejoin with the same name if there is room.',
}: {
  gameCode: string
  playerId: string
  onLeft: () => void
  className?: string
  label?: string
  confirmTitle?: string
  confirmMessage?: string
}) {
  const { confirm } = useConfirm()
  const { error: toastError } = useToast()
  const [leaving, setLeaving] = useState(false)

  const leaveGame = async () => {
    if (leaving) return
    const ok = await confirm({
      title: confirmTitle,
      message: confirmMessage,
      confirmLabel: 'Leave',
      destructive: true,
    })
    if (!ok) return

    const resumeToken = getPlayerSession(gameCode)?.resumeToken
    if (!resumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }

    setLeaving(true)
    try {
      const res = await fetch('/api/players', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerId, resumeToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to leave')
      // Drop every local credential for this game. Without this: the Live
      // Games strip on the home page keeps recognising this device as the
      // host (readHostToken is still non-null), so Continue routes to
      // /host/[code] and verify-host fails with "invalid or missing host
      // token"; and refreshing an old /host/[code] tab still paints the
      // host chrome for a game the caller already walked out of.
      clearPlayerSession(gameCode)
      clearHostToken(gameCode)
      onLeft()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to leave')
    } finally {
      setLeaving(false)
    }
  }

  return (
    <button type="button" onClick={() => void leaveGame()} disabled={leaving} className={className}>
      {leaving ? 'Leaving…' : label}
    </button>
  )
}
