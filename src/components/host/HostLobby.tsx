'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { FateRoundLogo } from '@/components/FateRoundLogo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ShareGameModal } from '@/components/host/ShareGameModal'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLobbySettingsSheet } from '@/components/host/HostLobbySettingsSheet'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { SlidersIcon } from '@/components/host/host-icons'
import type { Game, Player } from '@/types'

/**
 * Mobile-parity host lobby (the `waiting` state). A clean, single-column, full-screen
 * screen that mirrors apps/mobile's HostLobbyScreen: a slim top bar (home logo + theme
 * toggle + ⚙ Host settings), the room-code/share card, the "play as yourself" card, the
 * players list, and a pinned Start / End footer.
 *
 * While mounted it sets `data-host-lobby="active"` on <html>, which (via globals.css)
 * hides the app's marketing host header and its global fixed theme toggle — the lobby owns
 * its own chrome — and docks the floating voice control above the pinned footer (whose
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
  howToPlay,
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
  /** "How to play" affordance rendered just below the room title. */
  howToPlay?: React.ReactNode
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
  const footerRef = useRef<HTMLDivElement>(null)

  // Flag the lobby so globals.css can hide the app header + fixed theme toggle and dock the
  // voice control above our footer. The footer height is measured (it grows with the
  // min-players hint) so the voice pill always clears it.
  useEffect(() => {
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
  }, [])

  const showStartHint = startDisabled && !starting && startDisabledHint

  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--background)]">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-4 pt-6 pb-6 sm:px-6 space-y-5">
          {/* Top bar: home logo (left) + theme toggle & Host settings (right) */}
          <div className="flex items-center justify-between gap-3">
            <Link href="/" aria-label="Fate Round home" className="min-w-0 shrink">
              <FateRoundLogo className="h-8 w-auto max-w-[7.5rem] sm:max-w-[9rem]" />
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              <ThemeToggle variant="inline" />
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card-strong)] px-3.5 py-2 text-sm font-semibold text-muted transition-colors hover:text-[var(--foreground)]"
              >
                <SlidersIcon size={16} />
                Host settings
              </button>
            </div>
          </div>

          {/* Hosting eyebrow + game-type pill */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="label-caps !text-[var(--primary)]">Hosting</span>
            <span className="rounded-full border border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] px-2.5 py-0.5 text-[0.7rem] font-extrabold uppercase tracking-wide text-[var(--primary)]">
              {gameTypeLabel}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-body">{game.title || 'Game'}</h1>

          {howToPlay}

          {/* Room-code / share card — the hero of the lobby (this is what gets people in).
              Tapping opens the share sheet (mobile parity). */}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="group block w-full rounded-2xl border-2 border-[var(--chip-active-border)] bg-[color-mix(in_srgb,var(--primary)_6%,var(--card-strong))] p-5 text-center shadow-[var(--card-shadow-glow)] transition-colors hover:border-[var(--primary)]"
          >
            <p className="text-xs font-semibold text-muted">Game code — tap to share (QR &amp; links)</p>
            <p className="mt-1 text-4xl font-black tracking-[0.35em] text-body">{gameCode}</p>
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
