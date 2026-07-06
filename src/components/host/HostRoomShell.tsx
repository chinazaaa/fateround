'use client'

import { RoomVoiceRail } from '@/components/rooms/RoomVoiceRail'
import { useHostIdentity, useHostDisplayName } from '@/hooks/useHostVoiceIdentity'

/**
 * Design-system room shell for card-table / voice game HOST views — the host
 * counterpart to the player page's `VoiceRoomShell` (`src/app/game/[code]/page.tsx`).
 *
 * Owns the top chrome (`RoomVoiceRail variant="topbar"` in host mode — 👑 Host
 * badge + room code + mic) and the responsive two-pane layout: a centred
 * `.pr-stage` for the phase content. The host controls render inline in the
 * stage (the caller passes them above the play surface).
 *
 * The marketing header + floating host voice are intentionally absent here
 * (scoped out in `HostChromeGate` for room games), so this rail is the
 * room's only chrome.
 */
export function HostRoomShell({
  gameCode,
  hostToken,
  resumeToken,
  gameName,
  onEndGame,
  onSettings,
  hostMenuExtra,
  onEditName,
  children,
}: {
  gameCode: string
  hostToken: string
  /** The host's own player resume token — enables the host+play share link. */
  resumeToken?: string
  /** Game name shown beside the room code in the top rail. */
  gameName?: string | null
  /** Host: end the game (surfaced in the voice rail's ⋯ menu). */
  onEndGame?: () => void
  /** Host: open the game settings sheet (⚙ icon in the rail). */
  onSettings?: () => void
  /** Host: extra ⋯-menu items (e.g. Transfer host). */
  hostMenuExtra?: React.ReactNode
  /** Persist a new host display name (⋯ menu → Edit your name). */
  onEditName?: (name: string) => void
  children: React.ReactNode
}) {
  const hostIdentity = useHostIdentity(gameCode)
  const hostName = useHostDisplayName(gameCode)

  return (
    <div className="fr-room fr-room-poll" data-game-room data-host-room>
      {/* Design-system top voice rail — the host's room chrome (room code ·
          game name · 👑 Host · players · mic). `autoRejoin={false}` matches the
          join-first player rail. */}
      <RoomVoiceRail
        variant="topbar"
        roomCode={gameCode}
        label={gameName ?? undefined}
        playerName={hostName}
        identity={hostIdentity}
        auth={{ kind: 'host', token: hostToken }}
        host
        hostBadge
        autoRejoin={false}
        resumeToken={resumeToken}
        onEndGame={onEndGame}
        onSettings={onSettings}
        hostMenuExtra={hostMenuExtra}
        onEditName={onEditName}
      />
      <div className="pr-main">
        <div className="pr-stage">{children}</div>
      </div>
    </div>
  )
}
