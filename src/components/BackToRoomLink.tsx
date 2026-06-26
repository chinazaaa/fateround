'use client'

import Link from 'next/link'
import { useGameRoom } from '@/hooks/useGameRoom'

type Props = {
  gameCode: string | null
  className?: string
  compact?: boolean
}

export function BackToRoomLink({ gameCode, className = '', compact = false }: Props) {
  const { roomCode } = useGameRoom(gameCode)
  if (!roomCode) return null

  return (
    <Link
      href={`/room/${roomCode}`}
      className={[
        compact ? 'btn-secondary text-xs py-1.5 px-2.5 whitespace-nowrap' : 'btn-secondary w-full text-center',
        className,
      ].join(' ')}
    >
      ← Back to room
    </Link>
  )
}
