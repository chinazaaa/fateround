'use client'

import { RoomVoiceRail } from '@/components/rooms/RoomVoiceRail'
import { useHostIdentity, useHostDisplayName } from '@/hooks/useHostVoiceIdentity'

/**
 * Design-system room shell for card-table / voice game HOST views — the host
 * counterpart to the player page's `VoiceRoomShell` (`src/app/game/[code]/page.tsx`).
 *
 * Owns the top chrome (`RoomVoiceRail variant="topbar"` in host mode — 👑 Host
 * badge + room code + mic) and the responsive two-pane layout: a centred
 * `.pr-stage` for the phase content and a desktop-only `.pr-side` that holds the
 * host's player-manage list + phase controls + host toolbar (mirroring the
 * `Host · Desktop.html` `.desk-side`). Below 1024px `.pr-side` is hidden and the
 * same controls render inline in the stage (the caller passes them there too).
 *
 * The marketing header + floating host voice are intentionally absent here
 * (scoped out in `HostChromeGate` for room games), so this rail is the
 * room's only chrome.
 */
export function HostRoomShell({
  gameCode,
  hostToken,
  gameName,
  sideContent,
  children,
}: {
  gameCode: string
  hostToken: string
  /** Game name shown beside the room code in the top rail. */
  gameName?: string | null
  /** Desktop-only side rail body (manage list + controls). Hidden < 1024px. */
  sideContent?: React.ReactNode
  children: React.ReactNode
}) {
  const hostIdentity = useHostIdentity(gameCode)
  const hostName = useHostDisplayName(gameCode)

  return (
    <div className="fr-room fr-room-poll" data-game-room>
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
      />
      <div className="pr-main">
        <div className="pr-stage">{children}</div>
        {sideContent != null && <aside className="pr-side host-pr-side">{sideContent}</aside>}
      </div>
    </div>
  )
}
