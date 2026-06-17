'use client'

import { Avatar } from '@/components/Avatar'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'

export function PlayerSessionBar({
  gameCode,
  playerId,
  name,
  viewerBanner,
  onRenamed,
  onLeft,
  onChangeName,
  changeNameLabel,
  inLobby = false,
  showControls = true,
}: {
  gameCode: string
  playerId: string
  name: string | null | undefined
  viewerBanner?: React.ReactNode
  onRenamed: (newName: string) => void
  onLeft: () => void
  onChangeName?: () => void
  changeNameLabel?: string
  inLobby?: boolean
  showControls?: boolean
}) {
  if (!name && !viewerBanner) return null

  return (
    <div className="mb-4 space-y-3">
      {name ? (
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/8">
          <Avatar name={name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-faint leading-none">Playing as</p>
            <p className="text-sm font-semibold truncate">{name}</p>
          </div>
        </div>
      ) : null}
      {viewerBanner}
      {showControls && playerId && name ? (
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={playerId}
          currentName={name}
          onRenamed={onRenamed}
          onLeft={onLeft}
          onChangeName={onChangeName}
          changeNameLabel={changeNameLabel}
          inLobby={inLobby}
        />
      ) : null}
    </div>
  )
}
