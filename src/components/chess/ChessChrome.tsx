'use client'

import type { ReactNode } from 'react'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'

export function ChessShell({
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
  const cfg = gameTypeConfig('chess')

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
                <GameTypeBadge gameType="chess" />
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

export function ChessCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass-card ${className}`}>{children}</div>
}

export function ChessPrimaryButton({
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
      className={[
        'btn-primary w-full py-3 text-base font-bold transition-all',
        disabled || loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]',
        className,
      ].join(' ')}
    >
      {loading ? '…' : children}
    </button>
  )
}

export function ChessSecondaryButton({
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'btn-secondary w-full py-2.5 text-sm font-semibold',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function ChessLoadingScreen() {
  return (
    <ChessShell>
      <ChessCard className="p-8 text-center">
        <p className="text-muted animate-pulse">Loading game…</p>
      </ChessCard>
    </ChessShell>
  )
}

export function ChessTurnBar({
  turnPlayerName,
  isMyTurn,
  inCheck,
}: {
  turnPlayerName?: string
  isMyTurn?: boolean
  inCheck?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold border',
        isMyTurn
          ? 'bg-[var(--primary)]/15 border-[var(--primary)]/40 text-[var(--foreground)]'
          : 'bg-[var(--surface-inset-bg)] border-[var(--border)] text-muted',
      ].join(' ')}
    >
      <span>
        {isMyTurn ? 'Your turn' : turnPlayerName ? `${turnPlayerName}'s turn` : 'Waiting…'}
        {inCheck && <span className="ml-1.5 text-rose-400 font-black">Check!</span>}
      </span>
    </div>
  )
}
