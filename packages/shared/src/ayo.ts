import type { AyoSession, AyoSide } from './types'

export const AYO_PIT_COUNT = 12
export const AYO_PITS_PER_SIDE = 6

export function sideOfPit(pit: number): AyoSide {
  return pit < AYO_PITS_PER_SIDE ? 'a' : 'b'
}

export function sideForPlayer(session: AyoSession, playerId: string): AyoSide | null {
  if (session.player_a_id === playerId) return 'a'
  if (session.player_b_id === playerId) return 'b'
  return null
}

export function currentTurnPlayerId(session: AyoSession): string {
  return session.current_turn === 'a' ? session.player_a_id : session.player_b_id
}

export function activePitIndices(side: AyoSide, aRowSize: number, bRowSize: number): number[] {
  const start = side === 'a' ? 0 : AYO_PITS_PER_SIDE
  const rowSize = side === 'a' ? aRowSize : bRowSize
  return Array.from({ length: rowSize }, (_, i) => start + i)
}

export function legalMovesForSide(pits: number[], side: AyoSide, aRowSize: number, bRowSize: number): number[] {
  return activePitIndices(side, aRowSize, bRowSize).filter((pit) => pits[pit] > 0)
}

export function ayoScores(session: Pick<AyoSession, 'captured_a' | 'captured_b'>): { a: number; b: number } {
  return { a: session.captured_a, b: session.captured_b }
}
