'use client'

/**
 * Design-system room frame for card-table game HOST views — the host counterpart
 * to the player page's `PlayerRoomShell`.
 *
 * Provides the responsive `.fr-room fr-room-poll` frame (phone frame on mobile ·
 * centred stage on desktop) with the `.pr-main` → `.pr-stage` layout the
 * `.ct-surface` mounts into. The room's chrome is the app's fixed top header
 * (`GameHostChrome` — logo · roster · Share · ⚙ Settings) plus the shared green
 * floating Join-voice pill; the host game settings, edit name and end game live
 * behind that header's ⚙ gear (registered via `GameSettingsContext`), mirroring
 * the mobile host settings sheet. No separate in-room voice/header bar.
 */
export function HostRoomShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fr-room fr-room-poll" data-game-room data-host-room>
      <div className="pr-main">
        <div className="pr-stage">{children}</div>
      </div>
    </div>
  )
}
