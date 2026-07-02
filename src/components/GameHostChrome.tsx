'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { GameShareMenu } from '@/components/GameShareMenu'
import { BackToRoomLink } from '@/components/BackToRoomLink'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SoundToggle } from '@/components/SoundToggle'
import { useHostPlayerSession } from '@/hooks/useHostPlayerSession'
import { WhatsAppHeaderIcon } from '@/components/WhatsAppChannelLink'
import { TransferHostControl } from '@/components/TransferHostControl'
import { setupAudioUnlock } from '@/lib/sounds'

export function GameHostChrome() {
  const params = useParams()
  const searchParams = useSearchParams()
  const code = typeof params?.code === 'string' ? params.code.toUpperCase() : null
  const hostToken = searchParams.get('token') ?? ''
  const { resumeToken } = useHostPlayerSession(code)
  const hasHostPlayer = !!(code && hostToken && resumeToken)

  useEffect(() => setupAudioUnlock(), [])

  return (
    <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-3 px-4 py-3 pointer-events-none border-b border-[var(--border)]/50 bg-[var(--background)]/90 backdrop-blur-md">
      <div className="flex items-center gap-2 pointer-events-auto min-w-0">
        <Link href="/" className="shrink-0 min-w-0" aria-label="Back to Fate Round home">
          <FateRoundLogo className="h-8 w-auto max-w-[7.5rem] sm:max-w-[11rem]" />
        </Link>
        <BackToRoomLink gameCode={code} compact />
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
        <WhatsAppHeaderIcon />
        <TransferHostControl />
        {code ? (
          <GameShareMenu
            gameCode={code}
            hostToken={hostToken || undefined}
            resumeToken={hasHostPlayer ? resumeToken : null}
          />
        ) : null}
        <SoundToggle variant="inline" />
        <ThemeToggle variant="inline" />
      </div>
    </header>
  )
}
