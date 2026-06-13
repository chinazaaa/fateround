import type { Player } from '@/types'

/** Build a round-robin sequence of players for the hot seat. */
export function buildHotSeatSequence(players: Player[], roundCount: number): Player[] {
  if (players.length === 0) return []
  const shuffled = [...players].sort(() => Math.random() - 0.5)
  const sequence: Player[] = []
  for (let i = 0; i < roundCount; i++) {
    sequence.push(shuffled[i % shuffled.length])
  }
  return sequence
}

/** Auto-determine round count: one round per player, max 20. */
export function hotSeatAutoRoundCount(playerCount: number): number {
  return Math.min(Math.max(playerCount, 2), 20)
}

export interface HotSeatSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  text: string
  submission_type: 'compliment' | 'roast' | 'observation'
  created_at: string
}
