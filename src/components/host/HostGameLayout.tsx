'use client'

import { HostPageShell, hostPlayLayoutFlags } from '@/components/host/HostPageShell'
import { EyeIcon, PlayIcon, SlidersIcon } from '@/components/host/host-icons'
import type { GameStatus } from '@/types'

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
}) {
  const isFinished = status === 'finished'
  const layout = hostPlayLayoutFlags(tab, showTabs, status)
  const primaryLabel = primaryKind === 'play' ? 'Play' : 'Watch'

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
      {header}
      {aboveTabs}

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
