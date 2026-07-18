'use client'

import type { ReactNode } from 'react'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import type { GameType } from '@/types'

/**
 * The body of a host's ⚙ game-settings sheet during ACTIVE play — the shared home for
 * what used to live in the `HostGameLayout` "Manage" tab, now that gameplay is always
 * the body (see `HostGameLayout` `noManageTab`). Mirrors the Whot precedent.
 *
 * Renders game-specific settings (`children` — e.g. a late-join card, game rules), then
 * a "How to play" row, then "End game". The host's own name is edited from the universal
 * row `GameChromeSettings` adds; the roster + Remove live in the side-drawer — so this
 * holds neither.
 *
 * Register it while the game is active via `useRegisterGameSettings` (memoise the node):
 *   const node = useMemo(() => game?.status === 'active'
 *     ? <HostActiveSettings gameCode={gameCode} hostToken={hostToken} gameType="trivia" onEnded={load}>{settings}</HostActiveSettings>
 *     : null, [game?.status, gameCode, hostToken, load, settings])
 *   useRegisterGameSettings(node)
 */
export function HostActiveSettings({
  gameCode,
  hostToken,
  gameType,
  onEnded,
  endGameLabel = 'End game',
  endGameConfirmTitle = 'End this game?',
  endGameConfirmMessage = 'Everyone sees the final results. You can start a new game from the room afterward.',
  children,
}: {
  gameCode: string
  hostToken: string
  /** Drives the "How to play" row's rules link. */
  gameType: GameType | string
  /** Re-fetch game state after the game ends. */
  onEnded: () => void
  endGameLabel?: string
  endGameConfirmTitle?: string
  endGameConfirmMessage?: string
  /** Game-specific settings (late-join rules, game options, …). */
  children?: ReactNode
}) {
  return (
    <div className="space-y-4">
      {children}
      <HostRulesRow gameType={gameType} />
      <HostEndGameButton
        gameCode={gameCode}
        hostToken={hostToken}
        onEnded={onEnded}
        label={endGameLabel}
        icon={<ExitIcon size={16} />}
        confirmTitle={endGameConfirmTitle}
        confirmMessage={endGameConfirmMessage}
        className="btn-danger-soft w-full"
      />
    </div>
  )
}
