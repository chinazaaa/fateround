'use client'

import { useState, type ReactNode } from 'react'
import { ShareSheet } from '@/components/rooms/sheets'
import { TransferHostControl } from '@/components/TransferHostControl'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import { CardTableSettingsSheet } from '@/components/rooms/card-table/CardTableSettingsSheet'

/**
 * Card-table host control cluster (design `.host-toolbar`): a HOST CONTROLS
 * caption + a Host + play / Host only tag, then Settings · Transfer · Share ·
 * End game. Settings opens a *dismissible* sheet (never the old blocking page).
 * Reused in the desktop side rail and the mobile control bar.
 */
export function CardTableHostControls({
  gameCode,
  hostToken,
  hostPlays,
  onModeChange,
  onEnded,
  modeLocked,
  settingsBody,
}: {
  gameCode: string
  hostToken: string
  hostPlays: boolean
  onModeChange: (mode: 'player' | 'spectator') => void
  onEnded: () => void | Promise<unknown>
  /** Disable the play-as-yourself toggle (host has no spot + game started). */
  modeLocked?: boolean
  /** Game-specific rules embedded in the settings sheet. */
  settingsBody?: ReactNode
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  return (
    <>
      <div className="host-controlcap">
        Host controls
        <span className="host-tag" style={{ marginLeft: 'auto' }}>
          🎮 {hostPlays ? 'Host + play' : 'Host only'}
        </span>
      </div>
      <div className="host-toolbar">
        <button type="button" onClick={() => setSettingsOpen(true)}>
          ⚙︎ Settings
        </button>
        <TransferHostControl triggerClassName="ct-host-tool-btn" />
        <button type="button" onClick={() => setShareOpen(true)}>
          ↗ Share
        </button>
        <HostEndGameButton
          gameCode={gameCode}
          hostToken={hostToken}
          onEnded={onEnded}
          label="End game"
          icon={<ExitIcon size={13} />}
          className="host-toolbar-end"
          confirmTitle="End this game early?"
          confirmMessage="The current game will end and players will see the results screen."
        />
      </div>

      <CardTableSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        hostPlays={hostPlays}
        onModeChange={onModeChange}
        modeLocked={modeLocked}
      >
        {settingsBody}
      </CardTableSettingsSheet>
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} host code={gameCode} hostToken={hostToken} />
    </>
  )
}
