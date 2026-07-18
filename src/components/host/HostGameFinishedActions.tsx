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
  /**
   * 'winner' renders the redesigned results footer: Share results (primary) →
   * Play again (secondary) → Return to lobby (ghost) + an optional helper note.
   * Defaults to the original layout so screens that haven't adopted it are unchanged.
   */
  variant?: 'default' | 'winner'
  /** 'winner' only — the ghost "Return to lobby" action shown under Play again. */
  returnToLobbyButton?: React.ReactNode
  /** 'winner' only — helper text under the buttons explaining the two play-again paths. */
  lobbyNote?: React.ReactNode
}

export function HostGameFinishedActions({
  shareButton,
  playAgainButton,
  showCreateNewGame = true,
  showBackHome = true,
  gameCode,
  variant = 'default',
  returnToLobbyButton,
  lobbyNote,
}: Props) {
  const router = useRouter()

  if (variant === 'winner') {
    // The share / play-again / return-to-lobby buttons carry their own styling from the
    // caller (btn-primary / btn-secondary / ghost); we just stack them + the helper note.
    return (
      <div className="space-y-2.5">
        {shareButton}
        {playAgainButton ? <div className="min-w-0">{playAgainButton}</div> : null}
        {returnToLobbyButton ?? null}
        {lobbyNote ? <p className="text-center text-xs text-faint leading-relaxed px-2 pt-0.5">{lobbyNote}</p> : null}
        {showCreateNewGame ? (
          <CreateNewGameButton className="block w-full pt-1 text-center text-sm font-medium text-muted hover:text-body transition-colors" />
        ) : null}
        {gameCode ? (
          <a
            href={`/history/${gameCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full pt-1 text-center text-sm font-medium text-muted hover:text-body transition-colors"
          >
            View game history ↗
          </a>
        ) : null}
      </div>
    )
  }

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
