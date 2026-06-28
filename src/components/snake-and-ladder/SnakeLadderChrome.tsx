'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { DICE_PIPS } from '@/components/monopoly/monopoly-ui'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'
import { useTimerTickSound } from '@/hooks/useTimerTickSound'

export function SnakeLadderShell({
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
  const cfg = gameTypeConfig('snake_and_ladder')

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
                <GameTypeBadge gameType="snake_and_ladder" />
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

export function SnakeLadderCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass-card ${className}`}>{children}</div>
}

export function SnakeLadderPrimaryButton({
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

export function SnakeLadderSecondaryButton({
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

export function SnakeLadderLoadingScreen() {
  return (
    <SnakeLadderShell>
      <SnakeLadderCard className="p-8 text-center">
        <p className="text-muted animate-pulse">Loading game…</p>
      </SnakeLadderCard>
    </SnakeLadderShell>
  )
}

export function SnakeLadderTurnBar({
  turnPlayerName,
  isMyTurn,
  secondsLeft,
  hasTimer,
  urgent,
}: {
  turnPlayerName?: string
  isMyTurn?: boolean
  secondsLeft?: number
  hasTimer?: boolean
  urgent?: boolean
}) {
  useTimerTickSound(secondsLeft ?? 0, !!hasTimer)

  return (
    <div
      className={[
        'flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold border',
        isMyTurn
          ? 'bg-[var(--primary)]/15 border-[var(--primary)]/40 text-[var(--foreground)]'
          : 'bg-[var(--surface-inset-bg)] border-[var(--border)] text-muted',
        urgent ? 'animate-pulse border-amber-400/60 bg-amber-500/10' : '',
      ].join(' ')}
    >
      <span>{isMyTurn ? 'Your turn' : turnPlayerName ? `${turnPlayerName}'s turn` : 'Waiting…'}</span>
      {hasTimer && secondsLeft != null && secondsLeft > 0 && (
        <span className={urgent ? 'text-amber-400 font-black tabular-nums' : 'tabular-nums'}>{secondsLeft}s</span>
      )}
    </div>
  )
}

export function SnakeLadderDie({
  value,
  rolling,
  size = 'md',
}: {
  value: number
  rolling?: boolean
  size?: 'sm' | 'md'
}) {
  const [cycle, setCycle] = useState(value)

  useEffect(() => {
    if (!rolling) return
    const id = setInterval(() => setCycle((v) => (v % 6) + 1), 80)
    return () => clearInterval(id)
  }, [rolling])

  const shown = rolling ? cycle : value
  const pips = DICE_PIPS[shown] ?? DICE_PIPS[1]!
  const sizeClass = size === 'sm' ? 'h-10 w-10 rounded-lg' : 'h-14 w-14 rounded-xl'
  const pipGridClass = size === 'sm' ? 'h-6 w-6 gap-0.5' : 'h-9 w-9 gap-0.5'
  const pipDotClass = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'

  return (
    <div
      className={[
        'relative flex items-center justify-center border-2 border-neutral-200 bg-gradient-to-br from-white to-neutral-100 shadow-lg',
        sizeClass,
        rolling ? 'animate-pulse scale-105' : '',
      ].join(' ')}
      aria-label={`Die showing ${shown}`}
    >
      <div className={['grid grid-cols-3 grid-rows-3', pipGridClass].join(' ')}>
        {Array.from({ length: 9 }, (_, i) => {
          const row = Math.floor(i / 3)
          const col = i % 3
          const show = pips.some(([r, c]) => r === row && c === col)
          return (
            <div key={i} className="flex items-center justify-center">
              {show ? <div className={['rounded-full bg-neutral-900 shadow-sm', pipDotClass].join(' ')} /> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
