export const HOT_SEAT_SUBMISSION_TYPES = [
  { type: 'compliment' as const, emoji: '💛', label: 'Compliment' },
  { type: 'roast' as const, emoji: '🔥', label: 'Roast' },
  { type: 'observation' as const, emoji: '👀', label: 'Observation' },
]

export type HotSeatSubmissionType = (typeof HOT_SEAT_SUBMISSION_TYPES)[number]['type']

export interface HotSeatSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  text: string
  submission_type: HotSeatSubmissionType
  created_at: string
}

export function hotSeatPlayerDisplayName(
  submitterPlayerId: string | null | undefined,
  players: { id: string; name: string; participant_id?: string | null }[],
  participants: { id: string; name: string }[]
): string {
  if (!submitterPlayerId) return 'Someone'

  const player = players.find((p) => p.id === submitterPlayerId)
  if (player) return player.name

  const participant = participants.find((p) => p.id === submitterPlayerId)
  if (participant) {
    const linked = players.find((p) => p.participant_id === participant.id)
    return linked?.name ?? participant.name
  }

  return 'Someone'
}
