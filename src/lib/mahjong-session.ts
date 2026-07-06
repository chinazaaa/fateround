import type { MahjongPlayerState, MahjongSession, Player } from '@/types'

export function currentMahjongPlayerId(session: MahjongSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  return order[session.current_turn_index % order.length] ?? null
}

export function mahjongTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function mahjongSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function nextTurnIndexAfter(session: MahjongSession, playerId: string): number {
  const index = session.turn_order.indexOf(playerId)
  if (index === -1) return (session.current_turn_index + 1) % session.turn_order.length
  return (index + 1) % session.turn_order.length
}

export function stateFor(states: MahjongPlayerState[], playerId: string): MahjongPlayerState | null {
  return states.find((s) => s.player_id === playerId) ?? null
}

export function playerName(players: Pick<Player, 'id' | 'name'>[], playerId: string | null | undefined): string {
  if (!playerId) return 'Player'
  return players.find((p) => p.id === playerId)?.name ?? 'Player'
}

export function turnDistanceAfterDiscard(session: MahjongSession, playerId: string): number {
  if (!session.last_discard) return Number.MAX_SAFE_INTEGER
  const discardIndex = session.turn_order.indexOf(session.last_discard.player_id)
  const playerIndex = session.turn_order.indexOf(playerId)
  if (discardIndex === -1 || playerIndex === -1) return Number.MAX_SAFE_INTEGER
  return (playerIndex - discardIndex + session.turn_order.length) % session.turn_order.length
}
