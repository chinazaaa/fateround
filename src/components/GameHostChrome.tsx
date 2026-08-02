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
import { PostWinPrompt } from '@/components/profile/PostWinPrompt'
import { TrophiesThisGame } from '@/components/profile/TrophiesThisGame'
import { GameAttribution } from '@/components/profile/GameAttribution'
import { useHostPlayerSession } from '@/hooks/useHostPlayerSession'
import { useHostToken } from '@/hooks/useHostToken'
import { setupAudioUnlock } from '@/lib/sounds'

export function GameHostChrome() {
  const params = useParams()
  const code = typeof params?.code === 'string' ? params.code.toUpperCase() : null
  // Clean host URL (token in storage) → resolve via the hook, which reads the fallback in
  // an effect so there's no hydration mismatch. Keeps the share menu's host link working.
  const { hostToken } = useHostToken(code)
  const { resumeToken } = useHostPlayerSession(code)
  const hasHostPlayer = !!(code && hostToken && resumeToken)

  useEffect(() => setupAudioUnlock(), [])

  return (
    <>
      <header className="game-host-chrome fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-3 px-4 py-3 pointer-events-none border-b border-[var(--border)]/50 bg-[var(--background)]/90 backdrop-blur-md">
        <div className="flex items-center gap-2 pointer-events-auto min-w-0">
          <Link href="/" className="shrink-0 min-w-0" aria-label="Back to FateRound home">
            <FateRoundLogo className="h-8 w-auto max-w-[7.5rem] sm:max-w-[11rem]" />
          </Link>
          <BackToRoomLink gameCode={code} compact />
          <RosterButton />
        </div>
        <div className="flex items-center gap-2 pointer-events-auto shrink-0">
          {code ? (
            <ShareGameButton
              gameCode={code}
              hostToken={hostToken || undefined}
              resumeToken={hasHostPlayer ? resumeToken : null}
            />
          ) : null}
          <ProfileChip tone="app" />
          <GameChromeSettings role="host" gameCode={code} resumeToken={hasHostPlayer ? resumeToken : null} />
        </div>
      </header>

      {/* Renders only when the award pass reports something earned, so it can never
          appear before a game is finished. */}
      <GameAttribution gameCode={code} />
      <PostWinPrompt />
      <TrophiesThisGame />
    </>
  )
}
