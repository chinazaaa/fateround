'use client'

import { useState } from 'react'
import { GearIcon } from '@/components/rooms/icons'
import { HostLobbySettingsSheet } from '@/components/host/HostLobbySettingsSheet'
import { TransferHostControl } from '@/components/TransferHostControl'
import { WhatsAppChannelLink } from '@/components/WhatsAppChannelLink'
import { useGameSettingsContent } from '@/components/GameSettingsContext'

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
  // host game settings, edit name, end game) — mirrors the mobile host settings sheet.
  const gameSettings = useGameSettingsContent()

  const rowClass =
    'flex w-full items-center justify-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] px-3.5 py-3 text-sm font-semibold text-body transition-colors hover:text-[var(--foreground)]'

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
        {gameSettings}
        {role === 'host' ? <TransferHostControl triggerClassName={rowClass} /> : null}
        <WhatsAppChannelLink className="w-full justify-center" />
      </HostLobbySettingsSheet>
    </>
  )
}
