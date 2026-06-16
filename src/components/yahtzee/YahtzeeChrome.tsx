'use client'

import type { ReactNode } from 'react'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'
import { PageShell } from '@/components/ui/PageShell'

export function YahtzeeShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode
  title?: string
  subtitle?: string
}) {
  const cfg = gameTypeConfig('yahtzee')

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <PageShell centered>{(title || subtitle) && (
        <header className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2">
            <span className="text-3xl drop-shadow-lg">{cfg.card.emoji}</span>
            <GameTypeBadge gameType="yahtzee" />
          </div>
          {title && (
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title drop-shadow-sm">{title}</h1>
          )}
          {subtitle && <p className="text-sm text-muted max-w-md mx-auto">{subtitle}</p>}
        </header>
      )}{children}</PageShell>
    </div>
  )
}

export function YahtzeeCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass-card ${className}`}>{children}</div>
  )
}

export function YahtzeePrimaryButton({
  children,
  onClick,
  disabled,
  loading,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="btn-primary w-full py-4 text-base sm:text-lg disabled:opacity-45"
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

export function YahtzeeTurnBanner({
  turnName,
  isMyTurn,
  message,
}: {
  turnName: string
  isMyTurn?: boolean
  message?: string | null
}) {
  return (
    <YahtzeeCard className={`px-4 py-3 text-sm ${isMyTurn ? 'border-[color-mix(in_srgb,var(--marry)_40%,var(--border-strong))]' : ''}`}>
      <p className="font-semibold text-[var(--foreground)]">
        {isMyTurn ? 'Your turn' : `${turnName}'s turn`}
      </p>
      {message && <p className="text-muted mt-1">{message}</p>}
    </YahtzeeCard>
  )
}
