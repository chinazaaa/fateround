'use client'

import { PlayerResumeEntry } from '@/components/PlayerResumeEntry'

type Props = {
  gameCode: string
  onResumed?: () => void | Promise<unknown>
  /** @deprecated the invite card is gone — inviting now lives in the header Share popup. */
  showInvite?: boolean
  wide?: boolean
  header?: React.ReactNode
  children: React.ReactNode
}

export function GameJoinLobbyShell({ gameCode, onResumed, wide = false, header, children }: Props) {
  const mainMax = wide ? 'max-w-2xl' : 'max-w-xl'
  const handleResumed = onResumed ?? (() => window.location.reload())

  return (
    <div className="page-wrap flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-8 sm:py-10">
      <div className={`w-full ${mainMax} space-y-4`}>
        {/* The join card — inviting others now lives in the header Share popup, so
            there's no invite aside here anymore. */}
        <div
          className={[
            'rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))]',
            'bg-[var(--card-strong)]/95 backdrop-blur-md',
            'shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)]',
            'p-6 sm:p-8 space-y-6',
          ].join(' ')}
        >
          {header}
          {children}
        </div>

        {/* Below the join form: rejoin a seat you already hold with its player code. */}
        <PlayerResumeEntry gameCode={gameCode} onResumed={handleResumed} />
      </div>
    </div>
  )
}
