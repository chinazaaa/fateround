'use client'

import { useMemo } from 'react'
import { HostPageShell, hostPlayLayoutFlags } from '@/components/host/HostPageShell'
import { EyeIcon, PlayIcon, SlidersIcon } from '@/components/host/host-icons'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { useRosterBase, useRosterManage } from '@/components/roster/RosterDrawerContext'
import { playerIsViewer } from '@/lib/viewers'
import type { Game, GameStatus, Player } from '@/types'

export type HostTab = 'play' | 'manage'

/**
 * Shared host layout. Guarantees a single mental model across games:
 *  - Primary tab ("Play" when the host is playing, "Watch" when host-only) holds the
 *    board. Before the game starts it shows a "waiting to start" placeholder.
 *  - Manage tab holds settings + players/viewers + remove + end/start — never a board.
 *  - Finished games show the results screen with no tabs.
 *
 * Tab state stays controlled by the caller — the games' force-tab effects are entangled
 * with realtime and lobby-reopen logic, so they live in the view.
 */
export function HostGameLayout({
  gameCode,
  status,
  tab,
  onTabChange,
  primaryKind,
  showTabs,
  gameStarted,
  header,
  aboveTabs,
  primary,
  manage,
  finished,
  game,
  players,
  hostPlayerId,
  onHostRejoined,
  onRemovePlayer,
}: {
  gameCode: string
  status: GameStatus | undefined
  tab: HostTab
  onTabChange: (tab: HostTab) => void
  /** 'play' = interactive board (host is a player); 'watch' = read-only board (host-only). */
  primaryKind: 'play' | 'watch'
  /** Show the Play/Watch + Manage tab bar (typically: status !== 'finished'). */
  showTabs: boolean
  /** Whether the board is live yet — false shows the "waiting to start" placeholder. */
  gameStarted: boolean
  header?: React.ReactNode
  /** Rendered between the header and the tab bar (e.g. host-mode selector, late-join card). */
  aboveTabs?: React.ReactNode
  primary: React.ReactNode
  manage: React.ReactNode
  /** Results screen for finished games. Falls back to `manage` when omitted. */
  finished?: React.ReactNode
  /** Current game — enables the mid-game "Join as player" banner when the host is dropped to spectator. */
  game?: Game | null
  /** Full roster — used to detect the host's own player row and open-seat availability. */
  players?: ReadonlyArray<Player>
  /** The host's own player row id (when the host joined to play along). */
  hostPlayerId?: string | null
  /** Called after the host promotes back to a player, to re-fetch game state. */
  onHostRejoined?: () => void | Promise<unknown>
  /** When set, the roster drawer gets a per-row Remove for the host. */
  onRemovePlayer?: (playerId: string, playerName: string) => void
}) {
  const isFinished = status === 'finished'
  const layout = hostPlayLayoutFlags(tab, showTabs, status)
  const primaryLabel = primaryKind === 'play' ? 'Play' : 'Watch'

  // Feed the shared roster drawer (opened from the header) — only while the game
  // is actually being played. In the lobby/waiting (and once finished) the roster
  // lives in the lobby/results UI, so the header button stays hidden. The host's
  // own row is marked "you" via hostPlayerId; scores are layered on by each game
  // view via useGameScores. Remove is enabled only when the view wires onRemovePlayer.
  useRosterBase(status === 'active' ? players : undefined, game, hostPlayerId)
  const manageRemove = useMemo(
    () => (onRemovePlayer ? (row: { id: string; name: string }) => onRemovePlayer(row.id, row.name) : undefined),
    [onRemovePlayer]
  )
  useRosterManage(manageRemove ? { hostPlayerId: hostPlayerId ?? null, onRemove: manageRemove } : null)

  // A host who joined to play can be flipped to spectator mid-game (e.g. a play-again lobby
  // reset re-seats everyone). Unlike the player views, the host scaffold never surfaced a way
  // back in — so mirror the player-side ViewerModeBanner here, gated to an active game where
  // the host actually holds a (now-spectating) player row.
  const hostPlayer = hostPlayerId && players ? (players.find((p) => p.id === hostPlayerId) ?? null) : null
  const showHostRejoin = !!(
    !isFinished &&
    game &&
    game.status === 'active' &&
    hostPlayer &&
    playerIsViewer(hostPlayer, game)
  )

  let body: React.ReactNode
  if (isFinished) {
    body = finished ?? manage
  } else if (!showTabs) {
    body = manage
  } else if (tab === 'play') {
    body = gameStarted ? (
      primary
    ) : (
      <HostWaitingToStartPlaceholder kind={primaryKind} onGoToManage={() => onTabChange('manage')} />
    )
  } else {
    body = manage
  }

  return (
    <HostPageShell gameCode={gameCode} {...layout}>
      {/* On the finished screen the results card carries its own header (the one baked into
          the shared image), so the page header would just duplicate it. */}
      {!isFinished && header}
      {!isFinished && aboveTabs}

      {showHostRejoin && game && hostPlayer && (
        <ViewerModeBanner
          gameCode={gameCode}
          playerId={hostPlayerId}
          game={game}
          player={hostPlayer}
          players={players}
          onPromoted={onHostRejoined}
        />
      )}

      {showTabs && !isFinished && (
        <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[var(--surface-inset-bg)] border border-[var(--border)]">
          <HostTabButton
            active={tab === 'play'}
            onClick={() => onTabChange('play')}
            icon={primaryKind === 'play' ? <PlayIcon /> : <EyeIcon />}
            label={primaryLabel}
          />
          <HostTabButton
            active={tab === 'manage'}
            onClick={() => onTabChange('manage')}
            icon={<SlidersIcon />}
            label="Manage"
          />
        </div>
      )}

      {body}
    </HostPageShell>
  )
}

function HostTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all duration-200',
        active
          ? 'bg-[var(--card-strong)] text-[var(--foreground)] shadow-[var(--card-shadow)]'
          : 'text-muted hover:text-[var(--foreground)]',
      ].join(' ')}
    >
      <span className={active ? 'text-[var(--primary)]' : 'text-faint'}>{icon}</span>
      {label}
    </button>
  )
}

function HostWaitingToStartPlaceholder({ kind, onGoToManage }: { kind: 'play' | 'watch'; onGoToManage: () => void }) {
  return (
    <div className="glass-card-strong relative overflow-hidden p-8 sm:p-12 text-center">
      <div className="game-type-card-glow" aria-hidden />
      <div className="relative space-y-5">
        <div className="relative mx-auto h-16 w-16">
          <span className="absolute inset-0 rounded-full bg-[color-mix(in_srgb,var(--primary)_22%,transparent)] animate-ping" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[var(--chip-active-border)] bg-[color-mix(in_srgb,var(--primary)_12%,var(--card-strong))] text-[var(--primary)]">
            {kind === 'play' ? <PlayIcon size={26} /> : <EyeIcon size={26} />}
          </span>
        </div>
        <div className="space-y-2">
          <p className="text-xl sm:text-2xl font-black gradient-title">Waiting for you to start</p>
          <p className="text-muted text-sm max-w-sm mx-auto leading-relaxed">
            Set up your game and players in Manage, then start when everyone&apos;s ready. The{' '}
            {kind === 'play' ? 'board' : 'live board'} appears here.
          </p>
        </div>
        <button type="button" onClick={onGoToManage} className="btn-primary btn-fit mx-auto">
          Go to Manage →
        </button>
      </div>
    </div>
  )
}
