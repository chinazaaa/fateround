'use client'

import type { GameStatus } from '@/types'

type Props = {
  gameCode: string
  children: React.ReactNode
  /** @deprecated invite now lives in the header Share popup — no more invite aside. */
  showInvite?: boolean
  wide?: boolean
  className?: string
}

// The primary tab ('play') holds the board for BOTH host+player (Play) and host-only
// (Watch). Pass `showTabs` (true whenever the tab bar is shown) so the wide layout
// engages for the Watch board too — not only when the host is playing.
export function hostPlayLayoutFlags(tab: 'play' | 'manage', showTabs: boolean, status: GameStatus | undefined) {
  const onPrimaryScreen = tab !== 'manage' && showTabs && status === 'active'
  return { showInvite: !onPrimaryScreen, wide: onPrimaryScreen }
}

export function HostPageShell({ children, wide = false, className = '' }: Props) {
  const maxWidth = wide ? 'max-w-6xl' : 'max-w-5xl'

  // Single column — the invite card that used to sit in a right aside is gone
  // (inviting now lives in the chrome's Share popup, everywhere).
  return (
    <div className={`page-wrap min-h-[calc(100dvh-4rem)] px-4 py-6 sm:py-8 pb-24 ${className}`}>
      <div className={`w-full mx-auto space-y-4 sm:space-y-5 ${maxWidth}`}>{children}</div>
    </div>
  )
}
