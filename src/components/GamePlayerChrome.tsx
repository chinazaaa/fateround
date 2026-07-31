'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { ShareGameButton } from '@/components/ShareGameButton'
import { BackToRoomLink } from '@/components/BackToRoomLink'
import { RosterButton } from '@/components/roster/RosterButton'
import { GameChromeSettings } from '@/components/GameChromeSettings'
import { ProfileChip } from '@/components/profile/ProfileChip'
import { useHostPlayerSession } from '@/hooks/useHostPlayerSession'
import { HostNominationBanner } from '@/components/HostNominationBanner'
import { setupAudioUnlock } from '@/lib/sounds'

export function GamePlayerChrome() {
  const params = useParams()
  const code = typeof params?.code === 'string' ? params.code.toUpperCase() : null
  const { resumeToken } = useHostPlayerSession(code)

  useEffect(() => setupAudioUnlock(), [])

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-3 px-4 py-3 pointer-events-none border-b border-[var(--border)]/50 bg-[var(--background)]/90 backdrop-blur-md">
        <div className="flex items-center gap-2 pointer-events-auto min-w-0">
          <Link href="/" className="shrink-0 min-w-0" aria-label="Back to FateRound home">
            <FateRoundLogo className="h-8 w-auto max-w-[7.5rem] sm:max-w-[11rem]" />
          </Link>
          <BackToRoomLink gameCode={code} compact />
          <RosterButton />
        </div>
        <div className="flex items-center gap-2 pointer-events-auto shrink-0">
          {code ? <ShareGameButton gameCode={code} resumeToken={resumeToken} /> : null}
          {/* The whole funnel is "open a link → play → leave", and that path never touches the
              marketing header. Without the chip here a link-joiner is never told they're a guest
              and is never offered an account. */}
          <ProfileChip tone="app" />
          <GameChromeSettings role="player" gameCode={code} resumeToken={resumeToken} />
        </div>
      </header>
      <HostNominationBanner />
    </>
  )
}
