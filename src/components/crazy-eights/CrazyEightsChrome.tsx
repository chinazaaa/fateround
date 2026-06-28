'use client'

import type { ReactNode } from 'react'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'
import { useTimerTickSound } from '@/hooks/useTimerTickSound'

export function CrazyEightsShell({
  children,
  title,
  subtitle,
  wide,
  compact,
}: {
  children: ReactNode
  title?: string
  subtitle?: string
  wide?: boolean
  compact?: boolean
}) {
  const cfg = gameTypeConfig('crazy_eights')

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div
        className={[
          'page-wrap flex flex-col items-center px-3 overflow-y-auto justify-start',
          compact ? 'py-3 sm:py-4' : 'py-8 sm:py-10',
        ].join(' ')}
      >
        <div
          className={['w-full', compact ? 'space-y-2' : 'space-y-5 sm:space-y-6', wide ? 'max-w-3xl' : 'max-w-lg'].join(
            ' '
          )}
        >
          {(title || subtitle) && !compact && (
            <header className="text-center space-y-2">
              <div className="inline-flex items-center justify-center gap-2">
                <span className="text-3xl drop-shadow-lg">{cfg.card.emoji}</span>
                <GameTypeBadge gameType="crazy_eights" />
              </div>
              {title && (
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title drop-shadow-sm">
                  {title}
                </h1>
              )}
              {subtitle && <p className="text-sm text-muted max-w-md mx-auto">{subtitle}</p>}
            </header>
          )}
          {compact && title && (
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-lg leading-none">{cfg.card.emoji}</span>
              <p className="text-sm font-bold text-[var(--foreground)] truncate">{title}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

export function CrazyEightsCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass-card ${className}`}>{children}</div>
}

export function CrazyEightsPrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  className = '',
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`btn-primary w-full ${className}`}
    >
      {loading ? '…' : children}
    </button>
  )
}

export function CrazyEightsSecondaryButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`btn-secondary w-full ${className}`}>
      {children}
    </button>
  )
}

export function CrazyEightsLoadingScreen() {
  return (
    <CrazyEightsShell>
      <CrazyEightsCard className="p-8 text-center">
        <div className="text-4xl animate-pulse mb-3">🃏</div>
        <p className="text-sm text-muted">Loading Crazy Eights…</p>
      </CrazyEightsCard>
    </CrazyEightsShell>
  )
}

export function CrazyEightsTurnBar({
  isMyTurn,
  turnName,
  secondsLeft = 0,
  hasTimer = false,
  urgent = false,
}: {
  isMyTurn?: boolean
  turnName?: string
  secondsLeft?: number
  hasTimer?: boolean
  urgent?: boolean
}) {
  useTimerTickSound(secondsLeft, hasTimer)

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={[
            'h-2 w-2 rounded-full shrink-0',
            isMyTurn ? 'bg-[var(--primary)] animate-pulse' : 'bg-[var(--border-strong)]',
          ].join(' ')}
        />
        <p className="text-xs font-bold text-[var(--foreground)] truncate">
          {isMyTurn ? 'Your turn' : `${turnName ?? 'Player'}'s turn`}
        </p>
      </div>
      {hasTimer && (
        <span
          className={[
            'text-xs font-black tabular-nums shrink-0',
            urgent ? 'text-red-500 animate-pulse' : 'text-muted',
          ].join(' ')}
        >
          {secondsLeft}s
        </span>
      )}
    </div>
  )
}
