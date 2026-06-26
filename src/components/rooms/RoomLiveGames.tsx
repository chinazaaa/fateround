import Link from 'next/link'
import {
  OPEN_IN_NEW_TAB,
  roomGameDisplay,
  roomGameStatusLabel,
  type RoomGame,
} from '@/components/rooms/room-game-display'
import { gamePathWithRoomMember } from '@/lib/room-member-join'

export function RoomLiveGames({ games, memberCode }: { games: RoomGame[]; memberCode?: string | null }) {
  const liveGames = games.filter((g) => roomGameDisplay(g).isLive)

  if (liveGames.length === 0) return null

  return (
    <div className="shrink-0 border-b border-[var(--border)] bg-[var(--primary)]/5 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
        </span>
        <p className="label-caps text-[var(--primary)]">Live now</p>
      </div>
      <div className="space-y-2">
        {liveGames.map((g) => {
          const info = roomGameDisplay(g)
          return (
            <div
              key={g.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
            >
              <span className="text-xl shrink-0">{info.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-body truncate">{info.typeLabel}</p>
                <p className="text-xs text-faint truncate">
                  {roomGameStatusLabel(info.status)}
                  {info.titleLine && ` · ${info.titleLine}`}
                  {info.startedBy && ` · ${info.startedBy}`}
                </p>
              </div>
              <Link
                href={gamePathWithRoomMember(g.game_id, memberCode)}
                className="btn-primary btn-fit shrink-0 px-3 py-1.5 text-xs"
                {...OPEN_IN_NEW_TAB}
              >
                Join
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
