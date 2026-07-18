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
    // caller (btn-primary / btn-secondary / ghost); we stack them, then group the low-key
    // meta actions (new game / history) into a divided row so they read as a deliberate
    // footer instead of a pile of floating text links.
    const hasMeta = showCreateNewGame || !!gameCode
    const hasContinue = !!playAgainButton || !!returnToLobbyButton
    return (
      <div className="space-y-4">
        {/* Tier 1 — the one loud action */}
        {shareButton}

        {/* Tier 2 — continue-playing actions. When both exist they sit side by side
            (same settings ↔ different settings); otherwise the lone one spans full width. */}
        {hasContinue ? (
          playAgainButton && returnToLobbyButton ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">{playAgainButton}</div>
              <div className="min-w-0">{returnToLobbyButton}</div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {playAgainButton ? <div className="min-w-0">{playAgainButton}</div> : null}
              {returnToLobbyButton ?? null}
            </div>
          )
        ) : null}
        {lobbyNote ? <p className="px-3 text-center text-xs leading-relaxed text-faint">{lobbyNote}</p> : null}

        {/* Tier 3 — quiet meta actions behind a hairline */}
        {hasMeta ? (
          <div className="flex items-stretch justify-center gap-1 border-t border-[var(--border)] pt-3">
            {showCreateNewGame ? (
              <CreateNewGameButton className="flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold text-muted transition-colors hover:bg-[var(--surface-inset-bg)] hover:text-body" />
            ) : null}
            {showCreateNewGame && gameCode ? (
              <span aria-hidden className="my-2 w-px self-center bg-[var(--border)]" />
            ) : null}
            {gameCode ? (
              <a
                href={`/history/${gameCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2 text-center text-sm font-semibold text-muted transition-colors hover:bg-[var(--surface-inset-bg)] hover:text-body"
              >
                Game history <span aria-hidden>↗</span>
              </a>
            ) : null}
          </div>
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
