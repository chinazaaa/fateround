'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { gameRulesHref } from '@/lib/game-landing'
import { parseGameType } from '@/lib/game-types'
import { ShareGameModal } from '@/components/host/ShareGameModal'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostVisibilityToggle } from '@/components/host-lobby/HostVisibilityToggle'
import { HostThemePicker } from '@/components/host-lobby/HostThemePicker'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostLobbySettingsSheet } from '@/components/host/HostLobbySettingsSheet'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { SlidersIcon } from '@/components/host/host-icons'
import type { Game, Player } from '@/types'

/**
 * Mobile-parity host lobby (the `waiting` state). A clean, single-column, full-screen
 * screen that mirrors apps/mobile's HostLobbyScreen: a pinned top bar (home logo far-left
 * + ⚙ Host settings right), the room-code/share card, the "play as yourself" card, the
 * players list, and a pinned Start / End footer.
 *
 * While mounted it sets `data-host-lobby="active"` on <html>, which (via globals.css)
 * hides the app's marketing host header — the global fixed theme toggle stays as the
 * single light/dark control, and the header leaves room for it — and docks the floating voice control above the pinned footer (whose
 * height it measures into `--lobby-footer-h`). Once the game starts, the view unmounts this
 * and the tabbed in-game layout (with the normal header) returns.
 *
 * Kept game-agnostic on purpose (this is the pilot shell for a wider rollout): the
 * play-as-yourself card, any lobby option panels, and the game-settings knobs are slots.
 */
