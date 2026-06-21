'use client'

import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'

type Props = {
  gameCode: string
  onResumed?: () => void | Promise<unknown>
  showInvite?: boolean
  wide?: boolean
  header?: React.ReactNode
  children: React.ReactNode
}

export function GameJoinLobbyShell({
  gameCode,
  onResumed,
  showInvite = true,
  wide = false,
  header,
  children,
}: Props) {
  const mainMax = wide ? 'max-w-2xl' : 'max-w-xl'

  return (
    <div className="page-wrap min-h-[calc(100dvh-4rem)] flex items-center justify-center px-4 py-8 sm:py-10">
      <div className={`w-full ${wide ? 'max-w-5xl' : 'max-w-4xl'}`}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_min(100%,320px)] gap-5 lg:gap-6 items-start">
          <div
            className={[
              'w-full mx-auto lg:mx-0',
              mainMax,
              'rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))]',
              'bg-[var(--card-strong)]/95 backdrop-blur-md',
              'shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)]',
              'p-6 sm:p-8 space-y-6',
            ].join(' ')}
          >
            {header}
            {children}
          </div>

          {showInvite ? (
            <aside className="w-full lg:max-w-[320px] lg:sticky lg:top-24 space-y-3">
              <ShareGameLinkCard gameCode={gameCode} onResumed={onResumed} variant="aside" />
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  )
}
