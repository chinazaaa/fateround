'use client'

import { useState } from 'react'
import { GearIcon } from '@/components/rooms/icons'
import { HostLobbySettingsSheet } from '@/components/host/HostLobbySettingsSheet'
import { NotificationToggle } from '@/components/NotificationToggle'
import { TransferHostControl } from '@/components/TransferHostControl'
import { WhatsAppChannelLink } from '@/components/WhatsAppChannelLink'

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

      <HostLobbySettingsSheet open={open} onClose={() => setOpen(false)} title="Settings">
        {role === 'host' ? (
          <TransferHostControl triggerClassName={rowClass} />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-body">Game alerts</p>
              <p className="text-xs text-muted">Get notified when the game starts, restarts, or ends</p>
            </div>
            <NotificationToggle gameCode={gameCode} resumeToken={resumeToken} />
          </div>
        )}
        <WhatsAppChannelLink className="w-full justify-center" />
      </HostLobbySettingsSheet>
    </>
  )
}
