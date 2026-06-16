'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { ShareGameLinkButton } from '@/components/ShareGameLinkButton'
import { ThemeToggle } from '@/components/ThemeToggle'

export function GamePlayerChrome() {
  const params = useParams()
  const code = typeof params?.code === 'string' ? params.code.toUpperCase() : null

  return (
    <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-2 px-4 py-3 pointer-events-none">
      <Link href="/" className="pointer-events-auto shrink-0 min-w-0" aria-label="Back to Fate Round home">
        <FateRoundLogo className="h-8 w-auto max-w-[7.5rem] sm:max-w-[11rem]" />
      </Link>
      <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
        {code ? <ShareGameLinkButton gameCode={code} /> : null}
        <ThemeToggle variant="inline" />
      </div>
    </header>
  )
}
