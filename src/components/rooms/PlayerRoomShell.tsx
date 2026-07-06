'use client'

import { RoomVoiceRail } from '@/components/rooms/RoomVoiceRail'

/**
 * Design-system room shell for card-table / voice game PLAYER views — the player
 * counterpart to `HostRoomShell` (`src/components/host/HostRoomShell.tsx`).
 *
 * Provides the room container the play surface needs: the `.fr-room fr-room-poll`
 * responsive frame (phone frame on mobile · centred stage on desktop, styled in
 * `fate-round-rooms.css` / `fate-round-cardtable.css`), the top voice rail as the
 * room's chrome, and the `.pr-main` → `.pr-stage` layout the `.ct-surface` mounts
 * into.
 *
 * On dev this framing lived globally in `game/[code]/page.tsx`'s `VoiceRoomShell`;
 * here it is scoped to the Whot player view so no other game is re-chromed.
 */
export function PlayerRoomShell({
  gameCode,
  gameName,
  playerName,
  playerId,
  children,
}: {
  gameCode: string
  /** Game name shown beside the room code in the top rail. */
  gameName?: string | null
  /** Player display name — drives the voice rail (only mounts once known). */
  playerName?: string | null
  /** Player id — the voice identity + gate for mounting the rail. */
  playerId?: string | null
  children: React.ReactNode
}) {
  const joined = !!playerName && !!playerId

  return (
    <div className="fr-room fr-room-poll" data-game-room>
      {/* Design-system top voice rail — the player's room chrome (room code ·
          game name · watching · players · mic). `autoRejoin={false}` matches the
          join-first flow. Only mounts once the player has a session. */}
      {joined && (
        <RoomVoiceRail
          variant="topbar"
          roomCode={gameCode}
          label={gameName ?? undefined}
          playerName={playerName!}
          identity={playerId!}
          auth={{ kind: 'player' }}
          autoRejoin={false}
        />
      )}
      <div className="pr-main">
        <div className="pr-stage">{children}</div>
      </div>
    </div>
  )
}
