import { gameTypeConfig } from '@/lib/game-types'

export type RoomGame = {
  id: string
  game_id: string
  created_at: string
  started_by_member_id: string | null
  room_members: { display_name: string } | null
  games: { title: string; game_type: string; status: string } | null
}

export function roomGameDisplay(game: RoomGame) {
  const config = game.games?.game_type ? gameTypeConfig(game.games.game_type) : null
  const typeLabel = config?.label ?? 'Game'
  const emoji = config?.card.emoji ?? '🎮'
  const title = game.games?.title?.trim()
  const startedBy = game.room_members?.display_name
  const status = game.games?.status ?? 'unknown'
  const titleLine = title && title.toLowerCase() !== typeLabel.toLowerCase() ? title : null

  return {
    typeLabel,
    emoji,
    titleLine,
    startedBy,
    status,
    isLive: status === 'waiting' || status === 'active',
    isFinished: status === 'finished',
  }
}

export function roomGameStatusLabel(status: string) {
  if (status === 'waiting') return 'In lobby'
  if (status === 'active') return 'In progress'
  if (status === 'finished') return 'Finished'
  return status
}

export const OPEN_IN_NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const

export function roomGameBannerDetails(game: RoomGame) {
  const info = roomGameDisplay(game)
  const subtitleParts: string[] = []
  if (info.titleLine) subtitleParts.push(info.titleLine)
  if (info.startedBy) subtitleParts.push(`Started by ${info.startedBy}`)

  return {
    emoji: info.emoji,
    headline: `${info.typeLabel} is starting!`,
    subtitle: subtitleParts.join(' · ') || null,
  }
}
