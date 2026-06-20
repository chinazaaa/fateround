'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { DICE_PIPS } from '@/components/monopoly/monopoly-ui'
import type { LudoDiceRoll } from '@/types'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'
import { useTimerTickSound } from '@/hooks/useTimerTickSound'
import { SoundToggle } from '@/components/SoundToggle'

export function LudoShell({
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
  const cfg = gameTypeConfig('ludo')

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div
        className={[
          'page-wrap flex flex-col items-center px-3 overflow-y-auto justify-start',
          compact ? 'py-3 sm:py-4' : 'py-8 sm:py-10',
        ].join(' ')}
      >
        <div
          className={[
            'w-full',
            compact ? 'space-y-2' : 'space-y-5 sm:space-y-6',
            wide ? 'max-w-3xl' : 'max-w-lg',
          ].join(' ')}
        >
          {(title || subtitle) && !compact && (
            <header className="text-center space-y-2">
              <div className="inline-flex items-center justify-center gap-2">
                <span className="text-3xl drop-shadow-lg">{cfg.card.emoji}</span>
                <GameTypeBadge gameType="ludo" />
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
          <SoundToggle />
        </div>
      </div>
    </div>
  )
}

export function LudoCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass-card ${className}`}>{children}</div>
}

export function LudoPrimaryButton({
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

export function LudoSecondaryButton({
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

export function LudoLoadingScreen() {
  return (
    <LudoShell>
      <LudoCard className="p-8 text-center">
        <p className="text-muted animate-pulse">Loading game…</p>
      </LudoCard>
    </LudoShell>
  )
}

export function LudoTurnBar({
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
      <span>
        {isMyTurn ? 'Your turn' : turnPlayerName ? `${turnPlayerName}'s turn` : 'Waiting…'}
      </span>
      {hasTimer && secondsLeft != null && secondsLeft > 0 && (
        <span className={urgent ? 'text-amber-400 font-black tabular-nums' : 'tabular-nums'}>{secondsLeft}s</span>
      )}
    </div>
  )
}

export function LudoDiceFace({
  value,
  rolling,
  compact = false,
}: {
  value: number
  rolling?: boolean
  compact?: boolean
}) {
  const pips = DICE_PIPS[value] ?? DICE_PIPS[1]!
  const sizeClass = compact ? 'h-8 w-8 rounded-md sm:h-10 sm:w-10 sm:rounded-lg' : 'h-14 w-14 rounded-xl'
  const pipGridClass = compact ? 'h-5 w-5 gap-px sm:h-6 sm:w-6' : 'h-9 w-9 gap-0.5'
  const pipDotClass = compact ? 'h-1 w-1' : 'h-2 w-2'

  return (
    <div
      className={[
        'relative flex items-center justify-center border-2 border-neutral-200 bg-gradient-to-br from-white to-neutral-100 shadow-lg',
        sizeClass,
        rolling ? 'animate-pulse scale-105' : '',
      ].join(' ')}
      aria-label={`Die showing ${value}`}
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

export function LudoDicePair({
  dice,
  rolling,
  compact = false,
}: {
  dice: LudoDiceRoll | null | undefined
  rolling?: boolean
  compact?: boolean
}) {
  const [cycle1, setCycle1] = useState(1)
  const [cycle2, setCycle2] = useState(2)

  useEffect(() => {
    if (!rolling) return
    const id = setInterval(() => {
      setCycle1((v) => (v % 6) + 1)
      setCycle2((v) => ((v + 2) % 6) + 1)
    }, 80)
    return () => clearInterval(id)
  }, [rolling])

  const d1 = rolling ? cycle1 : dice?.d1 ?? 1
  const d2 = rolling ? cycle2 : dice?.d2 ?? 1
  const gapClass = compact ? 'gap-1' : 'gap-2'

  return (
    <div className={['flex flex-col items-center', compact ? 'gap-0.5' : 'gap-1'].join(' ')}>
      <div className={['flex items-center justify-center', gapClass].join(' ')}>
        <LudoDiceFace value={d1} rolling={rolling} compact={compact} />
        <LudoDiceFace value={d2} rolling={rolling} compact={compact} />
      </div>
      {dice && !rolling && (
        <p className="text-[8px] sm:text-[10px] font-bold text-slate-900 tabular-nums leading-none">
          {dice.total}
          {dice.doubles ? ' · Doubles!' : ''}
        </p>
      )}
    </div>
  )
}
