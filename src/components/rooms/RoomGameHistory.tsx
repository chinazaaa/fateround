import Link from 'next/link'
import {
  OPEN_IN_NEW_TAB,
  roomGameDisplay,
  roomGameStatusLabel,
  type RoomGame,
} from '@/components/rooms/room-game-display'
import { gamePathWithRoomMember } from '@/lib/room-member-join'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function RoomGameHistory({
  games,
  memberCode,
}: {
  games: RoomGame[]
  memberCode?: string | null
}) {
  if (games.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-faint text-sm text-center px-4">
          Your game history will appear here after you start your first game from this room.
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      {games.map((g) => {
        const info = roomGameDisplay(g)
        return (
          <div key={g.id} className="flex items-center gap-3 py-3 px-3">
            <span className="text-2xl shrink-0">{info.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-body text-sm truncate">{info.typeLabel}</p>
              <p className="text-xs text-faint truncate">
                {formatDate(g.created_at)}
                {` · ${roomGameStatusLabel(info.status)}`}
                {info.titleLine && ` · ${info.titleLine}`}
                {info.startedBy && ` · ${info.startedBy}`}
              </p>
            </div>
            {info.isFinished ? (
              <Link
                href={gamePathWithRoomMember(g.game_id, memberCode)}
                className="btn-secondary btn-fit shrink-0 px-3 py-1.5 text-xs"
                {...OPEN_IN_NEW_TAB}
              >
                Results
              </Link>
            ) : (
              <Link
                href={gamePathWithRoomMember(g.game_id, memberCode)}
                className="btn-primary btn-fit shrink-0 px-3 py-1.5 text-xs"
                {...OPEN_IN_NEW_TAB}
              >
                Join
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}
