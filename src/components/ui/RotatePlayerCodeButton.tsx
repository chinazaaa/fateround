'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { getPlayerSession, setPlayerSession } from '@/lib/utils'
import { stripResumeTokenFromUrl } from '@/lib/player-resume'

/**
 * "Rotate player code" — issues a fresh resume token for the caller's own seat and
 * invalidates the old continue link. Lived in the old GameShareMenu; the redesigned
 * chrome dropped it, so this restores it as a button (e.g. in the ⚙ settings sheet).
 * Reads the seat from the local session, so it only needs the game code.
 */
export function RotatePlayerCodeButton({ gameCode, className }: { gameCode: string; className?: string }) {
  const { confirm } = useConfirm()
  const { success, error } = useToast()
  const router = useRouter()
  const [rotating, setRotating] = useState(false)

  const rotate = async () => {
    if (rotating) return
    const session = getPlayerSession(gameCode)
    if (!session?.resumeToken) {
      error('No player code to rotate on this device.')
      return
    }
    const ok = await confirm({
      title: 'Rotate player code?',
      message:
        'If you accidentally shared your player code, generate a new one to protect your seat. Your old continue link stops working immediately.',
      confirmLabel: 'Rotate code',
      destructive: true,
    })
    if (!ok) return

    setRotating(true)
    try {
      const res = await fetch('/api/players/resume/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, resumeToken: session.resumeToken }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to rotate code')
      setPlayerSession(gameCode, session.playerId, session.playerName, session.playerGender, body.newToken)
      stripResumeTokenFromUrl()
      success('Your new player code is active.')
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to rotate code')
    } finally {
      setRotating(false)
    }
  }

  const defaultClass =
    'flex w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] px-3.5 py-3 text-sm font-semibold text-body transition-colors hover:text-[var(--foreground)]'

  return (
    <button type="button" onClick={() => void rotate()} disabled={rotating} className={className || defaultClass}>
      <RotateIcon />
      <span>{rotating ? 'Rotating…' : 'Rotate player code'}</span>
    </button>
  )
}

function RotateIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5v4.5H14M5.5 21.5V17H10" />
    </svg>
  )
}