export function HostLobby({
  gameCode,
  hostToken,
  game,
  gameTypeLabel,
  players,
  maxPlayers,
  resumeToken,
  playCard,
  children,
  settingsChildren,
  settingsTitle,
  onStart,
  starting = false,
  startDisabled = false,
  startDisabledHint,
  startLabel = 'Start game',
  onRemovePlayer,
  removingPlayerId,
  highlightPlayerId,
  onEnded,
}: {
  gameCode: string
  hostToken: string
  game: Game
  /** Display name for the game-type pill (e.g. gameTypeConfig(type).label). */
  gameTypeLabel: string
  players: Player[]
  /** Lobby capacity — shown as "N / max" on the players count. */
  maxPlayers?: number | null
  /** Host's own player resume token, so the share sheet can offer the host+play link. */
  resumeToken?: string | null
  /** The "play as yourself" card — typically <HostModeSelector /> or a team panel. */
  playCard?: React.ReactNode
  /** Optional lobby panels rendered between the play card and the players list. */
  children?: React.ReactNode
  /** Game-specific settings rendered inside the ⚙ sheet, below appearance + sound. */
  settingsChildren?: React.ReactNode
  settingsTitle?: string
  onStart: () => void
  starting?: boolean
  startDisabled?: boolean
  startDisabledHint?: string | null
  startLabel?: string
  onRemovePlayer?: (playerId: string, playerName: string) => void
  removingPlayerId?: string | null
  highlightPlayerId?: string | null
  /** Called after the host ends the lobby (finish-game). */
  onEnded?: () => void | Promise<unknown>
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // Portals need document.body, which doesn't exist during SSR — render nothing until
  // mounted on the client (same guard as ui/Modal). Also gates the footer-measuring effect
  // so it runs only after the footer is actually in the DOM.
  const [mounted, setMounted] = useState(false)
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // Flag the lobby so globals.css can hide the app header + fixed theme toggle and dock the
  // voice control above our footer. The footer height is measured (it grows with the
  // min-players hint) so the voice pill always clears it.
  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    root.setAttribute('data-host-lobby', 'active')
    const footer = footerRef.current
    const measure = () => {
      if (footer) root.style.setProperty('--lobby-footer-h', `${footer.offsetHeight}px`)
    }
    measure()
    let ro: ResizeObserver | undefined
    if (footer && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(footer)
    }
    return () => {
      root.removeAttribute('data-host-lobby')
      root.style.removeProperty('--lobby-footer-h')
      ro?.disconnect()
    }
  }, [mounted])

  const showStartHint = startDisabled && !starting && startDisabledHint

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--background)]">
      {/* Pinned top bar: home logo (far left) + Host settings (right). Stays put while the
          lobby body scrolls. The right side keeps clear of the app's global fixed theme
          toggle (top-right, z-50) — the lobby's single light/dark control. */}
      <header className="shrink-0 flex items-center justify-between gap-3 bg-[var(--background)] px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Fate Round home" className="min-w-0 shrink">
          <FateRoundLogo className="h-8 w-auto max-w-[7.5rem] sm:max-w-[9rem]" />
        </Link>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="mr-14 flex shrink-0 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card-strong)] px-3.5 py-2 text-sm font-semibold text-muted transition-colors hover:text-[var(--foreground)] sm:mr-28"
        >
          <SlidersIcon size={16} />
          Host settings
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-4 pt-2 pb-6 sm:px-6 space-y-4">
          {/* Hosting eyebrow + game-type pill */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="label-caps !text-[var(--primary)]">Hosting</span>
            <span className="rounded-full border border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] px-2.5 py-0.5 text-[0.7rem] font-extrabold uppercase tracking-wide text-[var(--primary)]">
              {gameTypeLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h1 className="text-2xl sm:text-3xl font-black text-body">{game.title || 'Game'}</h1>
            <Link
              href={gameRulesHref(parseGameType(game.game_type))}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-sm font-semibold text-[var(--primary)] transition-opacity hover:opacity-80"
            >
              How to play →
            </Link>
          </div>

          {/* Room-code / share card — the hero of the lobby (this is what gets people in).
              Tapping opens the share sheet (mobile parity). */}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="group block w-full rounded-2xl border-2 border-[var(--chip-active-border)] bg-[color-mix(in_srgb,var(--primary)_6%,var(--card-strong))] px-5 py-3.5 text-center shadow-[var(--card-shadow-glow)] transition-colors hover:border-[var(--primary)]"
          >
            <p className="text-xs font-semibold text-muted">Game code — tap to share (QR &amp; links)</p>
            <p className="mt-0.5 text-3xl font-black tracking-[0.3em] text-body">{gameCode}</p>
          </button>

          {playCard}
          {children}

          <HostLobbyPlayersSection
            players={players}
            capacity={maxPlayers ?? undefined}
            onRemovePlayer={onRemovePlayer}
            removingPlayerId={removingPlayerId}
            highlightPlayerId={highlightPlayerId}
            emptyMessage="Waiting for players to join…"
          />
        </div>
      </div>

      {/* Pinned footer */}
      <div ref={footerRef} className="border-t border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-xl px-4 py-4 sm:px-6 space-y-2">
          {showStartHint ? <p className="text-faint text-xs text-center leading-relaxed">{startDisabledHint}</p> : null}
          <button
            type="button"
            onClick={onStart}
            disabled={startDisabled || starting}
            className="btn-primary w-full disabled:opacity-45 disabled:saturate-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {starting ? 'Starting…' : startLabel}
          </button>
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={onEnded}
            className="btn-ghost w-full text-sm !text-red-500 hover:!text-red-400"
            label="End lobby"
            confirmTitle="Close this lobby?"
            confirmMessage="This ends the game for everyone. You can start a new one afterward."
          />
        </div>
      </div>

      <HostLobbySettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title={settingsTitle}>
        {/* Universal host controls — shown for every game so they're consistent and always
            visible (not buried in a per-game panel): public/private, theme, late joiners.
            Game-specific settings follow via settingsChildren. */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-3">
          <HostVisibilityToggle gameCode={gameCode} hostToken={hostToken} game={game} />
        </div>
        <HostThemePicker gameCode={gameCode} hostToken={hostToken} game={game} />
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} />
        {settingsChildren}
      </HostLobbySettingsSheet>

      <ShareGameModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        gameCode={gameCode}
        hostToken={hostToken}
        resumeToken={resumeToken}
      />
    </div>,
    document.body
  )
}
