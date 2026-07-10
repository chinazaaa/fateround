import type { MahjongPlayerState, MahjongSession, Player } from './types'

export interface MahjongStateResponse {
  session: MahjongSession | null
  states: MahjongPlayerState[]
}

const RED_FIVES = ['m5r', 'p5r', 's5r'] as const

export function mahjongTileBase(tile: string): string {
  return RED_FIVES.includes(tile as (typeof RED_FIVES)[number]) ? tile.slice(0, 2) : tile
}

export function mahjongTileShortLabel(tile: string): string {
  const base = mahjongTileBase(tile)
  if (/^[mps][1-9]$/.test(base)) {
    const suit = base[0]
    const suffix = suit === 'm' ? 'M' : suit === 'p' ? 'D' : 'B'
    return `${base[1]}${suffix}${tile !== base ? 'r' : ''}`
  }
  if (tile === 'we') return 'East'
  if (tile === 'ws') return 'South'
  if (tile === 'ww') return 'West'
  if (tile === 'wn') return 'North'
  if (tile === 'dr') return 'Red'
  if (tile === 'dg') return 'Green'
  if (tile === 'dw') return 'White'
  return tile
}

export function currentMahjongPlayerId(session: MahjongSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  return order[session.current_turn_index % order.length] ?? null
}

export function mahjongSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((Date.parse(deadlineAt) - Date.now()) / 1000))
}

export function stateFor(states: MahjongPlayerState[], playerId: string): MahjongPlayerState | null {
  return states.find((s) => s.player_id === playerId) ?? null
}

export function playerName(players: Pick<Player, 'id' | 'name'>[], playerId: string | null | undefined): string {
  if (!playerId) return 'Player'
  return players.find((p) => p.id === playerId)?.name ?? 'Player'
}

export function mahjongPhaseLabel(phase: MahjongSession['phase']): string {
  switch (phase) {
    case 'draw':
      return 'Draw'
    case 'discard':
      return 'Discard'
    case 'claim':
      return 'Claim window'
    case 'finished':
      return 'Hand over'
    default:
      return phase
  }
}

export function sortMahjongTiles(tiles: string[]): string[] {
  const order = (tile: string) => {
    const base = mahjongTileBase(tile)
    const suits = 'mpswdgfe'
    const si = suits.indexOf(base[0] ?? '')
    const num = parseInt(base.slice(1), 10) || 0
    return (si === -1 ? 999 : si * 10 + num) + (tile !== base ? 0.1 : 0)
  }
  return [...tiles].sort((a, b) => order(a) - order(b))
}

export type { MahjongPlayerState, MahjongSession }
