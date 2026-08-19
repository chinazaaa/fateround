'use client'

import { useEffect, useState } from 'react'
import { resumePlayerSession } from '@/lib/player-resume'
import { getPlayerSession, normalizeResumeToken } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

export function PlayerResumeEntry({
  gameCode,
  onResumed,
  className = '',
}: {
  gameCode: string
  onResumed: () => void | Promise<unknown>
  className?: string
}) {
  const { error: toastError, success } = useToast()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  // Only useful before you're in — it's how you reclaim a seat you joined on
  // another device. Once this browser holds a session (e.g. the waiting screen,
  // which some games render inside the same join shell), hide it. Polls because
  // the session appears the moment you join without remounting this component.
  const [hasSession, setHasSession] = useState(false)
  useEffect(() => {
    const check = () => setHasSession(!!getPlayerSession(gameCode)?.playerId)
    check()
    const id = window.setInterval(check, 1000)
    return () => window.clearInterval(id)
  }, [gameCode])
  if (hasSession) return null

  const submit = async () => {
    const token = normalizeResumeToken(code)
    if (token.length < 4) {
      toastError('Enter your player code')
      return
    }
    setLoading(true)
    try {
      const session = await resumePlayerSession(gameCode, token)
      if (!session) {
        toastError('Player code not found — check the code and try again')
        return
      }
      success(`Welcome back, ${session.playerName}`)
      setCode('')
      setOpen(false)
      await onResumed()
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className={`group flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] hover:bg-[var(--surface-inset-bg)] ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-inset-bg)] text-sm text-[var(--primary)]"
          >
            ↩
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-sm font-semibold text-body">Already joined?</span>
            <span className="block text-xs text-faint">Continue with your player code</span>
          </span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5"
        >
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    )
  }

  return (
    <div className={`glass-card p-4 space-y-3 ${className}`}>
      <div className="space-y-1">
        <p className="text-muted text-xs uppercase tracking-wider">Continue your game</p>
        <p className="text-faint text-xs">Enter the player code from your other device.</p>
      </div>
      {/*
        `maxLength` is deliberately not a token length. The DB trigger mints 16-char tokens while
        RESUME_TOKEN_LENGTH is 24, and `normalizeResumeToken` strips the spaces or dashes a pasted
        code may carry — so any exact cap is wrong for some code. It was 8, which truncated every
        real token and made this entry fail with "Player code not found" 100% of the time. Keep a
        generous bound here and let `submit` do the real validation.
      */}
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        placeholder="Player code"
        autoFocus
        maxLength={64}
        className="input-field w-full text-center font-mono text-lg tracking-[0.2em] uppercase"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 py-2.5 text-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={loading || normalizeResumeToken(code).length < 4}
          className="btn-primary flex-1 py-2.5 text-sm"
        >
          {loading ? 'Checking…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
