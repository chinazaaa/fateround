'use client'

/**
 * Design-system room frame for card-table game PLAYER views — the player
 * counterpart to `HostRoomShell` (`src/components/host/HostRoomShell.tsx`).
 *
 * Provides the responsive `.fr-room fr-room-poll` frame (phone frame on mobile ·
 * centred stage on desktop) with the `.pr-main` → `.pr-stage` layout the
 * `.ct-surface` mounts into. The room's chrome is the app's fixed top header
 * (`GamePlayerChrome` — logo · roster · Share · ⚙ Settings) plus the shared green
 * floating Join-voice pill; no separate in-room voice/header bar.
 */
export function PlayerRoomShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fr-room fr-room-poll" data-game-room>
      <div className="pr-main">
        <div className="pr-stage">{children}</div>
      </div>
    </div>
  )
}
