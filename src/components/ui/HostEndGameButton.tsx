'use client'

import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

export function HostEndGameButton({
  gameCode,
  hostToken,
  onEnded,
  className = 'btn-secondary w-full',
  label = 'End game',
  icon,
  confirmTitle = 'End this game?',
  confirmMessage = 'Players will see the final results. You can start a new round from the lobby afterward.',
}: {
  gameCode: string
  hostToken: string
  onEnded?: () => void | Promise<unknown>
  className?: string
  label?: string
  icon?: React.ReactNode
  confirmTitle?: string
  confirmMessage?: string
}) {
  const { confirm } = useConfirm()
  const { error: toastError } = useToast()
  const [ending, setEnding] = useState(false)

  const endGame = async () => {
    if (ending) return
    const ok = await confirm({
      title: confirmTitle,
      message: confirmMessage,
      confirmLabel: 'End game',
      destructive: true,
    })
    if (!ok) return

    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end game')
      await onEnded?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to end game')
    } finally {
      setEnding(false)
    }
  }

  return (
    <button type="button" onClick={() => void endGame()} disabled={ending} className={className}>
      {!ending && icon}
      {ending ? 'Ending…' : label}
    </button>
  )
}
