'use client'

import { useRouter } from 'next/navigation'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'

type Props = {
  shareButton: React.ReactNode
  playAgainButton?: React.ReactNode
  showCreateNewGame?: boolean
  showBackHome?: boolean
  /** Game code — when set, shows a "View game history" link that opens the recap in a new tab. */
  gameCode?: string | null
}

export function HostGameFinishedActions({
  shareButton,
  playAgainButton,
  showCreateNewGame = true,
  showBackHome = true,
  gameCode,
}: Props) {
  const router = useRouter()

  return (
    <div className="space-y-3">
      {playAgainButton ? (
        <div className="[&>button]:btn-primary [&>button]:w-full [&>button]:py-3 [&>button]:text-base">
          {playAgainButton}
        </div>
      ) : null}

      <div className={showCreateNewGame ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : undefined}>
        <div className="[&>button]:w-full [&>button]:py-3 [&>button]:text-sm sm:[&>button]:text-base min-w-0">
          {shareButton}
        </div>
        {showCreateNewGame ? <CreateNewGameButton className="btn-secondary w-full py-3 text-sm sm:text-base" /> : null}
      </div>

      {gameCode ? (
        <a
          href={`/history/${gameCode}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-2 text-center text-sm font-medium text-muted hover:text-body transition-colors"
        >
          View game history ↗
        </a>
      ) : null}

      {showBackHome ? (
        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full py-2 text-sm font-medium text-muted hover:text-body transition-colors"
        >
          Back home
        </button>
      ) : null}
    </div>
  )
}
