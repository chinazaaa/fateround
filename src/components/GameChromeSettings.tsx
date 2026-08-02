'use client'

import { useEffect, useState } from 'react'
import { GearIcon } from '@/components/rooms/icons'
import { TrophiesForThisGameLink } from '@/components/profile/TrophiesForThisGameLink'
import { HostLobbySettingsSheet } from '@/components/host/HostLobbySettingsSheet'
import { TransferHostControl } from '@/components/TransferHostControl'
import { WhatsAppChannelLink } from '@/components/WhatsAppChannelLink'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { useGameSettingsContent, GameSettingsCloseProvider } from '@/components/GameSettingsContext'
import { RotatePlayerCodeButton } from '@/components/ui/RotatePlayerCodeButton'
import { getPlayerSession } from '@/lib/utils'

/**
 * The in-game chrome's single ⚙ settings entry — mirrors the mobile host/player
 * settings sheet and the web lobby's clean top bar, folding what used to be a row
 * of header pills (sound, notifications, transfer host, community) behind one
 * gear. Light/dark stays on the app's global fixed toggle (top-right), exactly
 * like the lobby. Sound + the sheet shell are reused from HostLobbySettingsSheet.
 */
export function GameChromeSettings({
  role,
  gameCode,
  resumeToken,
}: {
  role: 'host' | 'player'
  gameCode: string | null
  resumeToken: string | null
}) {
  const [open, setOpen] = useState(false)
  // Game-specific controls the in-game view folds into this one sheet (e.g. Whot's
  // host game settings, end game) — mirrors the mobile host settings sheet.
  const gameSettings = useGameSettingsContent()

  // The host's own player session (they always hold a seat now — host+play or a
  // host-only spectator seat) → gives every host an "Edit your name" row in the gear,
  // like players have. Reactive so a rename elsewhere updates the label. The host
  // chrome only renders during active play (hidden in the lobby), so no extra gating.
  const [hostSession, setHostSession] = useState<{ playerId: string; playerName: string } | null>(null)
  useEffect(() => {
    if (role !== 'host' || !gameCode) return setHostSession(null)
    const sync = () => {
      const s = getPlayerSession(gameCode)
      setHostSession(s?.playerId ? { playerId: s.playerId, playerName: s.playerName } : null)
    }
    sync()
    window.addEventListener('kmk-player-session', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('kmk-player-session', sync)
      window.removeEventListener('storage', sync)
    }
  }, [role, gameCode])

  const rowClass =
    'flex w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] px-3.5 py-3 text-sm font-semibold text-body transition-colors hover:text-[var(--foreground)]'
  // Rotate player code invalidates the caller's existing continue link (a security action, and
  // its confirm dialog is already marked destructive) — give it a distinct warm accent so it's
  // never mistaken for the neutral "Transfer" row sitting right above it.
  const rotateRowClass =
    'flex w-full items-center justify-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm font-semibold text-red-500 transition-colors hover:text-red-400'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Settings"
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] text-muted transition-colors hover:text-[var(--foreground)] hover:border-[var(--border-strong)]"
      >
        <GearIcon size={17} />
      </button>

      {/* Appearance · Sound · Game alerts render inside the sheet (built-in rows, both
          roles); game-specific settings + host controls follow as children. */}
      <HostLobbySettingsSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Settings"
        gameCode={gameCode}
        resumeToken={resumeToken}
      >
        <GameSettingsCloseProvider value={() => setOpen(false)}>
          {/* Host: edit your own name (players get theirs from their game view's registered
              block). Shown when the host holds a seat. */}
          {role === 'host' && gameCode && hostSession ? (
            <EditNameInline
              gameCode={gameCode}
              playerId={hostSession.playerId}
              currentName={hostSession.playerName}
              onRenamed={() => {}}
            />
          ) : null}
          {gameSettings}
          {role === 'host' ? <TransferHostControl triggerClassName={rowClass} /> : null}
          {gameCode && resumeToken ? <RotatePlayerCodeButton gameCode={gameCode} className={rotateRowClass} /> : null}
          {/* Straight to this game's trophies, pre-filtered. Finding "Whot" in a list of every
              game you've played is the kind of small friction that stops people looking at all. */}
          <TrophiesForThisGameLink gameCode={gameCode} className={rowClass} />
          <WhatsAppChannelLink className="w-full justify-center" />
        </GameSettingsCloseProvider>
      </HostLobbySettingsSheet>
    </>
  )
}
