'use client'

import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import type { GameStatus } from '@/types'

type Props = {
  gameCode: string
  children: React.ReactNode
  showInvite?: boolean
  wide?: boolean
  className?: string
}

export function hostPlayLayoutFlags(
  tab: 'play' | 'manage',
  showPlayTab: boolean,
  status: GameStatus | undefined
) {
  const onPlayScreen = tab === 'play' && showPlayTab && status === 'active'
  return { showInvite: !onPlayScreen, wide: onPlayScreen }
}

export function HostPageShell({
  gameCode,
  children,
  showInvite = true,
  wide = false,
  className = '',
}: Props) {
  const maxWidth = wide ? 'max-w-6xl' : 'max-w-5xl'

  return (
    <div className={`page-wrap min-h-[calc(100dvh-4rem)] px-4 py-6 sm:py-8 pb-24 ${className}`}>
      <div className={`w-full mx-auto ${maxWidth}`}>
        {showInvite ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_min(100%,320px)] gap-5 lg:gap-6 items-start">
            <div className="space-y-4 sm:space-y-5 min-w-0">{children}</div>
            <aside className="w-full lg:max-w-[320px] lg:sticky lg:top-24 space-y-3">
              <ShareGameLinkCard gameCode={gameCode} variant="aside" />
            </aside>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-5">{children}</div>
        )}
      </div>
    </div>
  )
}
