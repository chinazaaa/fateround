import type { MonopolyBoard } from './types'

export function currentPlayerId(board: MonopolyBoard): string | null {
  const order = board.turn_order ?? []
  if (order.length === 0) return null
  return order[board.current_turn_index % order.length] ?? null
}

export function monopolyPhaseLabel(phase: MonopolyBoard['phase']): string {
  switch (phase) {
    case 'roll':
      return 'Roll'
    case 'buy':
      return 'Buy property'
    case 'jail':
      return 'In jail'
    case 'pay_rent':
      return 'Pay rent'
    case 'auction':
      return 'Auction'
    case 'raise_funds':
      return 'Raise funds'
    case 'finished':
      return 'Finished'
    default:
      return phase
  }
}

export function secondsUntilMonopolyDeadline(deadline: string | null | undefined): number {
  if (!deadline) return 0
  return Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000))
}
