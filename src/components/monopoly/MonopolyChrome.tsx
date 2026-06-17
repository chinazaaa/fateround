'use client'

import type { ReactNode } from 'react'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'

export function MonopolyShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode
  title?: string
  subtitle?: string
}) {
  const cfg = gameTypeConfig('monopoly')

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: 'var(--bg-gradient)' }}
      />

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-28 pt-5 sm:pt-8 space-y-5">
        {(title || subtitle) && (
          <header className="text-center space-y-2">
            <div className="inline-flex items-center justify-center gap-2">
              <span className="text-3xl drop-shadow-lg">{cfg.card.emoji}</span>
              <GameTypeBadge gameType="monopoly" />
            </div>
            {title && (
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title drop-shadow-sm">{title}</h1>
            )}
            {subtitle && <p className="text-sm text-muted max-w-md mx-auto">{subtitle}</p>}
          </header>
        )}
        {children}
      </div>
    </div>
  )
}

export function MonopolyGlassCard({
  children,
  className = '',
  glow,
}: {
  children: ReactNode
  className?: string
  glow?: 'accent' | 'primary' | 'none'
}) {
  const glowClass =
    glow === 'accent'
      ? 'shadow-[var(--card-shadow-glow)] border-[color-mix(in_srgb,var(--marry)_35%,var(--border-strong))]'
      : glow === 'primary'
        ? 'shadow-[var(--card-shadow-glow)] border-[color-mix(in_srgb,var(--primary)_35%,var(--border-strong))]'
        : 'border-[var(--border-strong)] shadow-[var(--card-shadow)]'

  return (
    <div
      className={[
        'rounded-2xl border bg-[var(--card)] backdrop-blur-xl',
        glowClass,
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function MonopolyStatusBanner({ message, isMyTurn }: { message: string; isMyTurn?: boolean }) {
  if (!message) return null
  return (
    <MonopolyGlassCard
      glow={isMyTurn ? 'accent' : 'primary'}
      className={['px-4 py-3 text-sm leading-relaxed', isMyTurn ? 'text-[var(--foreground)]' : 'text-muted'].join(' ')}
    >
      {isMyTurn && (
        <span className="mr-2 inline-block rounded-full bg-[color-mix(in_srgb,var(--marry)_25%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--marry)]">
          Your turn
        </span>
      )}
      {message}
    </MonopolyGlassCard>
  )
}

export function MonopolyPrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  variant = 'gold',
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'gold' | 'green' | 'ghost'
}) {
  const styles =
    variant === 'gold'
      ? 'bg-gradient-to-b from-[var(--marry)] to-[color-mix(in_srgb,var(--marry)_75%,#000)] text-[var(--background)] shadow-[0_4px_16px_color-mix(in_srgb,var(--marry)_40%,transparent)] hover:brightness-110 active:translate-y-0.5'
      : variant === 'green'
        ? 'bg-gradient-to-b from-[var(--primary)] to-[var(--primary-strong)] text-white shadow-[0_4px_16px_var(--primary-glow)] hover:brightness-110 active:translate-y-0.5'
        : 'bg-[var(--surface-inset-bg)] text-[var(--foreground)] border border-[var(--border-strong)] hover:bg-[var(--card-hover)]'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        'w-full rounded-2xl px-5 py-4 text-base font-black tracking-wide transition-all',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none',
        styles,
      ].join(' ')}
    >
      {loading ? '…' : children}
    </button>
  )
}

export function MonopolySecondaryButton({
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
      className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--card)] px-5 py-3.5 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)] disabled:opacity-40 transition-colors"
    >
      {children}
    </button>
  )
}

export function MonopolyCashBadge({ amount, label = 'Your cash' }: { amount: number; label?: string }) {
  return (
    <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_35%,var(--border-strong))] bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] px-4 py-2.5 text-right shadow-[var(--card-shadow)]">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className="text-2xl font-black tabular-nums text-[var(--primary)]">£{amount.toLocaleString('en-GB')}</p>
    </div>
  )
}

export function MonopolyTurnStrip({
  turnName,
  isMyTurn,
  phase,
  myName,
}: {
  turnName: string
  isMyTurn?: boolean
  phase?: string
  myName?: string | null
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0 flex-1">
      {myName && (
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-[color-mix(in_srgb,var(--primary)_40%,var(--border-strong))] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-3 py-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">You</span>
          <span className="text-sm font-bold text-[var(--foreground)] truncate max-w-[140px]">{myName}</span>
        </div>
      )}
      <MonopolyGlassCard className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">Current turn</p>
          <p className="text-lg font-black text-[var(--foreground)] truncate">
            {isMyTurn ? 'Your turn' : turnName}
          </p>
          {isMyTurn && myName && (
            <p className="text-xs text-muted truncate">{myName}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          {isMyTurn ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--marry)_20%,transparent)] px-3 py-1 text-xs font-bold text-[var(--marry)]">
              <span className="h-2 w-2 rounded-full bg-[var(--marry)] animate-pulse" />
              Roll
            </span>
          ) : (
            <span className="text-xs text-faint capitalize">{phase?.replace('_', ' ') ?? 'Waiting'}</span>
          )}
        </div>
      </MonopolyGlassCard>
    </div>
  )
}

export function MonopolyModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  colorBar,
}: {
  open: boolean
  onClose?: () => void
  title: string
  subtitle?: string
  children: ReactNode
  colorBar?: string
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'var(--modal-backdrop)' }}
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={[
          'relative w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border-strong)]',
          'bg-[var(--card-strong)] shadow-[var(--card-shadow-strong)]',
          'animate-in fade-in slide-in-from-bottom-4 duration-200',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
      >
        {colorBar && <div className={['h-2 w-full', colorBar].join(' ')} />}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="text-center">
            {subtitle && (
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{subtitle}</p>
            )}
            <h2 className="text-xl sm:text-2xl font-black text-[var(--foreground)] mt-1">{title}</h2>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

export function MonopolyLoadingScreen() {
  return (
    <MonopolyShell>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-bounce">🎲</div>
          <p className="text-muted animate-pulse font-medium">Setting up the board…</p>
        </div>
      </div>
    </MonopolyShell>
  )
}
