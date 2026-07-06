'use client'

import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { HostLobbyStartButton } from '@/components/host-lobby/HostLobbyStartButton'
import { HostVisibilityToggle } from '@/components/host-lobby/HostVisibilityToggle'
import { ExitIcon } from '@/components/host/host-icons'
import type { Game } from '@/types'

type Props = {
  gameCode: string
  hostToken: string
  onStart: () => void
  onEnded?: () => void | Promise<unknown>
  canStart?: boolean
  starting?: boolean
  startDisabledHint?: string | null
  startDisabled?: boolean
  startLabel?: string
  endLabel?: string
  className?: string
  /**
   * When set, renders the public/private visibility toggle above the start
   * button. Games with their own lobby settings panel (board games) surface the
   * toggle there instead and should leave this unset to avoid a double control.
   */
  game?: Game
  onGameUpdate?: (game: Game) => void
}

export function HostLobbyWaitingFooter({
  gameCode,
  hostToken,
  onStart,
  onEnded,
  canStart = true,
  starting = false,
  startDisabledHint,
  startDisabled,
  startLabel = 'Start game',
  endLabel = 'End lobby',
  className = 'space-y-3',
  game,
  onGameUpdate,
}: Props) {
  const disabled = startDisabled ?? !canStart

  return (
    <div className={className}>
      {game && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-3">
          <HostVisibilityToggle gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={onGameUpdate} />
        </div>
      )}
      <HostLobbyStartButton
        onClick={onStart}
        disabled={disabled}
        starting={starting}
        disabledHint={startDisabledHint}
        label={startLabel}
      />
      <HostEndGameButton
        gameCode={gameCode}
        hostToken={hostToken}
        onEnded={onEnded}
        label={endLabel}
        icon={<ExitIcon size={16} />}
        confirmTitle="Close this lobby?"
        confirmMessage="Players will be disconnected. You can start a new game from Play again afterward."
        className="btn-danger-soft"
      />
    </div>
  )
}
