'use client'

import type { ReactNode } from 'react'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'
import { YahtzeeDiceRow } from '@/components/yahtzee/YahtzeeDice'
import { useTimerTickSound } from '@/hooks/useTimerTickSound'
import { unlockAudio } from '@/lib/sounds'

export function YahtzeeShell({
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
  const cfg = gameTypeConfig('yahtzee')

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
                <GameTypeBadge gameType="yahtzee" />
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

export function YahtzeeCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass-card ${className}`}>{children}</div>
}

export function YahtzeePrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  className = '',
  compact,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  className?: string
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        'btn-primary disabled:opacity-45 touch-manipulation',
        compact ? 'py-2.5 px-4 text-sm' : 'py-4 text-base sm:text-lg',
        className,
      ].join(' ')}
    >
      {loading ? '…' : children}
    </button>
  )
}

export function YahtzeeSecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn-secondary w-full py-3 text-sm font-semibold disabled:opacity-45"
    >
      {children}
    </button>
  )
}

export function YahtzeeLoadingScreen() {
  return (
    <YahtzeeShell>
      <div className="flex justify-center py-20">
        <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    </YahtzeeShell>
  )
}

export function YahtzeeRollPips({ rollsThisTurn, rollsPerTurn = 3 }: { rollsThisTurn: number; rollsPerTurn?: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`Roll ${rollsThisTurn} of ${rollsPerTurn}`}>
      {Array.from({ length: rollsPerTurn }, (_, i) => (
        <span
          key={i}
          className={[
            'h-2 w-2 rounded-full transition-all',
            i < rollsThisTurn
              ? 'bg-[var(--primary)] shadow-[0_0_4px_var(--primary-glow)]'
              : 'bg-[var(--border-strong)]',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

export function YahtzeeDiceTray({
  dice,
  held,
  rollsThisTurn,
  rollsRemaining,
  interactive,
  onToggleHold,
  onRoll,
  rolling,
  isMyTurn,
  turnName,
  spectator,
  secondsLeft = 0,
  hasTimer = false,
  urgent = false,
}: {
  dice: number[]
  held: boolean[]
  rollsThisTurn: number
  rollsRemaining: number
  interactive?: boolean
  onToggleHold?: (index: number) => void
  onRoll?: () => void
  rolling?: boolean
  isMyTurn?: boolean
  turnName?: string
  spectator?: boolean
  secondsLeft?: number
  hasTimer?: boolean
  urgent?: boolean
}) {
  const canRoll = isMyTurn && rollsRemaining > 0 && !spectator
  const showHoldHint = isMyTurn && rollsThisTurn > 0 && !spectator

  useTimerTickSound(secondsLeft, hasTimer)

  return (
    <YahtzeeCard className="yahtzee-dice-tray p-3 space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={[
              'h-2 w-2 rounded-full shrink-0',
              isMyTurn && !spectator ? 'bg-[var(--primary)] animate-pulse' : 'bg-[var(--border-strong)]',
            ].join(' ')}
          />
          <p className="text-xs font-bold text-[var(--foreground)] truncate">
            {isMyTurn && !spectator ? 'Your turn' : `${turnName ?? 'Player'}'s turn`}
          </p>
          {showHoldHint && (
            <span className="text-[10px] text-[var(--foreground)]/45 font-medium shrink-0">tap dice to keep</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasTimer && (
            <span
              className={[
                'text-xs font-black tabular-nums px-2 py-0.5 rounded-full transition-colors',
                urgent
                  ? 'bg-red-500 text-white animate-pulse'
                  : secondsLeft <= 20
                    ? 'bg-amber-400/80 text-amber-900'
                    : 'bg-[var(--surface-inset-bg)] text-[var(--foreground)]/60 border border-[var(--border-strong)]',
              ].join(' ')}
            >
              {secondsLeft}s
            </span>
          )}
          <YahtzeeRollPips rollsThisTurn={rollsThisTurn} />
          <span className="text-[10px] font-bold tabular-nums text-[var(--foreground)]/50">{rollsThisTurn}/3</span>
        </div>
      </div>

      {/* Dice + Roll button */}
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-3">
        <div className="flex-1 flex justify-center pb-0 sm:pb-2">
          <YahtzeeDiceRow dice={dice} held={held} interactive={interactive} onToggleHold={onToggleHold} />
        </div>

        {canRoll && onRoll && (
          <YahtzeePrimaryButton
            onClick={() => {
              unlockAudio()
              onRoll()
            }}
            loading={rolling}
            compact
            className="w-full sm:w-auto sm:shrink-0 text-center sm:min-w-[5.5rem] sm:max-w-[14rem] sm:self-center"
          >
            {rollsThisTurn === 0 ? '🎲 Roll' : '🎲 Roll again'}
          </YahtzeePrimaryButton>
        )}
      </div>

      {isMyTurn && rollsThisTurn > 0 && rollsRemaining === 0 && !spectator && (
        <p className="text-center text-xs font-bold text-[var(--primary)]">Pick a score from the board ↑</p>
      )}
    </YahtzeeCard>
  )
}
