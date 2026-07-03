import { describe, it, expect } from 'vitest'
import { getLegalMovesFromRemaining, getLegalMovesForSteps } from './ludo'
import type { LudoColor, LudoPiece, LudoPlayerState } from '@/types'

function state(color: LudoColor, pieces: LudoPiece[], id = `p-${color}`): LudoPlayerState {
  return { id: `s-${color}`, game_id: 'g', player_id: id, color, pieces, player_order: 0, created_at: '' }
}

/**
 * Regression: a stack of pieces on a SAFE square (a colour's ★ start, or a
 * mid-arm safe star) must not act as a blockade. Safe squares are shared ground
 * where any pieces coexist, so opponents parked there can never wall a player
 * out. Previously an opponent 2-stack on your start froze you: you couldn't
 * bring pieces onto the board and, if the yard held your only pieces, you had no
 * legal move at all.
 */
describe('safe-square stacks are not blockades', () => {
  it('lets a piece enter its own start even when opponents sit there on a blockade', () => {
    const green: LudoPiece[] = [0, 1, 2, 3].map((id) => ({ id, zone: 'base', pos: id }))
    const red: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 0 }, // green's start
      { id: 1, zone: 'track', pos: 0 },
    ]
    const states = [state('green', green, 'p-green'), state('red', red, 'p-red')]

    const moves = getLegalMovesFromRemaining('green', green, [6, 6], states, 'p-green')
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.some((m) => m.from.zone === 'base' && m.to.zone === 'track' && m.to.pos === 0)).toBe(true)
    // Landing on the safe start does not capture the opponents there.
    expect(moves.every((m) => m.captures === false)).toBe(true)
  })

  it('lets a piece pass through a safe square occupied by an opponent stack', () => {
    // Green piece just before the mid-arm safe star at index 8; a roll of 3 must
    // be able to pass the star (index 8) even with two blue pieces parked on it.
    const green: LudoPiece[] = [{ id: 0, zone: 'track', pos: 6 }]
    const blue: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 8 },
      { id: 1, zone: 'track', pos: 8 },
    ]
    const states = [state('green', green, 'p-green'), state('blue', blue, 'p-blue')]
    const moves = getLegalMovesForSteps('green', green, 3, states, 'p-green')
    expect(moves.some((m) => m.to.zone === 'track' && m.to.pos === 9)).toBe(true)
  })

  it('still blocks an opponent blockade on a NON-safe square', () => {
    const green: LudoPiece[] = [{ id: 0, zone: 'track', pos: 1 }]
    const red: LudoPiece[] = [
      { id: 0, zone: 'track', pos: 3 }, // non-safe
      { id: 1, zone: 'track', pos: 3 },
    ]
    const states = [state('green', green, 'p-green'), state('red', red, 'p-red')]
    // Roll of 2 would land on the opponent blockade at index 3 — must be illegal.
    const land = getLegalMovesForSteps('green', green, 2, states, 'p-green')
    expect(land.some((m) => m.to.zone === 'track' && m.to.pos === 3)).toBe(false)
    // Roll of 4 would pass through the blockade at index 3 — must be illegal too.
    const pass = getLegalMovesForSteps('green', green, 4, states, 'p-green')
    expect(pass.some((m) => m.to.zone === 'track' && m.to.pos === 5)).toBe(false)
  })
})
